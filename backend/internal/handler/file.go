package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/queue"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

type GetCapacityResponse struct {
	Used     int64 `json:"used"`
	Capacity int64 `json:"capacity"`
}

func GetCapacity(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	user, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting user")
		return
	}

	used, err := db.Query().GetUsedCapacity(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting capacity")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action": "get_capacity",
	}, nil)

	utils.SuccessResponse(c, GetCapacityResponse{
		Used:     used,
		Capacity: user.Capacity,
	})
}

type GetFilesPayload struct {
	DirID int64 `form:"dir"`
}

type GetFilesResponse struct {
	ID                int64       `json:"id"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	Size              int64       `json:"size"`
	CreatedAt         time.Time   `json:"createdAt"`
}

func GetFiles(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload GetFilesPayload

	if err := c.ShouldBindQuery(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

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
			CreatedAt:         files[i].CreatedAt.Time,
		})
	}

	for i := range folders {
		result = append(result, GetFilesResponse{
			ID:                folders[i].ID,
			EncryptedMetadata: folders[i].EncryptedMetadata,
			CreatedAt:         folders[i].CreatedAt.Time,
		})
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "list_folder",
		"dirId":  payload.DirID,
	}, cur.EncryptedMetadata)

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

	ctx := c.Request.Context()

	file, err := db.Query().GetFile(ctx, fileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "get_file_metadata",
		"fileId": fileID,
	}, file.EncryptedMetadata)

	utils.SuccessResponse(c, GetFileResponse{
		Chunks:            file.Chunks,
		EncryptedKey:      file.EncryptedKey,
		Size:              file.Size,
		ChunkSize:         file.ChunkSize,
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

	ctx := c.Request.Context()

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

	fileRow, err := db.Query().GetFile(ctx, fileID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}
	if fileRow.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action":     "get_file_chunk",
		"fileId":     fileID,
		"chunkIndex": chunkIndex,
	}, fileRow.EncryptedMetadata)

	utils.SuccessResponse(c, GetChunkResponse{
		URL:     req.URL,
		Headers: req.SignedHeader,
	})
}

type UpdateFilePayload struct {
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

func UpdateFile(c *gin.Context) {
	userID := c.GetInt64("UserID")

	fileID, err := strconv.ParseInt(c.Param("file_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UpdateFilePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	file, err := db.Query().GetFile(ctx, fileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Access denied")
		return
	}

	err = db.Query().SetFileMetadata(ctx, sqlc.SetFileMetadataParams{
		EncryptedMetadata: payload.EncryptedMetadata,
		ID:                fileID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating file")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "update_file",
		"fileId": fileID,
	}, payload.EncryptedMetadata)

	utils.SuccessResponse(c, 204)
}

type UpdateFolderPayload struct {
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

func UpdateFolder(c *gin.Context) {
	userID := c.GetInt64("UserID")

	folderID, err := strconv.ParseInt(c.Param("folder_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UpdateFolderPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	folder, err := db.Query().GetFolder(ctx, folderID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting folder")
		return
	}

	if folder.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Access denied")
		return
	}

	err = db.Query().SetFolderMetadata(ctx, sqlc.SetFolderMetadataParams{
		EncryptedMetadata: payload.EncryptedMetadata,
		ID:                folderID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating folder")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "update_folder",
		"folderId": folderID,
	}, payload.EncryptedMetadata)

	utils.SuccessResponse(c, 204)
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
	ctx := c.Request.Context()

	file, err := db.Query().GetFile(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	meta := file.EncryptedMetadata

	keys, err := db.Query().GetFileS3Keys(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting keys")
		return
	}

	if err := db.Query().DeleteFile(ctx, sqlc.DeleteFileParams{
		ID:      payload.FileID,
		OwnerID: userID,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when deleting file")
		return
	}

	if err := queue.EnqueueS3Deletion(ctx, keys); err != nil {
		utils.ErrorResponse(c, 500, "Failed when scheduling storage cleanup")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "delete_file",
		"fileId": payload.FileID,
	}, meta)

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
	ctx := c.Request.Context()

	parentID := payload.ParentID

	if parentID == 0 {
		user, err := db.Query().GetUser(ctx, userID)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when getting user")
			return
		}

		parentID = user.RootFolder.Int64
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

	depth, err := db.Query().GetFolderDepth(ctx, parent.ID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when calculating folder depth")
		return
	}

	if depth > 32 {
		utils.ErrorResponse(c, 400, "Folder too deep")
		return
	}

	folder, err := db.Query().NewFolder(ctx, sqlc.NewFolderParams{
		EncryptedMetadata: payload.EncryptedMetadata,
		ParentID: pgtype.Int8{
			Valid: true,
			Int64: parent.ID,
		},
		OwnerID: userID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating folder")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "create_folder",
		"folderId": folder.ID,
		"parentId": parent.ID,
	}, payload.EncryptedMetadata)

	utils.SuccessResponse(c, NewFolderResponse{
		ID: folder.ID,
	})
}

type DeleteFolderPayload struct {
	FolderID int64 `uri:"folder_id"`
}

func DeleteFolder(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload DeleteFolderPayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	if payload.FolderID == 0 {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}
	ctx := c.Request.Context()

	folder, err := db.Query().GetFolder(ctx, payload.FolderID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting folder")
		return
	}

	if folder.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	meta := folder.EncryptedMetadata

	keys, err := db.Query().TraverseChunks(ctx, payload.FolderID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing files")
		return
	}

	if err := db.Query().DeleteFiles(ctx, payload.FolderID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when deleting files")
		return
	}

	if err := queue.EnqueueS3Deletion(ctx, keys); err != nil {
		utils.ErrorResponse(c, 500, "Failed when scheduling storage cleanup")
		return
	}

	if err := db.Query().DeleteFolders(ctx, payload.FolderID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when deleting folder")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "delete_folder",
		"folderId": payload.FolderID,
	}, meta)

	utils.SuccessResponse(c, nil)
}
