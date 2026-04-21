package handler_test

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/permission"
	"backend/internal/queue"
	"backend/internal/route"
	"backend/internal/sqlc"
	"backend/internal/utils"

	awscreds "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/alicebob/miniredis/v2"
	awscfg "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/bytemare/ksf"
	"github.com/bytemare/opaque"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/stretchr/testify/require"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"golang.org/x/crypto/nacl/box"
)

const (
	testS3AccessKey = "minioadmin"
	testS3SecretKey = "minioadmin"
	testS3Bucket    = "testbucket"
)

var testPool *pgxpool.Pool
var testMiniRedis *miniredis.Miniredis
var userCounter atomic.Int64
var sessionCounter atomic.Int64

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	ctx := context.Background()

	// Generate Ed25519 JWT keys.
	jwtPub, jwtPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal("jwt keygen:", err)
	}

	// Generate OPAQUE keys (same config as cmd/setup/main.go).
	opaqueCfg := opaque.Configuration{
		OPRF:    opaque.P256Sha256,
		KDF:     crypto.SHA256,
		MAC:     crypto.SHA256,
		Hash:    crypto.SHA256,
		KSF:     ksf.Argon2id,
		AKE:     opaque.P256Sha256,
		Context: nil,
	}
	oprfSeed := opaqueCfg.GenerateOPRFSeed()
	svrPriv, svrPub := opaqueCfg.KeyGen()

	// Start miniredis for Redis.
	mr, err := miniredis.Run()
	if err != nil {
		log.Fatal("miniredis:", err)
	}
	testMiniRedis = mr
	defer mr.Close()

	// Start MinIO testcontainer (replaces the httptest mock S3).
	minioContainer, err := tcminio.Run(ctx,
		"minio/minio:RELEASE.2024-01-16T16-07-38Z",
		tcminio.WithUsername(testS3AccessKey),
		tcminio.WithPassword(testS3SecretKey),
	)
	if err != nil {
		log.Fatal("minio container:", err)
	}
	defer minioContainer.Terminate(ctx) //nolint:errcheck

	minioHost, err := minioContainer.Host(ctx)
	if err != nil {
		log.Fatal("minio host:", err)
	}
	minioPort, err := minioContainer.MappedPort(ctx, "9000/tcp")
	if err != nil {
		log.Fatal("minio port:", err)
	}
	minioEndpoint := fmt.Sprintf("http://%s:%s", minioHost, minioPort.Port())

	// Create test bucket in MinIO via the AWS SDK v2.
	s3Setup := s3.NewFromConfig(awscfg.Config{
		Region: "us-east-1",
		Credentials: awscfg.NewCredentialsCache(
			awscreds.NewStaticCredentialsProvider(testS3AccessKey, testS3SecretKey, ""),
		),
	}, func(o *s3.Options) {
		o.UsePathStyle = true
		o.BaseEndpoint = awscfg.String(minioEndpoint)
	})
	if _, err := s3Setup.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: awscfg.String(testS3Bucket),
	}); err != nil {
		log.Fatal("create bucket:", err)
	}

	// Start PostgreSQL testcontainer.
	pgContainer, err := tcpostgres.Run(ctx,
		"docker.io/postgres:16-alpine",
		tcpostgres.WithDatabase("testdb"),
		tcpostgres.WithUsername("test"),
		tcpostgres.WithPassword("test"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		log.Fatal("postgres container:", err)
	}
	defer pgContainer.Terminate(ctx) //nolint:errcheck

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatal("connection string:", err)
	}

	// Set all env vars before config.LoadConfig reads them.
	os.Setenv("JWT_PUBLIC_KEY", base64.StdEncoding.EncodeToString(jwtPub))
	os.Setenv("JWT_PRIVATE_KEY", base64.StdEncoding.EncodeToString(jwtPriv))
	os.Setenv("JWT_AUDIENCE", "vault-test")
	os.Setenv("JWT_ISSUER", "vault-test")
	os.Setenv("OPAQUE_CONFIG", base64.StdEncoding.EncodeToString(opaqueCfg.Serialize()))
	os.Setenv("OPAQUE_SERVER_ID", "vault-test")
	os.Setenv("OPAQUE_OPRF_SEED", base64.StdEncoding.EncodeToString(oprfSeed))
	os.Setenv("OPAQUE_SERVER_PRIVATE_KEY", base64.StdEncoding.EncodeToString(svrPriv))
	os.Setenv("OPAQUE_SERVER_PUBLIC_KEY", base64.StdEncoding.EncodeToString(svrPub))
	os.Setenv("REDIS_ADDR", mr.Addr())
	os.Setenv("S3_ENDPOINT", minioEndpoint)
	os.Setenv("S3_ACCESS_KEY_ID", testS3AccessKey)
	os.Setenv("S3_SECRET_ACCESS_KEY", testS3SecretKey)
	os.Setenv("S3_BUCKET_NAME", testS3Bucket)
	os.Setenv("DATABASE_URL", connStr)
	os.Setenv("CORS_ORIGIN", "*")

	if err := config.LoadConfig(); err != nil {
		log.Fatal("config load:", err)
	}
	if err := config.InitOpaque(); err != nil {
		log.Fatal("opaque init:", err)
	}
	config.InitS3()
	config.InitRedis()

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		log.Fatal("pgxpool:", err)
	}
	defer pool.Close()
	testPool = pool

	// Apply goose migrations.
	if err := db.Migrate(ctx, stdlib.OpenDBFromPool(pool)); err != nil {
		log.Fatal("goose migrate:", err)
	}
	db.Init(pool)

	// Apply River schema migrations.
	riverMigrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		log.Fatal("rivermigrate new:", err)
	}
	if _, err := riverMigrator.Migrate(ctx, rivermigrate.DirectionUp, &rivermigrate.MigrateOpts{}); err != nil {
		log.Fatal("river migrate:", err)
	}

	// Start River queue (needed for DeleteFile/DeleteFolder/DeleteAccount).
	if err := queue.Init(pool); err != nil {
		log.Fatal("queue init:", err)
	}
	defer queue.Stop() //nolint:errcheck

	gin.SetMode(gin.TestMode)

	return m.Run()
}

// newRouter creates a fresh Gin engine with the full route set.
func newRouter() *gin.Engine {
	r := gin.New()
	route.SetupRoutes(r)
	return r
}

// testUser bundles a created user with its auth token.
type testUser struct {
	User  sqlc.User
	Token string // "Bearer <jwt>"
}

// mustCreateTestUser inserts a user row (with root folder) and returns a testUser.
func mustCreateTestUser(t *testing.T, perm int64) testUser {
	t.Helper()
	ctx := context.Background()
	q := sqlc.New(testPool)

	n := userCounter.Add(1)
	username := fmt.Sprintf("testuser%d", n)
	email := fmt.Sprintf("test%d@example.com", n)

	// Generate a valid NaCl curve25519 key pair for the user (audit log encryption).
	pubKey, _, err := box.GenerateKey(rand.Reader)
	require.NoError(t, err)

	user, err := q.NewUser(ctx, sqlc.NewUserParams{
		Email:                email,
		Username:             username,
		OpaqueRecord:         []byte("fake-opaque-record"),
		CredentialIdentifier: []byte("fake-credential-id"),
		Permission:           perm,
		Capacity:             10 * 1024 * 1024 * 1024,
		KdfSalt:              make([]byte, 32),
		KdfMemoryCost:        64 * 1024,
		KdfTimeCost:          3,
		KdfParallelism:       1,
		PublicKey:            pubKey[:],
		EncryptedPrivateKey:  make([]byte, 64),
		RootFolder:           pgtype.Int8{Valid: false},
	})
	require.NoError(t, err)

	// Create root folder and attach it to the user.
	folder, err := q.NewFolder(ctx, sqlc.NewFolderParams{
		EncryptedMetadata: []byte("root-meta"),
		OwnerID:           user.ID,
	})
	require.NoError(t, err)

	err = q.SetRootFolder(ctx, sqlc.SetRootFolderParams{
		ID:         user.ID,
		RootFolder: pgtype.Int8{Valid: true, Int64: folder.ID},
	})
	require.NoError(t, err)

	user, err = q.GetUser(ctx, user.ID)
	require.NoError(t, err)

	token, err := utils.NewToken(user.ID, perm, 5*time.Minute)
	require.NoError(t, err)

	return testUser{User: user, Token: "Bearer " + token}
}

func createTestUser(t *testing.T) testUser {
	return mustCreateTestUser(t, permission.User)
}

func createAdminUser(t *testing.T) testUser {
	return mustCreateTestUser(t, permission.Admin)
}

// mustCreateFile inserts a file row directly (NewFile SQL omits parent_id, so raw INSERT).
func mustCreateFile(t *testing.T, ownerID int64, parentFolderID int64) sqlc.File {
	t.Helper()
	ctx := context.Background()
	var f sqlc.File
	row := testPool.QueryRow(ctx,
		`INSERT INTO files (owner_id, encrypted_metadata, encrypted_key, parent_id, chunks, chunk_size, size)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, owner_id, encrypted_metadata, encrypted_key, parent_id, chunks, chunk_size, size, created_at`,
		ownerID, []byte("enc-meta"), []byte("enc-key"), parentFolderID,
		int32(1), int64(1*1024*1024), int64(512*1024),
	)
	err := row.Scan(
		&f.ID, &f.OwnerID, &f.EncryptedMetadata, &f.EncryptedKey,
		&f.ParentID, &f.Chunks, &f.ChunkSize, &f.Size, &f.CreatedAt,
	)
	require.NoError(t, err)
	return f
}

// mustCreateSubfolder creates a subfolder under the given parent.
func mustCreateSubfolder(t *testing.T, ownerID int64, parentID int64) sqlc.Folder {
	t.Helper()
	ctx := context.Background()
	q := sqlc.New(testPool)
	folder, err := q.NewFolder(ctx, sqlc.NewFolderParams{
		EncryptedMetadata: []byte("sub-meta"),
		ParentID:          pgtype.Int8{Valid: true, Int64: parentID},
		OwnerID:           ownerID,
	})
	require.NoError(t, err)
	return folder
}

// issueRefreshToken inserts a session and returns its refresh token.
func issueRefreshToken(t *testing.T, userID int64) string {
	t.Helper()
	ctx := context.Background()
	q := sqlc.New(testPool)
	n := sessionCounter.Add(1)
	token := fmt.Sprintf("refresh-%d-%d", userID, n)
	_, err := q.NewSession(ctx, sqlc.NewSessionParams{
		RefreshToken: token,
		UserID:       userID,
		ExpiresAt:    pgtype.Timestamptz{Valid: true, Time: time.Now().Add(72 * time.Hour)},
	})
	require.NoError(t, err)
	return token
}

// mustCreateShare inserts a share row.
func mustCreateShare(t *testing.T, fileID, senderID, receiverID int64) sqlc.Share {
	t.Helper()
	ctx := context.Background()
	q := sqlc.New(testPool)
	share, err := q.NewShare(ctx, sqlc.NewShareParams{
		FileID:            fileID,
		SenderID:          senderID,
		ReceiverID:        receiverID,
		EncryptedFek:      []byte("enc-fek"),
		EncryptedMetadata: []byte("enc-share-meta"),
	})
	require.NoError(t, err)
	return share
}

// mustFindLatestFile returns the most recently created file for a given owner.
func mustFindLatestFile(t *testing.T, ownerID int64) sqlc.File {
	t.Helper()
	ctx := context.Background()
	var f sqlc.File
	row := testPool.QueryRow(ctx,
		`SELECT id, owner_id, encrypted_metadata, encrypted_key, parent_id, chunks, chunk_size, size, created_at
		 FROM files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1`,
		ownerID,
	)
	err := row.Scan(
		&f.ID, &f.OwnerID, &f.EncryptedMetadata, &f.EncryptedKey,
		&f.ParentID, &f.Chunks, &f.ChunkSize, &f.Size, &f.CreatedAt,
	)
	require.NoError(t, err)
	return f
}

// mustFindLatestChunkKey returns the S3 key of the most recently inserted file chunk for a file.
func mustFindLatestChunkKey(t *testing.T, fileID int64, chunkIndex int32) string {
	t.Helper()
	ctx := context.Background()
	var key string
	row := testPool.QueryRow(ctx,
		`SELECT s3_key FROM file_chunks WHERE file_id = $1 AND chunk_index = $2`,
		fileID, chunkIndex,
	)
	require.NoError(t, row.Scan(&key))
	return key
}

// doJSON performs a JSON request and returns the recorder.
func doJSON(t *testing.T, router *gin.Engine, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reqBody *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		reqBody = bytes.NewReader(b)
	} else {
		reqBody = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reqBody)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

// auth returns a headers map with the Authorization header set.
func auth(token string) map[string]string {
	return map[string]string{"Authorization": token}
}

// b64 encodes s as base64 raw URL (no padding) — the format expected by utils.Bytes.
func b64(s string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}

// flushRateLimits advances miniredis time past the auth rate-limit window (1 min)
// so subsequent requests to /auth/* routes are not throttled with 429.
func flushRateLimits(t *testing.T) {
	t.Helper()
	testMiniRedis.FastForward(61 * time.Second)
}
