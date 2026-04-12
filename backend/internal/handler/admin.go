package handler

import (
	"backend/internal/db"
	"backend/internal/permission"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type AdminStatsResponse struct {
	UserCount            int64 `json:"userCount"`
	FileCount            int64 `json:"fileCount"`
	TotalStoredBytes     int64 `json:"totalStoredBytes"`
	ActiveUploadSessions int64 `json:"activeUploadSessions"`
}

func AdminStats(c *gin.Context) {
	ctx := c.Request.Context()

	userCount, err := db.Query().CountUsers(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading statistics")
		return
	}

	fileCount, err := db.Query().CountFiles(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading statistics")
		return
	}

	totalBytes, err := db.Query().GetTotalSize(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading statistics")
		return
	}

	activeUploads, err := db.Query().CountActiveUploads(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading statistics")
		return
	}

	utils.SuccessResponse(c, AdminStatsResponse{
		UserCount:            userCount,
		FileCount:            fileCount,
		TotalStoredBytes:     totalBytes,
		ActiveUploadSessions: activeUploads,
	})
}

type SiteConfigDTO struct {
	UploadExpirySeconds      int32 `json:"uploadExpirySeconds"`
	RegistrationOpen         bool  `json:"registrationOpen"`
	DefaultUserCapacityBytes int64 `json:"defaultUserCapacityBytes"`
}

func AdminGetSiteConfig(c *gin.Context) {
	ctx := c.Request.Context()

	cfg, err := db.Query().GetSiteConfig(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when reading site configuration")
		return
	}

	utils.SuccessResponse(c, SiteConfigDTO{
		UploadExpirySeconds:      cfg.UploadExpirySeconds,
		RegistrationOpen:         cfg.RegistrationOpen,
		DefaultUserCapacityBytes: cfg.DefaultUserCapacityBytes,
	})
}

type PatchSiteConfigPayload struct {
	UploadExpirySeconds      int32 `json:"uploadExpirySeconds"`
	RegistrationOpen         bool  `json:"registrationOpen"`
	DefaultUserCapacityBytes int64 `json:"defaultUserCapacityBytes"`
}

func AdminPatchSiteConfig(c *gin.Context) {
	var payload PatchSiteConfigPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	if payload.UploadExpirySeconds < 60 || payload.UploadExpirySeconds > 86400*7 {
		utils.ErrorResponse(c, 400, "Upload expiry must be between 60 seconds and 7 days")
		return
	}

	if payload.DefaultUserCapacityBytes < 1<<20 || payload.DefaultUserCapacityBytes > 1<<40 {
		utils.ErrorResponse(c, 400, "Default capacity must be between 1 MiB and 1 TiB")
		return
	}

	ctx := c.Request.Context()

	if err := db.Query().UpdateSiteConfig(ctx, sqlc.UpdateSiteConfigParams{
		UploadExpirySeconds:      payload.UploadExpirySeconds,
		RegistrationOpen:         payload.RegistrationOpen,
		DefaultUserCapacityBytes: payload.DefaultUserCapacityBytes,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating site configuration")
		return
	}

	utils.AppendLog(ctx, c.GetInt64("UserID"), sqlc.LogLevelInfo, map[string]any{
		"action": "admin_site_config_update",
	}, nil)

	utils.SuccessResponse(c, nil)
}

type AdminUserRow struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	Username    string    `json:"username"`
	Permission  int64     `json:"permission"`
	Capacity    int64     `json:"capacity"`
	IsActive    bool      `json:"isActive"`
	IsLocked    bool      `json:"isLocked"`
	CreatedAt   time.Time `json:"createdAt"`
	LastLoginAt time.Time `json:"lastLoginAt"`
}

type AdminListUsersResponse struct {
	Total int64          `json:"total"`
	Items []AdminUserRow `json:"items"`
}

func AdminListUsers(c *gin.Context) {
	limit, err := strconv.ParseInt(c.Query("limit"), 10, 32)

	if err != nil || limit < 1 {
		limit = 50
	}

	if limit > 200 {
		limit = 200
	}

	offset, err := strconv.ParseInt(c.Query("offset"), 10, 32)

	if err != nil || offset < 0 {
		offset = 0
	}

	ctx := c.Request.Context()

	total, err := db.Query().CountUsersAdmin(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing users")
		return
	}

	rows, err := db.Query().ListUsersAdmin(ctx, sqlc.ListUsersAdminParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when listing users")
		return
	}

	items := make([]AdminUserRow, 0, len(rows))

	for _, r := range rows {
		items = append(items, AdminUserRow{
			ID:          r.ID,
			Email:       r.Email,
			Username:    r.Username,
			Permission:  r.Permission,
			Capacity:    r.Capacity,
			IsActive:    r.IsActive,
			IsLocked:    r.IsLocked,
			CreatedAt:   r.CreatedAt.Time,
			LastLoginAt: r.LastLoginAt.Time,
		})
	}

	utils.SuccessResponse(c, AdminListUsersResponse{
		Total: total,
		Items: items,
	})
}

type PatchUserCapacityPayload struct {
	Capacity int64 `json:"capacity"`
}

func AdminPatchUserCapacity(c *gin.Context) {
	adminID := c.GetInt64("UserID")

	id, err := strconv.ParseInt(c.Param("user_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid user id")
		return
	}

	var payload PatchUserCapacityPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	if payload.Capacity < 1<<20 || payload.Capacity > 1<<40 {
		utils.ErrorResponse(c, 400, "Capacity must be between 1 MiB and 1 TiB")
		return
	}

	ctx := c.Request.Context()

	_, err = db.Query().GetUser(ctx, id)

	if err != nil {
		utils.ErrorResponse(c, 404, "User not found")
		return
	}

	used, err := db.Query().GetUsedCapacity(ctx, id)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when checking capacity")
		return
	}

	if payload.Capacity < used {
		utils.ErrorResponse(c, 400, "Capacity cannot be below current storage usage")
		return
	}

	if err := db.Query().UpdateUserCapacity(ctx, sqlc.UpdateUserCapacityParams{
		ID:       id,
		Capacity: payload.Capacity,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating capacity")
		return
	}

	utils.AppendLog(ctx, adminID, sqlc.LogLevelInfo, map[string]any{
		"action":       "admin_user_capacity",
		"targetUserId": id,
		"capacity":     payload.Capacity,
	}, nil)

	utils.SuccessResponse(c, nil)
}

type PatchUserActivePayload struct {
	IsActive bool `json:"isActive"`
}

func AdminPatchUserActive(c *gin.Context) {
	adminID := c.GetInt64("UserID")

	id, err := strconv.ParseInt(c.Param("user_id"), 10, 64)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid user id")
		return
	}

	var payload PatchUserActivePayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	if id == adminID {
		utils.ErrorResponse(c, 400, "You cannot change your own active status")
		return
	}

	ctx := c.Request.Context()

	target, err := db.Query().GetUser(ctx, id)

	if err != nil {
		utils.ErrorResponse(c, 404, "User not found")
		return
	}

	if target.Permission == permission.Admin && !payload.IsActive {
		others, err := db.Query().CountOtherActiveAdmins(ctx, id)

		if err != nil {
			utils.ErrorResponse(c, 500, "Failed when validating administrators")
			return
		}

		if others == 0 {
			utils.ErrorResponse(c, 400, "Cannot disable the last active administrator")
			return
		}
	}

	if err := db.Query().SetUserActive(ctx, sqlc.SetUserActiveParams{
		ID:       id,
		IsActive: payload.IsActive,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating user")
		return
	}

	if !payload.IsActive {
		if err := db.Query().DeleteSessionsByUser(ctx, id); err != nil {
			utils.ErrorResponse(c, 500, "Failed when revoking sessions")
			return
		}
	}

	utils.AppendLog(ctx, adminID, sqlc.LogLevelInfo, map[string]any{
		"action":       "admin_user_active",
		"targetUserId": id,
		"isActive":     payload.IsActive,
	}, nil)

	utils.SuccessResponse(c, nil)
}
