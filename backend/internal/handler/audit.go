package handler

import (
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type AuditLogItem struct {
	ID                  int64         `json:"id"`
	Level               sqlc.LogLevel `json:"level"`
	Message             utils.Bytes   `json:"message"`
	EncryptedMetadata   utils.Bytes   `json:"encryptedMetadata,omitempty"`
	CreatedAt           time.Time     `json:"createdAt"`
}

type ListAuditLogsResponse struct {
	Total int64          `json:"total"`
	Items []AuditLogItem `json:"items"`
}

func ListAuditLogs(c *gin.Context) {
	userID := c.GetInt64("UserID")

	limit := int32(20)
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.ParseInt(l, 10, 32); err == nil && v > 0 && v <= 100 {
			limit = int32(v)
		}
	}

	offset := int32(0)
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.ParseInt(o, 10, 32); err == nil && v >= 0 {
			offset = int32(v)
		}
	}

	ctx := c.Request.Context()

	total, err := db.Query().CountLogsForOwner(ctx, userID)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when counting logs")
		return
	}

	rows, err := db.Query().ListLogsForOwner(ctx, sqlc.ListLogsForOwnerParams{
		OwnerID: userID,
		Limit:   limit,
		Offset:  offset,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing logs")
		return
	}

	items := make([]AuditLogItem, 0, len(rows))
	for i := range rows {
		item := AuditLogItem{
			ID:        rows[i].ID,
			Level:     rows[i].Level,
			Message:   rows[i].Message,
			CreatedAt: rows[i].CreatedAt.Time,
		}
		if len(rows[i].EncryptedMetadata) > 0 {
			item.EncryptedMetadata = rows[i].EncryptedMetadata
		}
		items = append(items, item)
	}

	utils.SuccessResponse(c, ListAuditLogsResponse{
		Total: total,
		Items: items,
	})
}
