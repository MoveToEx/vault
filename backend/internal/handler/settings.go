package handler

import (
	"backend/internal/db"
	"backend/internal/permission"
	"backend/internal/queue"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type sessionDTO struct {
	ID         int64      `json:"id"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
	Current    bool       `json:"current"`
}

func pgTime(t pgtype.Timestamptz) time.Time {
	return t.Time
}

func pgTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time
	return &tt
}

// ListSessions returns refresh-token sessions for the signed-in user.
// Optional header X-Vault-Refresh-Token marks the matching row as current.
func ListSessions(c *gin.Context) {
	userID := c.GetInt64("UserID")
	ctx := c.Request.Context()

	rows, err := db.Query().ListSessionsByUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing sessions")
		return
	}

	currentRefresh := c.GetHeader("X-Vault-Refresh-Token")

	var currentID int64

	if currentRefresh != "" {
		sess, err := db.Query().GetSession(ctx, currentRefresh)
		if err == nil && sess.UserID == userID {
			currentID = sess.ID
		}
	}

	out := make([]sessionDTO, 0, len(rows))

	for _, row := range rows {
		cur := currentID != 0 && row.ID == currentID

		out = append(out, sessionDTO{
			ID:         row.ID,
			CreatedAt:  pgTime(row.CreatedAt),
			ExpiresAt:  pgTime(row.ExpiresAt),
			LastUsedAt: pgTimePtr(row.LastUsedAt),
			Current:    cur,
		})
	}

	utils.SuccessResponse(c, out)
}

func RevokeSession(c *gin.Context) {
	userID := c.GetInt64("UserID")

	id, err := strconv.ParseInt(c.Param("session_id"), 10, 64)

	if err != nil || id < 1 {
		utils.ErrorResponse(c, 400, "Invalid session id")
		return
	}

	ctx := c.Request.Context()

	if err := db.Query().DeleteSessionByIDForUser(ctx, sqlc.DeleteSessionByIDForUserParams{
		ID:     id,
		UserID: userID,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when revoking session")
		return
	}

	utils.AppendLog(ctx, userID, sqlc.LogLevelInfo, map[string]any{
		"action":    "session_revoke",
		"sessionId": id,
	}, nil)

	utils.SuccessResponse(c, nil)
}

type deleteAccountPayload struct {
	ConfirmUsername string `json:"confirmUsername"`
}

// DeleteAccount removes the signed-in user, vault data, and storage objects.
func DeleteAccount(c *gin.Context) {
	var payload deleteAccountPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	userID := c.GetInt64("UserID")
	ctx := c.Request.Context()

	u, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			utils.ErrorResponse(c, 404, "User not found")
			return
		}
		utils.ErrorResponse(c, 500, "Failed when loading user")
		return
	}

	if u.Username != payload.ConfirmUsername {
		utils.ErrorResponse(c, 400, "Confirmation does not match username")
		return
	}

	if permission.IsAdmin(u.Permission) {
		others, err := db.Query().CountOtherActiveAdmins(ctx, userID)
		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when validating administrators")
			return
		}
		if others == 0 {
			utils.ErrorResponse(c, 400, "Cannot delete the last active administrator")
			return
		}
	}

	incompleteIDs, err := db.Query().ListIncompleteUploadIDsByUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing uploads")
		return
	}

	for _, upID := range incompleteIDs {
		keys, err := db.Query().ListUploadChunks(ctx, upID)
		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when listing upload chunks")
			return
		}
		if err := queue.EnqueueS3Deletion(ctx, keys); err != nil {
			utils.ErrorResponse(c, 500, "Failed when scheduling storage cleanup")
			return
		}
		if err := db.Query().DeleteUploadChunks(ctx, upID); err != nil {
			utils.ErrorResponse(c, 500, "Failed when removing upload chunks")
			return
		}
		if err := db.Query().DeleteIncompleteUpload(ctx, upID); err != nil {
			utils.ErrorResponse(c, 500, "Failed when removing upload")
			return
		}
	}

	if err := db.Query().DeleteSharesForUser(ctx, userID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when removing shares")
		return
	}

	if err := db.Query().DeleteSessionsByUser(ctx, userID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when revoking sessions")
		return
	}

	if err := db.Query().DeleteUploadChunksByUser(ctx, userID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when clearing upload chunks")
		return
	}

	if err := db.Query().DeleteUploadsByUser(ctx, userID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when removing uploads")
		return
	}

	if u.RootFolder.Valid {
		keys, err := db.Query().TraverseChunks(ctx, u.RootFolder.Int64)
		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when listing file chunks")
			return
		}
		if err := queue.EnqueueS3Deletion(ctx, keys); err != nil {
			utils.ErrorResponse(c, 500, "Failed when scheduling storage cleanup")
			return
		}
		if err := db.Query().DeleteFiles(ctx, u.RootFolder.Int64); err != nil {
			utils.ErrorResponse(c, 500, "Failed when removing files")
			return
		}
		if err := db.Query().DeleteFolders(ctx, u.RootFolder.Int64); err != nil {
			utils.ErrorResponse(c, 500, "Failed when removing folders")
			return
		}

		utils.SuccessResponse(c, nil)
		return
	}

	if err := db.Query().DeleteUserByID(ctx, userID); err != nil {
		utils.ErrorResponse(c, 500, "Failed when removing account")
		return
	}

	utils.SuccessResponse(c, nil)
}
