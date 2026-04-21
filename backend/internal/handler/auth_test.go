package handler_test

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"backend/internal/sqlc"

	"github.com/bytemare/opaque"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/nacl/box"
)

// ─── OPAQUE test helpers ──────────────────────────────────────────────────────

// newOpaqueClient deserializes the OPAQUE configuration from the test environment
// and returns a fresh client instance.
func newOpaqueClient(t *testing.T) *opaque.Client {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(os.Getenv("OPAQUE_CONFIG"))
	require.NoError(t, err)
	cfg, err := opaque.DeserializeConfiguration(raw)
	require.NoError(t, err)
	clt, err := cfg.Client()
	require.NoError(t, err)
	return clt
}

// mustOpaqueRegister drives the full RegisterStart → RegisterFinish HTTP flow.
func mustOpaqueRegister(t *testing.T, username, email, password string) {
	t.Helper()
	flushRateLimits(t)
	clt := newOpaqueClient(t)

	// Step 1 – RegisterStart
	req := clt.RegistrationInit([]byte(password))
	wS := doJSON(t, newRouter(), http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code, "RegisterStart: %s", wS.Body)

	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	msgBytes, err := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["message"].(string))
	require.NoError(t, err)

	respMsg, err := clt.Deserialize.RegistrationResponse(msgBytes)
	require.NoError(t, err)

	// Bind the same identities that the server will use during LoginInit so the
	// envelope authentication tag is valid for subsequent logins.
	record, _ := clt.RegistrationFinalize(respMsg, opaque.ClientRegistrationFinalizeOptions{
		ClientIdentity: []byte(username),
		ServerIdentity: []byte(os.Getenv("OPAQUE_SERVER_ID")),
	})

	// Step 2 – RegisterFinish
	pubKey, _, err := box.GenerateKey(rand.Reader)
	require.NoError(t, err)

	wF := doJSON(t, newRouter(), http.MethodPost, "/auth/register/finish", map[string]any{
		"email":               email,
		"username":            username,
		"publicKey":           base64.RawURLEncoding.EncodeToString(pubKey[:]),
		"encryptedPrivateKey": b64("enc-priv-key"),
		"opaqueRecord":        base64.RawURLEncoding.EncodeToString(record.Serialize()),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
		"encryptedRootMetadata": b64("root-meta"),
	}, nil)
	require.Equal(t, http.StatusNoContent, wF.Code, "RegisterFinish: %s", wF.Body)
}

// mustOpaqueLogin drives the full LoginStart → LoginFinish HTTP flow and returns
// the issued refresh token.
func mustOpaqueLogin(t *testing.T, username, password string) string {
	t.Helper()
	flushRateLimits(t)
	clt := newOpaqueClient(t)
	serverID := os.Getenv("OPAQUE_SERVER_ID")

	// Step 1 – LoginStart
	ke1 := clt.LoginInit([]byte(password))
	wS := doJSON(t, newRouter(), http.MethodPost, "/auth/login/start", map[string]any{
		"username": username,
		"ke1":      base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code, "LoginStart: %s", wS.Body)

	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	rd := sd["data"].(map[string]any)
	ke2Bytes, err := base64.RawURLEncoding.DecodeString(rd["ke2"].(string))
	require.NoError(t, err)
	loginStateID := rd["loginStateID"].(string)

	ke2msg, err := clt.Deserialize.KE2(ke2Bytes)
	require.NoError(t, err)

	ke3, _, err := clt.LoginFinish(ke2msg, opaque.ClientLoginFinishOptions{
		ClientIdentity: []byte(username),
		ServerIdentity: []byte(serverID),
	})
	require.NoError(t, err)

	// Step 2 – LoginFinish
	wF := doJSON(t, newRouter(), http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3":          base64.RawURLEncoding.EncodeToString(ke3.Serialize()),
		"loginStateID": loginStateID,
	}, nil)
	require.Equal(t, http.StatusOK, wF.Code, "LoginFinish: %s", wF.Body)

	var ld map[string]any
	require.NoError(t, json.Unmarshal(wF.Body.Bytes(), &ld))
	return ld["data"].(map[string]any)["refreshToken"].(string)
}

// mustRefresh exchanges a refresh token for a JWT bearer string ("Bearer <token>").
func mustRefresh(t *testing.T, refreshToken string) string {
	t.Helper()
	w := doJSON(t, newRouter(), http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": refreshToken}, nil)
	require.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	return "Bearer " + resp["data"].(map[string]any)["token"].(string)
}

// uniqueOpaqueUsername returns a unique username / email pair for each test.
func uniqueOpaqueUsername() (username, email string) {
	n := userCounter.Add(1)
	return fmt.Sprintf("opaqueuser%d", n), fmt.Sprintf("opaque%d@example.com", n)
}

// ─── GetIdentity ─────────────────────────────────────────────────────────────

func TestGetIdentity(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/auth/get", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)

	assert.Equal(t, float64(user.User.ID), data["id"])
	assert.Equal(t, user.User.Username, data["username"])
	assert.Contains(t, data, "publicKey")
	assert.Contains(t, data, "rootFolder")
}

func TestGetIdentity_Unauthorized(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodGet, "/auth/get", nil, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

func TestRefresh(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	refreshToken := issueRefreshToken(t, user.User.ID)

	w := doJSON(t, router, http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": refreshToken}, nil)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.NotEmpty(t, data["token"])
	assert.NotEmpty(t, data["refreshToken"])
	assert.NotEqual(t, refreshToken, data["refreshToken"])
}

func TestRefresh_TokenRotated(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	refreshToken := issueRefreshToken(t, user.User.ID)

	w1 := doJSON(t, router, http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": refreshToken}, nil)
	require.Equal(t, http.StatusOK, w1.Code)

	// Original token is gone after rotation → 500 (ErrNoRows).
	w2 := doJSON(t, router, http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": refreshToken}, nil)
	assert.Equal(t, http.StatusInternalServerError, w2.Code)
}

func TestRefresh_Expired(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	ctx := context.Background()
	q := sqlc.New(testPool)
	expiredToken := "expired-refresh-token-" + user.User.Username
	_, err := q.NewSession(ctx, sqlc.NewSessionParams{
		RefreshToken: expiredToken,
		UserID:       user.User.ID,
		ExpiresAt:    pgtype.Timestamptz{Valid: true, Time: time.Now().Add(-time.Hour)},
	})
	require.NoError(t, err)

	w := doJSON(t, router, http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": expiredToken}, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRefresh_UnknownToken(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/refresh",
		map[string]any{"refreshToken": "does-not-exist-xyz"}, nil)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestRefresh_EmptyBody(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/refresh", nil, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ─── Registration ─────────────────────────────────────────────────────────────

func TestRegisterStart(t *testing.T) {
	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)
	username, _ := uniqueOpaqueUsername()

	req := clt.RegistrationInit([]byte("password"))
	w := doJSON(t, router, http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp["data"].(map[string]any)["message"])
}

func TestRegisterStart_InvalidBody(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/register/start", nil, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestRegisterStart_InvalidBlinded(t *testing.T) {
	flushRateLimits(t)
	router := newRouter()
	username, _ := uniqueOpaqueUsername()

	// Garbage bytes that cannot be deserialized as a RegistrationRequest.
	w := doJSON(t, router, http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  b64("not-a-valid-opaque-request"),
	}, nil)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestRegisterStart_RegistrationClosed(t *testing.T) {
	flushRateLimits(t)
	admin := createAdminUser(t)
	// Close registration and re-open it when the test ends.
	doJSON(t, newRouter(), http.MethodPatch, "/admin/site-config", map[string]any{
		"registrationOpen": false, "uploadExpirySeconds": 10800, "defaultUserCapacityBytes": 1 << 30,
	}, auth(admin.Token))
	t.Cleanup(func() {
		doJSON(t, newRouter(), http.MethodPatch, "/admin/site-config", map[string]any{
			"registrationOpen": true, "uploadExpirySeconds": 10800, "defaultUserCapacityBytes": 1 << 30,
		}, auth(admin.Token))
	})

	clt := newOpaqueClient(t)
	username, _ := uniqueOpaqueUsername()
	req := clt.RegistrationInit([]byte("pw"))
	w := doJSON(t, newRouter(), http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRegisterFinish(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	// mustOpaqueRegister asserts 204 on success.
	mustOpaqueRegister(t, username, email, "s3cr3t")
}

func TestRegisterFinish_InvalidOpaqueRecord(t *testing.T) {
	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)
	username, email := uniqueOpaqueUsername()

	// Complete RegisterStart so a credID exists in Redis.
	req := clt.RegistrationInit([]byte("pw"))
	wS := doJSON(t, router, http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)

	pubKey, _, _ := box.GenerateKey(rand.Reader)
	// Send garbage bytes as the opaqueRecord.
	w := doJSON(t, router, http.MethodPost, "/auth/register/finish", map[string]any{
		"email":               email,
		"username":            username,
		"publicKey":           base64.RawURLEncoding.EncodeToString(pubKey[:]),
		"encryptedPrivateKey": b64("enc-priv-key"),
		"opaqueRecord":        b64("not-a-valid-record"),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
		"encryptedRootMetadata": b64("root-meta"),
	}, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestRegisterFinish_NoCredentialID(t *testing.T) {
	// Call RegisterFinish without a prior RegisterStart → no credID in Redis → 500.
	flushRateLimits(t)
	router := newRouter()
	username, email := uniqueOpaqueUsername()

	clt := newOpaqueClient(t)
	req := clt.RegistrationInit([]byte("pw"))
	respMsg, _ := clt.Deserialize.RegistrationResponse(func() []byte {
		// Manually build a minimal RegistrationResponse by calling start for a
		// throwaway username, not the actual username, so Redis has no entry for it.
		throwaway, _ := uniqueOpaqueUsername()
		w := doJSON(t, newRouter(), http.MethodPost, "/auth/register/start", map[string]any{
			"username": throwaway,
			"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
		}, nil)
		var sd map[string]any
		json.Unmarshal(w.Body.Bytes(), &sd) //nolint:errcheck
		msgB, _ := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["message"].(string))
		return msgB
	}())
	require.NotNil(t, respMsg)

	record, _ := clt.RegistrationFinalize(respMsg)
	pubKey, _, _ := box.GenerateKey(rand.Reader)

	// Finish under the REAL username which has no credID in Redis.
	w := doJSON(t, router, http.MethodPost, "/auth/register/finish", map[string]any{
		"email":               email,
		"username":            username,
		"publicKey":           base64.RawURLEncoding.EncodeToString(pubKey[:]),
		"encryptedPrivateKey": b64("enc-priv-key"),
		"opaqueRecord":        base64.RawURLEncoding.EncodeToString(record.Serialize()),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
		"encryptedRootMetadata": b64("root-meta"),
	}, nil)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestRegisterFinish_DuplicateUsername(t *testing.T) {
	flushRateLimits(t)
	router := newRouter()
	username, email := uniqueOpaqueUsername()

	// First registration — succeeds.
	mustOpaqueRegister(t, username, email, "pw")

	// Second registration with the same username — duplicate key on users.username.
	clt := newOpaqueClient(t)
	req := clt.RegistrationInit([]byte("pw2"))
	wS := doJSON(t, router, http.MethodPost, "/auth/register/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	msgB, _ := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["message"].(string))
	respMsg, _ := clt.Deserialize.RegistrationResponse(msgB)
	record, _ := clt.RegistrationFinalize(respMsg)

	pubKey, _, _ := box.GenerateKey(rand.Reader)
	_, email2 := uniqueOpaqueUsername() // different email to isolate the username constraint
	w := doJSON(t, router, http.MethodPost, "/auth/register/finish", map[string]any{
		"email":               email2,
		"username":            username,
		"publicKey":           base64.RawURLEncoding.EncodeToString(pubKey[:]),
		"encryptedPrivateKey": b64("enc-priv-key"),
		"opaqueRecord":        base64.RawURLEncoding.EncodeToString(record.Serialize()),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
		"encryptedRootMetadata": b64("root-meta"),
	}, nil)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestRegisterFinish_RegistrationClosed(t *testing.T) {
	admin := createAdminUser(t)
	doJSON(t, newRouter(), http.MethodPatch, "/admin/site-config", map[string]any{
		"registrationOpen": false, "uploadExpirySeconds": 10800, "defaultUserCapacityBytes": 1 << 30,
	}, auth(admin.Token))
	t.Cleanup(func() {
		doJSON(t, newRouter(), http.MethodPatch, "/admin/site-config", map[string]any{
			"registrationOpen": true, "uploadExpirySeconds": 10800, "defaultUserCapacityBytes": 1 << 30,
		}, auth(admin.Token))
	})

	w := doJSON(t, newRouter(), http.MethodPost, "/auth/register/finish", map[string]any{
		"email": "closed@example.com", "username": "closeduser",
		"publicKey": b64("pk"), "encryptedPrivateKey": b64("epk"),
		"opaqueRecord": b64("rec"),
		"kdf": map[string]any{
			"salt": b64("s"), "memoryCost": int32(1), "timeCost": int32(1), "parallelism": int32(1),
		},
		"encryptedRootMetadata": b64("root"),
	}, nil)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

// ─── Login ────────────────────────────────────────────────────────────────────

func TestLoginStart(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")

	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)
	ke1 := clt.LoginInit([]byte("pw"))
	w := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username,
		"ke1":      base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.NotEmpty(t, data["ke2"])
	assert.NotEmpty(t, data["loginStateID"])
}

func TestLoginStart_UnknownUser(t *testing.T) {
	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)

	ke1 := clt.LoginInit([]byte("pw"))
	w := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": "nonexistentuser-xyz",
		"ke1":      base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestLoginStart_InvalidKE1(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")

	flushRateLimits(t)
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username,
		"ke1":      b64("not-a-valid-ke1-message"),
	}, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestLoginStart_EmptyBody(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/login/start", nil, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestLoginFinish(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "mypassword")

	// mustOpaqueLogin asserts 200 on success.
	refreshToken := mustOpaqueLogin(t, username, "mypassword")
	assert.NotEmpty(t, refreshToken)
}

func TestLoginFinish_ReturnsKDFAndKeys(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")

	flushRateLimits(t)
	router := newRouter()

	clt := newOpaqueClient(t)
	serverID := os.Getenv("OPAQUE_SERVER_ID")
	ke1 := clt.LoginInit([]byte("pw"))
	wS := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username, "ke1": base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	rd := sd["data"].(map[string]any)
	ke2B, _ := base64.RawURLEncoding.DecodeString(rd["ke2"].(string))
	ke2msg, _ := clt.Deserialize.KE2(ke2B)
	ke3, _, err := clt.LoginFinish(ke2msg, opaque.ClientLoginFinishOptions{
		ClientIdentity: []byte(username),
		ServerIdentity: []byte(serverID),
	})
	require.NoError(t, err)
	wF := doJSON(t, router, http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3": base64.RawURLEncoding.EncodeToString(ke3.Serialize()),
		"loginStateID": rd["loginStateID"].(string),
	}, nil)
	require.Equal(t, http.StatusOK, wF.Code)

	var ld map[string]any
	require.NoError(t, json.Unmarshal(wF.Body.Bytes(), &ld))
	data := ld["data"].(map[string]any)
	assert.NotEmpty(t, data["refreshToken"])
	assert.NotEmpty(t, data["publicKey"])
	assert.NotEmpty(t, data["encryptedPrivateKey"])
	kdf := data["kdf"].(map[string]any)
	assert.NotEmpty(t, kdf["salt"])
	assert.Greater(t, kdf["memoryCost"].(float64), float64(0))
}

// TestLoginFinish_WrongPassword verifies that supplying the wrong password
// prevents a successful login. In OPAQUE the wrong password causes the client's
// envelope decryption to fail, so it cannot produce a valid KE3. The server
// therefore receives unparseable bytes and returns 400.
func TestLoginFinish_WrongPassword(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "correctpassword")

	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)

	ke1 := clt.LoginInit([]byte("wrongpassword"))
	wS := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username,
		"ke1":      base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	loginStateID := sd["data"].(map[string]any)["loginStateID"].(string)

	// Client-side LoginFinish fails (wrong OPRF key → envelope MAC mismatch) so
	// we send garbage bytes; the server cannot deserialize them → 400.
	wF := doJSON(t, router, http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3":          b64("garbage-ke3-wrong-password"),
		"loginStateID": loginStateID,
	}, nil)
	assert.Equal(t, http.StatusBadRequest, wF.Code)
}

// TestLoginFinish_WrongCredentials submits a valid KE3 from user B to user A's
// login state. The AKE MAC verification on the server fails → 401.
func TestLoginFinish_WrongCredentials(t *testing.T) {
	usernameA, emailA := uniqueOpaqueUsername()
	usernameB, emailB := uniqueOpaqueUsername()
	mustOpaqueRegister(t, usernameA, emailA, "pwA")
	mustOpaqueRegister(t, usernameB, emailB, "pwB")

	flushRateLimits(t)
	router := newRouter()
	serverID := os.Getenv("OPAQUE_SERVER_ID")

	// Start login session for user A.
	cltA := newOpaqueClient(t)
	ke1A := cltA.LoginInit([]byte("pwA"))
	wSA := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": usernameA, "ke1": base64.RawURLEncoding.EncodeToString(ke1A.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wSA.Code)
	var sdA map[string]any
	require.NoError(t, json.Unmarshal(wSA.Body.Bytes(), &sdA))
	loginStateIDA := sdA["data"].(map[string]any)["loginStateID"].(string)

	// Start and fully complete login session for user B → obtain valid ke3_B.
	flushRateLimits(t)
	cltB := newOpaqueClient(t)
	ke1B := cltB.LoginInit([]byte("pwB"))
	wSB := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": usernameB, "ke1": base64.RawURLEncoding.EncodeToString(ke1B.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wSB.Code)
	var sdB map[string]any
	require.NoError(t, json.Unmarshal(wSB.Body.Bytes(), &sdB))
	ke2BBytes, _ := base64.RawURLEncoding.DecodeString(sdB["data"].(map[string]any)["ke2"].(string))
	ke2B, err := cltB.Deserialize.KE2(ke2BBytes)
	require.NoError(t, err)
	ke3B, _, err := cltB.LoginFinish(ke2B, opaque.ClientLoginFinishOptions{
		ClientIdentity: []byte(usernameB), ServerIdentity: []byte(serverID),
	})
	require.NoError(t, err)

	// Submit user B's ke3 against user A's state → MAC mismatch → 401.
	wF := doJSON(t, router, http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3":          base64.RawURLEncoding.EncodeToString(ke3B.Serialize()),
		"loginStateID": loginStateIDA,
	}, nil)
	assert.Equal(t, http.StatusUnauthorized, wF.Code)
}

func TestLoginFinish_InvalidStateID(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")

	flushRateLimits(t)
	router := newRouter()
	clt := newOpaqueClient(t)
	serverID := os.Getenv("OPAQUE_SERVER_ID")

	ke1 := clt.LoginInit([]byte("pw"))
	wS := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username, "ke1": base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	ke2B, _ := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["ke2"].(string))
	ke2msg, _ := clt.Deserialize.KE2(ke2B)
	ke3, _, err := clt.LoginFinish(ke2msg, opaque.ClientLoginFinishOptions{
		ClientIdentity: []byte(username), ServerIdentity: []byte(serverID),
	})
	require.NoError(t, err)

	w := doJSON(t, router, http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3":          base64.RawURLEncoding.EncodeToString(ke3.Serialize()),
		"loginStateID": "nonexistent-state-id",
	}, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestLoginFinish_InvalidKE3(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")

	flushRateLimits(t)
	router := newRouter()

	clt := newOpaqueClient(t)
	ke1 := clt.LoginInit([]byte("pw"))
	wS := doJSON(t, router, http.MethodPost, "/auth/login/start", map[string]any{
		"username": username, "ke1": base64.RawURLEncoding.EncodeToString(ke1.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	loginStateID := sd["data"].(map[string]any)["loginStateID"].(string)

	// Send garbage KE3 bytes.
	w := doJSON(t, router, http.MethodPost, "/auth/login/finish", map[string]any{
		"ke3":          b64("not-a-valid-ke3"),
		"loginStateID": loginStateID,
	}, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestLoginFinish_EmptyBody(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/auth/login/finish", nil, nil)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestFullAuthFlow registers, logs in, gets a JWT via refresh, and verifies identity.
func TestFullAuthFlow(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "securepassword")

	refreshToken := mustOpaqueLogin(t, username, "securepassword")
	jwtToken := mustRefresh(t, refreshToken)

	router := newRouter()
	w := doJSON(t, router, http.MethodGet, "/auth/get", nil, map[string]string{"Authorization": jwtToken})
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Equal(t, username, data["username"])
}

// ─── Password Change ──────────────────────────────────────────────────────────

func TestPasswordChangeFlow(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "oldpassword")
	refreshToken := mustOpaqueLogin(t, username, "oldpassword")
	jwtToken := mustRefresh(t, refreshToken)

	router := newRouter()
	clt := newOpaqueClient(t)

	// Step 1 – PasswordChangeStart
	req := clt.RegistrationInit([]byte("newpassword"))
	wS := doJSON(t, router, http.MethodPost, "/me/password/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, map[string]string{"Authorization": jwtToken})
	require.Equal(t, http.StatusOK, wS.Code, "PasswordChangeStart: %s", wS.Body)

	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	msgB, err := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["message"].(string))
	require.NoError(t, err)

	respMsg, err := clt.Deserialize.RegistrationResponse(msgB)
	require.NoError(t, err)
	// Bind identities so the next login's envelope decryption succeeds.
	record, _ := clt.RegistrationFinalize(respMsg, opaque.ClientRegistrationFinalizeOptions{
		ClientIdentity: []byte(username),
		ServerIdentity: []byte(os.Getenv("OPAQUE_SERVER_ID")),
	})

	// Step 2 – PasswordChangeFinish
	wF := doJSON(t, router, http.MethodPost, "/me/password/finish", map[string]any{
		"opaqueRecord":        base64.RawURLEncoding.EncodeToString(record.Serialize()),
		"encryptedPrivateKey": b64("new-enc-priv-key"),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
	}, map[string]string{"Authorization": jwtToken})
	require.Equal(t, http.StatusNoContent, wF.Code, "PasswordChangeFinish: %s", wF.Body)

	// Verify new password works.
	mustOpaqueLogin(t, username, "newpassword")
}

func TestPasswordChangeFinish_InvalidRecord(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")
	refreshToken := mustOpaqueLogin(t, username, "pw")
	jwtToken := mustRefresh(t, refreshToken)

	router := newRouter()
	clt := newOpaqueClient(t)
	req := clt.RegistrationInit([]byte("newpw"))

	// Start the change so credID is stored in Redis.
	doJSON(t, router, http.MethodPost, "/me/password/start", map[string]any{
		"username": username,
		"blinded":  base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, map[string]string{"Authorization": jwtToken})

	// Finish with garbage record bytes.
	w := doJSON(t, router, http.MethodPost, "/me/password/finish", map[string]any{
		"opaqueRecord":        b64("garbage-record"),
		"encryptedPrivateKey": b64("epk"),
		"kdf": map[string]any{
			"salt": b64("s"), "memoryCost": int32(1), "timeCost": int32(1), "parallelism": int32(1),
		},
	}, map[string]string{"Authorization": jwtToken})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestPasswordChangeFinish_NoCredentialID(t *testing.T) {
	// Calling finish without start → no credID in Redis → 500.
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")
	refreshToken := mustOpaqueLogin(t, username, "pw")
	jwtToken := mustRefresh(t, refreshToken)

	// Use a valid OPAQUE record from a fresh registration init (but for a different
	// throwaway user so the real user's Redis key is absent).
	clt := newOpaqueClient(t)
	req := clt.RegistrationInit([]byte("newpw"))
	throwaway, _ := uniqueOpaqueUsername()
	wS := doJSON(t, newRouter(), http.MethodPost, "/auth/register/start", map[string]any{
		"username": throwaway, "blinded": base64.RawURLEncoding.EncodeToString(req.Serialize()),
	}, nil)
	require.Equal(t, http.StatusOK, wS.Code)
	var sd map[string]any
	require.NoError(t, json.Unmarshal(wS.Body.Bytes(), &sd))
	msgB, _ := base64.RawURLEncoding.DecodeString(sd["data"].(map[string]any)["message"].(string))
	respMsg, _ := clt.Deserialize.RegistrationResponse(msgB)
	record, _ := clt.RegistrationFinalize(respMsg)

	w := doJSON(t, newRouter(), http.MethodPost, "/me/password/finish", map[string]any{
		"opaqueRecord":        base64.RawURLEncoding.EncodeToString(record.Serialize()),
		"encryptedPrivateKey": b64("epk"),
		"kdf": map[string]any{
			"salt":        base64.RawURLEncoding.EncodeToString(make([]byte, 32)),
			"memoryCost":  int32(64 * 1024),
			"timeCost":    int32(3),
			"parallelism": int32(1),
		},
	}, map[string]string{"Authorization": jwtToken})
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestPasswordChangeStart_Unauthorized(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/me/password/start", map[string]any{
		"username": "user", "blinded": b64("b"),
	}, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestPasswordChangeStart_InvalidBody(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/me/password/start", nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestPasswordChangeStart_InvalidBlinded(t *testing.T) {
	username, email := uniqueOpaqueUsername()
	mustOpaqueRegister(t, username, email, "pw")
	refreshToken := mustOpaqueLogin(t, username, "pw")
	jwtToken := mustRefresh(t, refreshToken)

	flushRateLimits(t)
	router := newRouter()

	w := doJSON(t, router, http.MethodPost, "/me/password/start", map[string]any{
		"username": username,
		"blinded":  b64("not-a-valid-blinded-value"),
	}, map[string]string{"Authorization": jwtToken})
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}
