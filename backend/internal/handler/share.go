package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

type FindUserPayload struct {
	Key string `form:"key"`
}

type FindUserItem struct {
	ID        int64       `json:"id"`
	Username  string      `json:"username"`
	PublicKey utils.Bytes `json:"publicKey"`
}

func FindUser(c *gin.Context) {
	ctx := c.Request.Context()

	var payload FindUserPayload

	if err := c.ShouldBindQuery(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	var result = []FindUserItem{}

	if strings.Contains(payload.Key, "@") {
		user, err := db.Query().FindUserByEmail(ctx, payload.Key)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when getting users")
			return
		}

		for i := range user {
			result = append(result, FindUserItem{
				ID:        user[i].ID,
				Username:  user[i].Username,
				PublicKey: user[i].PublicKey,
			})
		}
	} else {
		user, err := db.Query().FindUserByUsername(ctx, payload.Key)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when getting users")
			return
		}

		for i := range user {
			result = append(result, FindUserItem{
				ID:        user[i].ID,
				Username:  user[i].Username,
				PublicKey: user[i].PublicKey,
			})
		}
	}

	userID := c.GetInt64("UserID")
	searchBy := "username"
	if strings.Contains(payload.Key, "@") {
		searchBy = "email"
	}
	utils.AppendLog(ctx, userID, sqlc.LogLevelTrace, map[string]any{
		"action":     "share_user_lookup",
		"searchBy":   searchBy,
		"matchCount": len(result),
	}, nil)

	utils.SuccessResponse(c, result)
}

type CreateSharePayload struct {
	Receiver string `json:"receiver"`
	FileID   int64  `json:"fileId"`

	EncryptedKey      utils.Bytes `json:"encryptedKey"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

type CreateShareResponse struct {
	ID int64 `json:"id"`
}

func CreateShare(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	var payload CreateSharePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	receiver, err := db.Query().GetUserByName(ctx, payload.Receiver)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting receiver")
		return
	}

	if receiver.ID == userID {
		utils.ErrorResponse(c, 400, "Cannot share to youself")
		return
	}

	file, err := db.Query().GetFile(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid file id")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Forbidden")
		return
	}

	share, err := db.Query().NewShare(ctx, sqlc.NewShareParams{
		FileID:     file.ID,
		SenderID:   userID,
		ReceiverID: receiver.ID,

		EncryptedFek:      payload.EncryptedKey,
		EncryptedMetadata: payload.EncryptedMetadata,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating share")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":       "share_create",
		"shareId":      share.ID,
		"fileId":       file.ID,
		"receiverId":   receiver.ID,
		"receiverName": receiver.Username,
	}, file.EncryptedMetadata)

	utils.SuccessResponse(c, CreateShareResponse{
		ID: share.ID,
	})
}

type GetSharesPayload struct {
	Limit  int64 `form:"limit"`
	Offset int64 `form:"offset"`
}

type GetSharesResponse struct {
	ID                int64       `json:"id"`
	SenderID          int64       `json:"senderId"`
	ReceiverID        int64       `json:"receiverId"`
	Sender            string      `json:"sender"`
	EncryptedKey      utils.Bytes `json:"encryptedKey"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	CreatedAt         time.Time   `json:"createdAt"`
	ExpiresAt         time.Time   `json:"expiresAt"`
}

func GetShares(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	var payload GetSharesPayload

	if err := c.ShouldBindQuery(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	shares, err := db.Query().GetShares(ctx, sqlc.GetSharesParams{
		ReceiverID: userID,
		Limit:      int32(payload.Limit),
		Offset:     int32(payload.Offset),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting shares")
		return
	}

	var result = []GetSharesResponse{}

	for i := range shares {
		result = append(result, GetSharesResponse{
			ID:                shares[i].ID,
			SenderID:          shares[i].SenderID,
			ReceiverID:        shares[i].ReceiverID,
			EncryptedKey:      shares[i].EncryptedFek,
			EncryptedMetadata: shares[i].EncryptedMetadata,
			CreatedAt:         shares[i].CreatedAt.Time,
			ExpiresAt:         shares[i].ExpiresAt.Time,
			Sender:            shares[i].Sender,
		})
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "share_incoming_list",
		"limit":  payload.Limit,
		"offset": payload.Offset,
	}, nil)

	utils.SuccessResponse(c, result)
}

type GetMySharesResponse struct {
	ID                int64       `json:"id"`
	SenderID          int64       `json:"senderId"`
	ReceiverID        int64       `json:"receiverId"`
	Receiver          string      `json:"receiver"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	CreatedAt         time.Time   `json:"createdAt"`
	ExpiresAt         time.Time   `json:"expiresAt"`
}

func GetMyShares(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	offset, limit := utils.Pagination(c)

	shares, err := db.Query().GetSharesBySender(ctx, sqlc.GetSharesBySenderParams{
		SenderID: userID,
		Limit:    limit,
		Offset:   offset,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting shares")
		return
	}

	var result = []GetMySharesResponse{}

	for i := range shares {
		result = append(result, GetMySharesResponse{
			ID:                shares[i].ID,
			SenderID:          shares[i].SenderID,
			ReceiverID:        shares[i].ReceiverID,
			Receiver:          shares[i].Receiver,
			EncryptedMetadata: shares[i].EncryptedMetadata,
			CreatedAt:         shares[i].CreatedAt.Time,
			ExpiresAt:         shares[i].ExpiresAt.Time,
		})
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action": "share_outgoing_list",
		"limit":  limit,
		"offset": offset,
	}, nil)

	utils.SuccessResponse(c, result)
}

type GetShareResponse struct {
	Chunks     int32 `json:"chunks"`
	ChunkSize  int64 `json:"chunkSize"`
	Size       int64 `json:"size"`
	SenderID   int64 `json:"senderId"`
	ReceiverID int64 `json:"receiverId"`

	EncryptedKey      utils.Bytes `json:"encryptedKey"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

type GetSharePayload struct {
	ShareID int64 `uri:"share_id"`
}

func GetShare(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload GetSharePayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	share, err := db.Query().GetShare(ctx, payload.ShareID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting share")
		return
	}

	if share.ReceiverID != userID && share.SenderID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":  "share_get_metadata",
		"shareId": payload.ShareID,
	}, share.EncryptedMetadata)

	utils.SuccessResponse(c, GetShareResponse{
		Chunks:     share.Chunks,
		ChunkSize:  share.ChunkSize,
		Size:       share.Size,
		SenderID:   share.SenderID,
		ReceiverID: share.ReceiverID,

		EncryptedKey:      share.EncryptedFek,
		EncryptedMetadata: share.EncryptedMetadata,
	})
}

type GetShareChunkPayload struct {
	ShareID    int64 `uri:"share_id"`
	ChunkIndex int32 `uri:"chunk_index"`
}

type GetShareChunkResponse struct {
	URL     string              `json:"url"`
	Method  string              `json:"method"`
	Headers map[string][]string `json:"headers"`
}

func GetShareChunk(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload GetShareChunkPayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	chunk, err := db.Query().GetShareChunk(ctx, sqlc.GetShareChunkParams{
		ID:         payload.ShareID,
		ChunkIndex: payload.ChunkIndex,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting chunk")
		return
	}

	if chunk.ReceiverID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
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
		"action":     "share_download_chunk",
		"shareId":    payload.ShareID,
		"chunkIndex": payload.ChunkIndex,
	}, chunk.EncryptedMetadata)

	utils.SuccessResponse(c, GetShareChunkResponse{
		URL:     req.URL,
		Headers: req.SignedHeader,
		Method:  req.Method,
	})
}

type DeleteSharePayload struct {
	ShareID int64 `uri:"share_id"`
}

func DeleteShare(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload DeleteSharePayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	share, err := db.Query().GetShare(ctx, payload.ShareID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting row")
		return
	}

	if share.SenderID != userID {
		utils.ErrorResponse(c, 403, "Ownership mismatch")
		return
	}

	meta := share.EncryptedMetadata

	err = db.Query().InvalidateShare(ctx, payload.ShareID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating row")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":  "share_revoke",
		"shareId": payload.ShareID,
	}, meta)

	utils.SuccessResponse(c, nil)
}

type ListPublicSharesItem struct {
	Key              string      `json:"key"`
	EncrypedMetadata utils.Bytes `json:"encryptedMetadata"`
	CreatedAt        time.Time   `json:"createdAt"`
	ExpiresAt        time.Time   `json:"expiresAt"`
}

func ListPublicShares(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	offset, limit := utils.Pagination(c)

	shares, err := db.Query().ListPublicShares(ctx, sqlc.ListPublicSharesParams{
		OwnerID: userID,
		Limit:   limit,
		Offset:  offset,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when collecting shares")
		return
	}

	var result []ListPublicSharesItem = []ListPublicSharesItem{}

	for i := range shares {
		result = append(result, ListPublicSharesItem{
			Key:              shares[i].Key,
			EncrypedMetadata: shares[i].File.EncryptedMetadata,
			CreatedAt:        shares[i].CreatedAt.Time,
			ExpiresAt:        shares[i].ExpiresAt.Time,
		})
	}

	utils.SuccessResponse(c, result)
}

type CreatePublicSharePayload struct {
	FileID int64 `json:"fileId"`

	EncryptedKey      utils.Bytes `json:"encryptedKey"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
}

type CreatePublicShareResponse struct {
	ID  int64  `json:"id"`
	Key string `json:"key"`
}

func CreatePublicShare(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	var payload CreatePublicSharePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	file, err := db.Query().GetFile(ctx, payload.FileID)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid file id")
		return
	}

	if file.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Forbidden")
		return
	}

	key, err := gonanoid.New()

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when generating key")
		return
	}

	share, err := db.Query().NewPublicShare(ctx, sqlc.NewPublicShareParams{
		FileID:  file.ID,
		OwnerID: userID,
		Key:     key,

		EncryptedKey:      payload.EncryptedKey,
		EncryptedMetadata: payload.EncryptedMetadata,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating share")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":  "public_share_create",
		"shareId": share.ID,
		"fileId":  file.ID,
	}, file.EncryptedMetadata)

	utils.SuccessResponse(c, CreatePublicShareResponse{
		ID:  share.ID,
		Key: key,
	})
}

type GetPublicShareResponse struct {
	Key               string      `json:"key"`
	Owner             string      `json:"owner"`
	Size              int64       `json:"size"`
	Chunks            int32       `json:"chunks"`
	ChunkSize         int64       `json:"chunkSize"`
	CreatedAt         time.Time   `json:"createdAt"`
	EncryptedMetadata utils.Bytes `json:"encryptedMetadata"`
	EncryptedKey      utils.Bytes `json:"encryptedKey"`
}

func GetPublicShare(c *gin.Context) {
	ctx := c.Request.Context()
	key := c.Param("key")

	if len(key) == 0 {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	share, err := db.Query().GetPublicShare(ctx, key)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting share")
		return
	}

	utils.SuccessResponse(c, GetPublicShareResponse{
		Key:               key,
		Owner:             share.User.Username,
		Size:              share.File.Size,
		Chunks:            share.File.Chunks,
		ChunkSize:         share.File.ChunkSize,
		CreatedAt:         share.CreatedAt.Time,
		EncryptedMetadata: share.EncryptedMetadata,
		EncryptedKey:      share.EncryptedKey,
	})
}

type ResolvePublicSharePayload struct {
	Key        string `uri:"key"`
	ChunkIndex int32  `uri:"index"`
}

type ResolvePublicShareResponse struct {
	URL     string              `json:"url"`
	Headers map[string][]string `json:"headers"`
}

func ResolvePublicShare(c *gin.Context) {
	ctx := c.Request.Context()

	var payload ResolvePublicSharePayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	share, err := db.Query().GetPublicShare(ctx, payload.Key)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting share")
		return
	}

	chunk, err := db.Query().GetChunk(ctx, sqlc.GetChunkParams{
		FileID:     share.FileID,
		ChunkIndex: payload.ChunkIndex,
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

	utils.SuccessResponse(c, ResolvePublicShareResponse{
		URL:     req.URL,
		Headers: req.SignedHeader,
	})
}

type RevokePublicSharePayload struct {
	Key string `uri:"key"`
}

func RevokePublicShare(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	var payload RevokePublicSharePayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	share, err := db.Query().GetPublicShare(ctx, payload.Key)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting share")
		return
	}

	if share.OwnerID != userID {
		utils.ErrorResponse(c, 403, "Forbidden")
		return
	}

	err = db.Query().RevokePublicShare(ctx, payload.Key)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating share")
		return
	}

	utils.SuccessResponse(c, nil)
}
