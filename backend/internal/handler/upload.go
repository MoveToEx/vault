package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

var (
	errTooManyUploadSessions       = errors.New("too many upload sessions")
	errInsufficientUploadCapacity  = errors.New("insufficient capacity")
	errUploadParentOwnership       = errors.New("parent ownership mismatch")
)

func GetUploadSessions(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	up, err := db.Query().GetActiveUploadSession(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting sessions")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "list_upload_sessions",
	}, nil)

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

	siteCfg, err := db.Query().GetSiteConfig(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when reading site configuration")
		return
	}

	chunkSize := utils.GetChunkSize(payload.Size)
	chunks := payload.Size / chunkSize

	if payload.Size%chunkSize != 0 {
		chunks++
	}

	var up sqlc.Upload

	err = db.Transaction(ctx, func(tx *sqlc.Queries) error {
		cnt, err := tx.CountActiveUploadSession(ctx, userID)
		if err != nil {
			return err
		}
		if cnt > 12 {
			return errTooManyUploadSessions
		}

		user, err := tx.GetUser(ctx, userID)
		if err != nil {
			return err
		}

		parentID := payload.ParentID
		if parentID == 0 {
			parentID = user.RootFolder.Int64
		}

		used, err := tx.GetCommittedStorageUse(ctx, userID)
		if err != nil {
			return err
		}

		if used+payload.Size > user.Capacity {
			return errInsufficientUploadCapacity
		}

		parent, err := tx.GetFolder(ctx, parentID)
		if err != nil {
			return err
		}

		if parent.OwnerID != userID {
			return errUploadParentOwnership
		}

		upload, err := tx.NewUpload(ctx, sqlc.NewUploadParams{
			UserID:            userID,
			EncryptedMetadata: payload.EncryptedMetadata,
			Size:              payload.Size,
			Chunks:            int32(chunks),
			ChunkSize:         chunkSize,
			ParentID:          parent.ID,
			ExpiresAt: pgtype.Timestamptz{
				Valid: true,
				Time:  time.Now().Add(time.Duration(siteCfg.UploadExpirySeconds) * time.Second),
			},
		})
		if err != nil {
			return err
		}

		up = upload
		return nil
	})

	if errors.Is(err, errTooManyUploadSessions) {
		utils.ErrorResponse(c, 400, "Too many sessions")
		return
	}
	if errors.Is(err, errInsufficientUploadCapacity) {
		utils.ErrorResponse(c, 400, "Insufficient capacity")
		return
	}
	if errors.Is(err, errUploadParentOwnership) {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating upload")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "upload_init",
		"uploadId": up.ID,
		"size":     payload.Size,
		"parentId": up.ParentID,
	}, payload.EncryptedMetadata)

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

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action":     "upload_chunk_presign",
		"uploadId":   uploadID,
		"chunkIndex": chunkIndex,
	}, up.EncryptedMetadata)

	utils.SuccessResponse(c, UploadChunkInitResponse{
		URL:     req.URL,
		Method:  req.Method,
		Headers: req.SignedHeader,
	})
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
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating chunk")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action":     "upload_chunk_complete",
		"uploadId":   uploadID,
		"chunkIndex": chunkIndex,
	}, up.EncryptedMetadata)

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

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting session")
		return
	}

	if upload.UserID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	var completedFileID int64

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

		completedFileID = fid

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
		slog.ErrorContext(ctx, "upload complete transaction failed", "err", err, "user_id", userID, "upload_id", uploadID)
		utils.ErrorResponse(c, 500, "Failed when completing upload")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "upload_complete",
		"uploadId": uploadID,
		"fileId":   completedFileID,
	}, upload.EncryptedMetadata)

	utils.SuccessResponse(c, nil)
}
