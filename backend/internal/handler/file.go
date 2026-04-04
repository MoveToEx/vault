package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"context"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

type GetFilesPayload struct {
	DirID int64 `form:"dir"`
}

type GetFilesResponse struct {
	ID                int64       `json:"id"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	Size              int64       `json:"size"`
}

func GetFiles(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload GetFilesPayload

	if err := c.ShouldBindQuery(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := context.Background()

	user, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting user")
		return
	}

	if payload.DirID == 0 {
		payload.DirID = user.RootFolder.Int64
	}

	cur, err := db.Query().GetFolder(ctx, payload.DirID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting folder")
		return
	}

	if cur.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	files, err := db.Query().GetFiles(ctx, payload.DirID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting files")
		return
	}

	folders, err := db.Query().GetSubfolders(ctx, pgtype.Int8{
		Valid: true,
		Int64: payload.DirID,
	})
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting folders")
		return
	}

	var result = []GetFilesResponse{}

	for i := range files {
		result = append(result, GetFilesResponse{
			ID:                files[i].ID,
			EncryptedMetadata: files[i].EncryptedMetadata,
			Size:              files[i].Size,
		})
	}

	for i := range folders {
		result = append(result, GetFilesResponse{
			ID:                folders[i].ID,
			EncryptedMetadata: folders[i].EncryptedMetadata,
		})
	}

	utils.SuccessResponse(c, result)
}

type GetFileResponse struct {
	Chunks            int32       `json:"chunks"`
	ChunkSize         int64       `json:"chunkSize"`
	Size              int64       `json:"size"`
	EncryptedKey      utils.Bytes `json:"encryptedKey"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

func GetFile(c *gin.Context) {
	userID := c.GetInt64("UserID")

	fileID, err := strconv.ParseInt(c.Param("file_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := context.Background()

	file, err := db.Query().GetFile(ctx, fileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	utils.SuccessResponse(c, GetFileResponse{
		Chunks:            file.Chunks,
		EncryptedKey:      file.EncryptedKey,
		Size:              file.Size,
		ChunkSize:         config.GetConfig().ChunkSize,
		EncryptedMetadata: file.EncryptedMetadata,
	})
}

type GetChunkResponse struct {
	URL     string              `json:"url"`
	Headers map[string][]string `json:"headers"`
	Size    int64               `json:"size"`
}

func GetChunk(c *gin.Context) {
	userID := c.GetInt64("UserID")

	fileID, err := strconv.ParseInt(c.Param("file_id"), 10, 64)

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

	chunk, err := db.Query().GetChunk(ctx, sqlc.GetChunkParams{
		OwnerID:    userID,
		ChunkIndex: int32(chunkIndex),
		FileID:     fileID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting chunk")
		return
	}

	presigner := s3.NewPresignClient(config.S3())

	req, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(config.GetConfig().S3.BucketName),
		Key:    aws.String(chunk.S3Key),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when signing request")
		return
	}

	utils.SuccessResponse(c, GetChunkResponse{
		URL:     req.URL,
		Headers: req.SignedHeader,
		Size:    chunk.Size,
	})
}

type DeleteFilesPayload struct {
	FileID int64 `uri:"file_id"`
}

func DeleteFile(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload DeleteFilesPayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	if payload.FileID == 0 {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}
	ctx := context.Background()

	file, err := db.Query().GetFile(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	err = db.Query().DeleteFile(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating row")
		return
	}

	utils.SuccessResponse(c, nil)
}

type NewFolderPayload struct {
	ParentID          int64       `json:"parentId"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

type NewFolderResponse struct {
	ID int64
}

func NewFolder(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload NewFolderPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}
	ctx := context.Background()

	if payload.ParentID == 0 {
		user, err := db.Query().GetUser(ctx, userID)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when getting user")
			return
		}

		payload.ParentID = user.RootFolder.Int64
	}

	folder, err := db.Query().NewFolder(ctx, sqlc.NewFolderParams{
		EncryptedMetadata: payload.EncryptedMetadata,
		ParentID: pgtype.Int8{
			Valid: true,
			Int64: payload.ParentID,
		},
		OwnerID: userID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating folder")
		return
	}

	utils.SuccessResponse(c, NewFolderResponse{
		ID: folder.ID,
	})
}
