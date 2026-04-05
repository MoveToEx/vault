package handler

import (
	"backend/internal/db"
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

	utils.SuccessResponse(c, GetUserResponse{
		ID:        user.ID,
		Username:  user.Username,
		PublicKey: user.PublicKey,
	})
}
