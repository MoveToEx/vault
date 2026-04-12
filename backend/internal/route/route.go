package route

import (
	"backend/internal/handler"
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	public := r.Group("/")

	public.GET("/public/site-config", handler.GetPublicSiteConfig)

	{
		auth := public.Group("/auth")
		auth.Use(middleware.RateLimitMiddleware())
		auth.POST("/register/start", handler.RegisterStart)
		auth.POST("/register/finish", handler.RegisterFinish)
		auth.POST("/login/start", handler.LoginStart)
		auth.POST("/login/finish", handler.LoginFinish)
		auth.POST("/refresh", handler.Refresh)
	}

	{
		protected := public.Group("/")
		protected.Use(middleware.AuthMiddleware())
		protected.GET("/auth/get", handler.GetIdentity)
		protected.POST("/me/password/start", handler.PasswordChangeStart)
		protected.POST("/me/password/finish", handler.PasswordChangeFinish)
		protected.GET("/me/sessions", handler.ListSessions)
		protected.DELETE("/me/sessions/:session_id", handler.RevokeSession)
		protected.DELETE("/me/account", handler.DeleteAccount)

		protected.GET("/audit/logs", handler.ListAuditLogs)

		protected.GET("/me/capacity", handler.GetCapacity)

		protected.POST("/upload/init", handler.InitUpload)
		protected.GET("/upload", handler.GetUploadSessions)
		protected.POST("/upload/:upload_id/:chunk_index/init", handler.UploadChunkInit)
		protected.POST("/upload/:upload_id/:chunk_index/complete", handler.UploadChunkComplete)
		protected.POST("/upload/:upload_id", handler.UploadComplete)

		protected.POST("/folder", handler.NewFolder)
		protected.PUT("/folder/:folder_id", handler.UpdateFolder)
		protected.DELETE("/folder/:folder_id", handler.DeleteFolder)

		protected.GET("/files", handler.GetFiles)
		protected.GET("/files/:file_id", handler.GetFile)
		protected.GET("/files/:file_id/:chunk_index", handler.GetChunk)
		protected.POST("/files/:file_id", handler.UpdateFile)
		protected.DELETE("/files/:file_id", handler.DeleteFile)

		protected.GET("/share/lookup", handler.FindUser)
		protected.POST("/share", handler.CreateShare)
		protected.GET("/share", handler.GetShares)
		protected.GET("/share/my", handler.GetMyShares)
		protected.GET("/share/:share_id", handler.GetShare)
		protected.GET("/share/:share_id/:chunk_index", handler.GetShareChunk)
		protected.DELETE("/share/:share_id", handler.DeleteShare)

		protected.GET("/user/:username", handler.GetUser)

		admin := protected.Group("/admin")
		admin.Use(middleware.AdminMiddleware())
		admin.GET("/stats", handler.AdminStats)
		admin.GET("/site-config", handler.AdminGetSiteConfig)
		admin.PATCH("/site-config", handler.AdminPatchSiteConfig)
		admin.GET("/users", handler.AdminListUsers)
		admin.PATCH("/users/:user_id/capacity", handler.AdminPatchUserCapacity)
		admin.PATCH("/users/:user_id/active", handler.AdminPatchUserActive)
	}
}
