package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"crypto/sha256"
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

	ctx := c.Request.Context()

	up, err := db.Query().GetActiveUploadSession(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting sessions")
		return
	}

	utils.SuccessResponse(c, up)
}

type InitUploadPayload struct {
	Size              int64       `json:"size"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
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
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	cnt, err := db.Query().CountActiveUploadSession(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when counting sessions")
		return
	}

	if cnt > 12 {
		utils.ErrorResponse(c, 400, "Too many sessions")
		return
	}

	user, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting user")
		return
	}

	parentID := payload.ParentID

	if parentID == 0 {
		parentID = user.RootFolder.Int64
	}

	used, err := db.Query().GetUsedCapacity(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when calculating capacity")
		return
	}

	if used+payload.Size > user.Capacity {
		utils.ErrorResponse(c, 400, "Insufficient capacity")
		return
	}

	parent, err := db.Query().GetFolder(ctx, parentID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting parent folder")
		return
	}

	if parent.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	chunkSize := utils.GetChunkSize(payload.Size)
	chunks := payload.Size / chunkSize

	if payload.Size%chunkSize != 0 {
		chunks++
	}

	up, err := db.Query().NewUpload(ctx, sqlc.NewUploadParams{
		UserID:            userID,
		EncryptedMetadata: payload.EncryptedMetadata,
		Size:              payload.Size,
		Chunks:            int32(chunks),
		ChunkSize:         chunkSize,
		ParentID:          parent.ID,
		ExpiresAt: pgtype.Timestamptz{
			Valid: true,
			Time:  time.Now().Add(time.Hour * 12),
		},
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Faile when creating upload")
		return
	}

	utils.SuccessResponse(c, InitUploadResponse{
		ID:        up.ID,
		Chunks:    int32(chunks),
		ChunkSize: chunkSize,
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

	ctx := c.Request.Context()

	presigner := s3.NewPresignClient(config.S3())

	key, err := gonanoid.New()

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when generating key")
		return
	}

	up, err := db.Query().GetUploadSession(ctx, uploadID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting session")
		return
	}

	if up.Chunks < int32(chunkIndex) || up.UserID != userID {
		utils.ErrorResponse(c, 409, "Defective session state")
		return
	}

	chunkSize := up.ChunkSize

	if up.Chunks == int32(chunkIndex) && up.Size%up.ChunkSize != 0 {
		chunkSize = up.Size % up.ChunkSize
	}

	length := utils.GetEncryptedChunkSize(chunkSize)

	err = db.Query().NewUploadChunk(ctx, sqlc.NewUploadChunkParams{
		UploadID:   uploadID,
		ChunkIndex: int32(chunkIndex),
		S3Key:      key,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating chunk")
		return
	}

	req, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(config.GetConfig().S3.BucketName),
		Key:           aws.String(key),
		ContentLength: aws.Int64(length),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when signing request")
		return
	}

	utils.SuccessResponse(c, UploadChunkInitResponse{
		URL:     req.URL,
		Method:  req.Method,
		Headers: req.SignedHeader,
	})
}

type UploadChunkCompletePayload struct {
	Checksum utils.Bytes `json:"checksum"`
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

	if len(payload.Checksum) != sha256.Size {
		utils.ErrorResponse(c, 400, "Invalid checksum")
		return
	}

	ctx := c.Request.Context()

	up, err := db.Query().GetUploadSession(ctx, uploadID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting session")
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
		utils.ErrorResponse(c, 500, "Failed when checking chunk validity")
		return
	}

	if chk.Completed == true {
		utils.ErrorResponse(c, 409, "Conflicting chunk state")
		return
	}

	err = db.Query().CompleteUploadChunk(ctx, sqlc.CompleteUploadChunkParams{
		UploadID:   uploadID,
		ChunkIndex: int32(chunkIndex),
		Checksum:   payload.Checksum,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating chunk")
		return
	}

	utils.SuccessResponse(c, nil)
}

type UploadCompletePayload struct {
	EncryptedKey utils.Bytes `json:"encryptedKey"`
}

func UploadComplete(c *gin.Context) {
	userID := c.GetInt64("UserID")

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

	ctx := c.Request.Context()

	upload, err := db.Query().GetUploadSession(ctx, uploadID)

	if upload.UserID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

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
		return
	}

	utils.SuccessResponse(c, nil)
}
