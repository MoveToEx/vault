package queue

import (
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"context"

	"github.com/riverqueue/river"
)

type ExpiryArgs struct{}

func (ExpiryArgs) Kind() string {
	return "s3_expiry"
}

type ExpiryWorker struct {
	river.WorkerDefaults[ExpiryArgs]
}

func (w *ExpiryWorker) Work(ctx context.Context, job *river.Job[ExpiryArgs]) error {
	uploads, err := db.Query().GetExpiredUploads(ctx)
	if err != nil {
		return err
	}

	for _, upload := range uploads {
		if err := cleanupExpiredUpload(ctx, upload.ID); err != nil {
			return err
		}
	}
	return nil
}

func cleanupExpiredUpload(ctx context.Context, uploadID int64) error {
	upload, err := db.Query().GetUploadSession(ctx, uploadID)
	if err != nil {
		return err
	}
	if upload.CompletedAt.Valid {
		return nil
	}

	meta := upload.EncryptedMetadata

	chunks, err := db.Query().GetUploadChunks(ctx, uploadID)
	if err != nil {
		return err
	}
	for _, chunk := range chunks {
		if err := deleteS3ObjectIfExists(ctx, chunk.S3Key); err != nil {
			return err
		}
	}
	if err := db.Query().DeleteUploadChunks(ctx, uploadID); err != nil {
		return err
	}
	if err := db.Query().DeleteIncompleteUpload(ctx, uploadID); err != nil {
		return err
	}

	utils.AppendLog(ctx, upload.UserID, sqlc.LogLevelInfo, map[string]string{
		"action": "upload_expire",
	}, meta)

	return nil

}
