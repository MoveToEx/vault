package handler

import (
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type GetUserPayload struct {
	Username string `uri:"username"`
}

type GetUserResponse struct {
	ID        int64       `json:"id"`
	Username  string      `json:"username"`
	PublicKey utils.Bytes `json:"publicKey"`
}

func GetUser(c *gin.Context) {
	ctx := c.Request.Context()

	var payload GetUserPayload

	if err := c.ShouldBindUri(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	user, err := db.Query().GetUserByName(ctx, payload.Username)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting user")
		return
	}

	viewerID := c.GetInt64("UserID")
	utils.AppendLog(ctx, viewerID, sqlc.LogLevelTrace, map[string]any{
		"action":       "user_profile_lookup",
		"targetUserId": user.ID,
		"username":     payload.Username,
	}, nil)

	utils.SuccessResponse(c, GetUserResponse{
		ID:        user.ID,
		Username:  user.Username,
		PublicKey: user.PublicKey,
	})
}
