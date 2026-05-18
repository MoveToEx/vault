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

	used, err := db.Query().GetCommittedStorageUse(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting capacity")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action": "get_capacity",
	}, nil, nil)

	utils.SuccessResponse(c, GetCapacityResponse{
		Used:     used,
		Capacity: user.Capacity,
	})
}

type GetFilesPayload struct {
	DirID int64 `form:"dir"`
}

type GetFilesFolderItem struct {
	ID        int64       `json:"id"`
	Envelope  utils.Bytes `json:"envelope"`
	KemCipher utils.Bytes `json:"kemCipher"`
	CreatedAt time.Time   `json:"createdAt"`
}

type GetFilesFileItem struct {
	ID        int64       `json:"id"`
	Size      int64       `json:"size"`
	CreatedAt time.Time   `json:"createdAt"`
	Envelope  utils.Bytes `json:"envelope"`
	KemCipher utils.Bytes `json:"kemCipher"`
}

type GetFilesResponse struct {
	Files   []GetFilesFileItem   `json:"files"`
	Folders []GetFilesFolderItem `json:"folders"`
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

	var filesResponse = []GetFilesFileItem{}
	var foldersResponse = []GetFilesFolderItem{}

	for i := range files {
		filesResponse = append(filesResponse, GetFilesFileItem{
			ID:        files[i].ID,
			Size:      files[i].Size,
			CreatedAt: files[i].CreatedAt.Time,
			Envelope:  files[i].Envelope,
			KemCipher: files[i].KemCipher,
		})
	}

	for i := range folders {
		foldersResponse = append(foldersResponse, GetFilesFolderItem{
			ID:        folders[i].ID,
			Envelope:  folders[i].Envelope,
			KemCipher: folders[i].KemCipher,
			CreatedAt: folders[i].CreatedAt.Time,
		})
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action": "list_folder",
		"dirId":  payload.DirID,
	}, cur.Envelope, cur.KemCipher)

	utils.SuccessResponse(c, GetFilesResponse{
		Files:   filesResponse,
		Folders: foldersResponse,
	})
}

type GetFileResponse struct {
	Chunks    int32       `json:"chunks"`
	ChunkSize int64       `json:"chunkSize"`
	Size      int64       `json:"size"`
	Envelope  utils.Bytes `json:"envelope"`
	KemCipher utils.Bytes `json:"kemCipher"`
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
	}, file.Envelope, file.KemCipher)

	utils.SuccessResponse(c, GetFileResponse{
		Chunks:    file.Chunks,
		Envelope:  file.Envelope,
		KemCipher: file.KemCipher,
		Size:      file.Size,
		ChunkSize: file.ChunkSize,
	})
}

type GetChunkResponse struct {
	URL     string              `json:"url"`
	Headers map[string][]string `json:"headers"`
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

	file, err := db.Query().GetFile(ctx, fileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting file")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Forbidden")
		return
	}

	chunk, err := db.Query().GetChunk(ctx, sqlc.GetChunkParams{
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

	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action":     "get_file_chunk",
		"fileId":     fileID,
		"chunkIndex": chunkIndex,
	}, file.Envelope, file.KemCipher)

	utils.SuccessResponse(c, GetChunkResponse{
		URL:     req.URL,
		Headers: req.SignedHeader,
	})
}

type UpdateMetadataPayload struct {
	Envelope utils.Bytes `json:"envelope"`
}

func UpdateFile(c *gin.Context) {
	userID := c.GetInt64("UserID")

	fileID, err := strconv.ParseInt(c.Param("file_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UpdateMetadataPayload

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
		Envelope: payload.Envelope,
		ID:       fileID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating file")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "update_file",
		"fileId": fileID,
	}, payload.Envelope, file.KemCipher)

	utils.SuccessResponse(c, 204)
}

func UpdateFolder(c *gin.Context) {
	userID := c.GetInt64("UserID")

	folderID, err := strconv.ParseInt(c.Param("folder_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload UpdateMetadataPayload

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
		Envelope: payload.Envelope,
		ID:       folderID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating folder")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":   "update_folder",
		"folderId": folderID,
	}, payload.Envelope, folder.KemCipher)

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

	keys, err := db.Query().GetFileS3Keys(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting keys")
		return
	}

	if err := db.Query().DeleteFile(ctx, sqlc.DeleteFileParams{
		ID:      payload.FileID,
		OwnerID: userID,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when deleting file: %v", err)
		return
	}

	if err := queue.EnqueueS3Deletion(ctx, keys); err != nil {
		utils.ErrorResponse(c, 500, "Failed when scheduling storage cleanup")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "delete_file",
		"fileId": payload.FileID,
	}, file.Envelope, file.KemCipher)

	utils.SuccessResponse(c, nil)
}

type MoveFilePayload struct {
	DestinationFolderID int64 `json:"destinationFolderId"`
}

func MoveFile(c *gin.Context) {
	userID := c.GetInt64("UserID")

	fileID, err := strconv.ParseInt(c.Param("file_id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload MoveFilePayload
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
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	dest, err := db.Query().GetFolder(ctx, payload.DestinationFolderID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting destination folder")
		return
	}
	if dest.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	if err := db.Query().MoveFile(ctx, sqlc.MoveFileParams{
		ID:       fileID,
		ParentID: dest.ID,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when moving file")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":     "move_file",
		"fileId":     fileID,
		"destFolder": dest.ID,
	}, file.Envelope, file.KemCipher)

	utils.SuccessResponse(c, nil)
}

type MoveFolderPayload struct {
	DestinationFolderID int64 `json:"destinationFolderId"`
}

func MoveFolder(c *gin.Context) {
	userID := c.GetInt64("UserID")

	folderID, err := strconv.ParseInt(c.Param("folder_id"), 10, 64)
	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var payload MoveFolderPayload
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
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	if payload.DestinationFolderID == folderID {
		utils.ErrorResponse(c, 400, "Cannot move a folder into itself")
		return
	}

	dest, err := db.Query().GetFolder(ctx, payload.DestinationFolderID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting destination folder")
		return
	}
	if dest.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	isDescendant, err := db.Query().IsFolderDescendant(ctx, sqlc.IsFolderDescendantParams{
		LeftID:  dest.ID,
		RightID: folderID,
	})
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when checking folder ancestry")
		return
	}
	if isDescendant {
		utils.ErrorResponse(c, 400, "Cannot move a folder into its own subtree")
		return
	}

	depth, err := db.Query().GetFolderDepth(ctx, dest.ID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when calculating folder depth")
		return
	}
	if depth > 32 {
		utils.ErrorResponse(c, 400, "Destination folder is too deep")
		return
	}

	if err := db.Query().MoveFolder(ctx, sqlc.MoveFolderParams{
		ID:       folderID,
		ParentID: pgtype.Int8{Valid: true, Int64: dest.ID},
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when moving folder")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":     "move_folder",
		"folderId":   folderID,
		"destFolder": dest.ID,
	}, folder.Envelope, folder.KemCipher)

	utils.SuccessResponse(c, nil)
}

type NewFolderPayload struct {
	ParentID  int64       `json:"parentId"`
	Envelope  utils.Bytes `json:"envelope"`
	KemCipher utils.Bytes `json:"kemCipher"`
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
		Envelope:  payload.Envelope,
		KemCipher: payload.KemCipher,
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
	}, payload.Envelope, payload.KemCipher)

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
	}, folder.Envelope, folder.KemCipher)

	utils.SuccessResponse(c, nil)
}
