package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"context"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

func GetUploadSessions(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := context.Background()

	up, err := db.Query().GetActiveUploadSession(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting sessions: %v", err)
		return
	}

	utils.SuccessResponse(c, up)
}

type InitUploadPayload struct {
	Size              int64       `json:"size"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	MetadataNonce     utils.Bytes `json:"metadataNonce"`
	ParentID          int64       `json:"parentId"`
}

type InitUploadResponse struct {
	ID        int64 `json:"id"`
	Chunks    int32 `json:"chunks"`
	ChunkSize int64 `json:"chunkSize"`
}

func InitUpload(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload InitUploadPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request: %v", err)
		return
	}

	ctx := context.Background()

	cnt, err := db.Query().CountActiveUploadSession(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when counting sessions: %v", err)
		return
	}

	if cnt > 12 {
		utils.ErrorResponse(c, 400, "Too many sessions")
		return
	}

	if payload.ParentID == 0 {
		user, err := db.Query().GetUser(ctx, userID)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when getting user: %v", err)
			return
		}

		payload.ParentID = user.RootFolder.Int64
	}

	chunks := payload.Size / config.GetConfig().ChunkSize

	if payload.Size%config.GetConfig().ChunkSize != 0 {
		chunks++
	}

	up, err := db.Query().NewUpload(ctx, sqlc.NewUploadParams{
		UserID:            userID,
		EncryptedMetadata: payload.EncryptedMetadata,
		Size:              payload.Size,
		MetadataNonce:     payload.MetadataNonce,
		Chunks:            int32(chunks),
		ParentID:          payload.ParentID,
		ExpiresAt: pgtype.Timestamptz{
			Valid: true,
			Time:  time.Now().Add(time.Hour * 12),
		},
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Faile when creating upload: %v", err)
		return
	}

	utils.SuccessResponse(c, InitUploadResponse{
		ID:        up.ID,
		Chunks:    int32(chunks),
		ChunkSize: config.GetConfig().ChunkSize,
	})
}

type UploadChunkInitResponse struct {
	Method  string              `json:"method"`
	URL     string              `json:"url"`
	Headers map[string][]string `json:"headers"`
}

func UploadChunkInit(c *gin.Context) {
	userID := c.GetInt64("UserID")
	uploadID, err := strconv.ParseInt(c.Param("upload_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	chunkIndex, err := strconv.ParseInt(c.Param("chunk_index"), 10, 32)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := context.Background()

	presigner := s3.NewPresignClient(config.S3())

	key, err := gonanoid.New()

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when generating key: %v", err)
		return
	}

	up, err := db.Query().GetUploadSession(ctx, uploadID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting session: %v", err)
		return
	}

	if up.Chunks < int32(chunkIndex) || up.UserID != userID {
		utils.ErrorResponse(c, 409, "Defective session state")
		return
	}

	err = db.Query().NewUploadChunk(ctx, sqlc.NewUploadChunkParams{
		UploadID:   uploadID,
		ChunkIndex: int32(chunkIndex),
		S3Key:      key,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating chunk: %v", err)
		return
	}

	req, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(config.GetConfig().S3.BucketName),
		Key:    aws.String(key),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when signing request: %v", err)
		return
	}

	utils.SuccessResponse(c, UploadChunkInitResponse{
		URL:     req.URL,
		Method:  req.Method,
		Headers: req.SignedHeader,
	})
}

type UploadChunkCompletePayload struct {
	Size int64 `json:"size"`
}

func UploadChunkComplete(c *gin.Context) {
	userID := c.GetInt64("UserID")
	uploadID, err := strconv.ParseInt(c.Param("upload_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	chunkIndex, err := strconv.ParseInt(c.Param("chunk_index"), 10, 32)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UploadChunkCompletePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := context.Background()

	up, err := db.Query().GetUploadSession(ctx, uploadID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting session: %v", err)
		return
	}

	if up.Chunks < int32(chunkIndex) || up.UserID != userID {
		utils.ErrorResponse(c, 409, "Defective session state")
		return
	}

	chk, err := db.Query().GetUploadChunk(ctx, sqlc.GetUploadChunkParams{
		UploadID:   uploadID,
		ChunkIndex: int32(chunkIndex),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when checking chunk validity: %v", err)
		return
	}

	if chk.Completed == true {
		utils.ErrorResponse(c, 409, "Conflicting chunk state")
		return
	}

	err = db.Query().CompleteUploadChunk(ctx, sqlc.CompleteUploadChunkParams{
		UploadID:   uploadID,
		ChunkIndex: int32(chunkIndex),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating chunk: %v", err)
		return
	}

	utils.SuccessResponse(c, nil)
}

type UploadCompletePayload struct {
	EncryptedKey utils.Bytes `json:"encryptedKey"`
}

func UploadComplete(c *gin.Context) {
	// TODO verify ownership

	// userID := c.GetInt64("UserID")
	uploadID, err := strconv.ParseInt(c.Param("upload_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UploadCompletePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := context.Background()

	err = db.Transaction(ctx, func(tx *sqlc.Queries) error {
		if err := tx.CompleteUploadSession(ctx, uploadID); err != nil {
			return err
		}

		fid, err := tx.MigrateUpload(ctx, sqlc.MigrateUploadParams{
			ID:           uploadID,
			EncryptedKey: payload.EncryptedKey,
		})

		if err != nil {
			return err
		}

		err = tx.MigrateChunks(ctx, sqlc.MigrateChunksParams{
			FileID:   fid,
			UploadID: uploadID,
		})

		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating file: %v", err)
	}

	utils.SuccessResponse(c, nil)
}
