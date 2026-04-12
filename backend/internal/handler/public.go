package handler

import (
	"backend/internal/db"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type PublicSiteConfigResponse struct {
	RegistrationOpen bool `json:"registrationOpen"`
}

func GetPublicSiteConfig(c *gin.Context) {
	ctx := c.Request.Context()

	cfg, err := db.Query().GetSiteConfig(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when reading site configuration")
		return
	}

	utils.SuccessResponse(c, PublicSiteConfigResponse{
		RegistrationOpen: cfg.RegistrationOpen,
	})
}
