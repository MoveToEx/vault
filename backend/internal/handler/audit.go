package handler

import (
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
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

var validAuditLevels = map[string]struct{}{
	string(sqlc.LogLevelTrace):    {},
	string(sqlc.LogLevelInfo):     {},
	string(sqlc.LogLevelWarning):  {},
	string(sqlc.LogLevelCritical): {},
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

	levelFilter := c.Query("level")
	if levelFilter != "" {
		if _, ok := validAuditLevels[levelFilter]; !ok {
			utils.ErrorResponse(c, 400, "Invalid level filter")
			return
		}
	}

	var createdAfter pgtype.Timestamptz
	if from := c.Query("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			utils.ErrorResponse(c, 400, "Invalid from time (use RFC3339)")
			return
		}
		createdAfter = pgtype.Timestamptz{Time: t.UTC(), Valid: true}
	}

	var createdBefore pgtype.Timestamptz
	if to := c.Query("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			utils.ErrorResponse(c, 400, "Invalid to time (use RFC3339)")
			return
		}
		createdBefore = pgtype.Timestamptz{Time: t.UTC(), Valid: true}
	}

	if createdAfter.Valid && createdBefore.Valid && createdAfter.Time.After(createdBefore.Time) {
		utils.ErrorResponse(c, 400, "from must be before or equal to to")
		return
	}

	ctx := c.Request.Context()

	countArg := sqlc.CountLogsForOwnerParams{
		OwnerID:       userID,
		LevelFilter:   levelFilter,
		CreatedAfter:  createdAfter,
		CreatedBefore: createdBefore,
	}

	total, err := db.Query().CountLogsForOwner(ctx, countArg)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when counting logs")
		return
	}

	rows, err := db.Query().ListLogsForOwner(ctx, sqlc.ListLogsForOwnerParams{
		OwnerID:       userID,
		LevelFilter:   levelFilter,
		CreatedAfter:  createdAfter,
		CreatedBefore: createdBefore,
		OffsetRows:    offset,
		LimitRows:     limit,
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
