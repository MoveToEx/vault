package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"log"
	"os"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/bytemare/opaque"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

type JWTConfig struct {
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
	SessionTTL int
}

type S3Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	BucketName      string
	URLPrefix       string
}

type OpaqueConfig struct {
	Config           string
	ServerID         string
	SecretOPRFSeed   []byte
	ServerPrivateKey []byte
	ServerPublicKey  []byte
}

type Config struct {
	DatabaseURL string
	RedisAddr   string
	CORSOrigin  string
	JWT         JWTConfig
	S3          S3Config
	Opaque      OpaqueConfig
	ChunkSize   int64
}

func mustDecodeHex(s string) []byte {
	b, err := hex.DecodeString(s)

	if err != nil {
		panic("Unable to decode hex string")
	}

	return b
}

func mustDecodeBase64(s string) []byte {
	b, err := base64.StdEncoding.DecodeString(s)

	if err != nil {
		panic("Unable to decode base64")
	}

	return b
}

func mustParseInt64(s string) int64 {
	i, err := strconv.ParseInt(s, 10, 64)

	if err != nil {
		panic("Unable to parse int")
	}

	return i
}

var config Config

func LoadConfig() error {
	err := godotenv.Load()

	if err != nil {
		log.Println("Failed when loading env file, will proceed with system env")
	}

	config = Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		CORSOrigin:  os.Getenv("CORS_ORIGIN"),
		RedisAddr:   os.Getenv("REDIS_ADDR"),
		JWT: JWTConfig{
			PrivateKey: mustDecodeBase64(os.Getenv("JWT_PRIVATE_KEY")),
			SessionTTL: 72,
			PublicKey:  mustDecodeBase64(os.Getenv("JWT_PUBLIC_KEY")),
		},
		S3: S3Config{
			Endpoint:        os.Getenv("S3_ENDPOINT"),
			AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("S3_SECRET_ACCESS_KEY"),
			BucketName:      os.Getenv("S3_BUCKET_NAME"),
			URLPrefix:       os.Getenv("S3_URL_PREFIX"),
		},
		Opaque: OpaqueConfig{
			Config:           os.Getenv("OPAQUE_CONFIG"),
			ServerID:         os.Getenv("OPAQUE_SERVER_ID"),
			SecretOPRFSeed:   mustDecodeBase64(os.Getenv("OPAQUE_OPRF_SEED")),
			ServerPrivateKey: mustDecodeBase64(os.Getenv("OPAQUE_SERVER_PRIVATE_KEY")),
			ServerPublicKey:  mustDecodeBase64(os.Getenv("OPAQUE_SERVER_PUBLIC_KEY")),
		},
		ChunkSize: mustParseInt64(os.Getenv("CHUNK_SIZE")),
	}

	return nil
}

func GetConfig() Config {
	return config
}

var s3client *s3.Client

func InitS3() {
	cfg := aws.Config{
		Region: "us-east-1",
		Credentials: aws.NewCredentialsCache(
			credentials.NewStaticCredentialsProvider(
				config.S3.AccessKeyID,
				config.S3.SecretAccessKey,
				"",
			),
		),
	}
	s3client = s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
		o.BaseEndpoint = aws.String(config.S3.Endpoint)
	})
}

func S3() *s3.Client {
	return s3client
}

var redisClient *redis.Client

func InitRedis() {
	redisClient = redis.NewClient(&redis.Options{
		Addr:     config.RedisAddr,
		Password: "",
		DB:       0,
	})
}

func Redis() *redis.Client {
	return redisClient
}

var opaqueCfg *opaque.Configuration

func InitOpaque() error {
	var err error
	raw := mustDecodeBase64(config.Opaque.Config)

	opaqueCfg, err = opaque.DeserializeConfiguration(raw)

	if err != nil {
		return err
	}

	log.Println("OPAQUE: Using configuration", hex.EncodeToString(opaqueCfg.Serialize()))

	return nil
}

func Opaque() *opaque.Server {
	server, err := opaqueCfg.Server()

	if err != nil {
		panic("Failed when creating OPAQUE server")
	}

	if err := server.SetKeyMaterial(
		[]byte(config.Opaque.ServerID),
		config.Opaque.ServerPrivateKey,
		config.Opaque.ServerPublicKey,
		config.Opaque.SecretOPRFSeed,
	); err != nil {
		panic("Failed when creating OPAQUE server")
	}

	return server
}
