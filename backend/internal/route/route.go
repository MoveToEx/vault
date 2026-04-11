package route

import (
	"backend/internal/handler"
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	public := r.Group("/")

	{
		auth := public.Group("/auth")
		auth.POST("/register/finish", handler.RegisterFinish)
		auth.POST("/login/finish", handler.LoginFinish)
		auth.POST("/refresh", handler.Refresh)
	}

	{
		auth := public.Group("/auth")
		auth.Use(middleware.RateLimitMiddleware())
		auth.POST("/register/start", handler.RegisterStart)
		auth.POST("/login/start", handler.LoginStart)
	}

	{
		protected := public.Group("/")
		protected.Use(middleware.AuthMiddleware())
		protected.GET("/auth/get", handler.GetIdentity)

		protected.GET("/audit/logs", handler.ListAuditLogs)

		protected.GET("/me/capacity", handler.GetCapacity)

		protected.POST("/upload/init", handler.InitUpload)
		protected.GET("/upload", handler.GetUploadSessions)
		protected.POST("/upload/:upload_id/chunks/:chunk_index/init", handler.UploadChunkInit)
		protected.POST("/upload/:upload_id/chunks/:chunk_index/complete", handler.UploadChunkComplete)
		protected.POST("/upload/:upload_id", handler.UploadComplete)

		protected.GET("/files", handler.GetFiles)
		protected.POST("/files/folder", handler.NewFolder)
		protected.GET("/files/:file_id", handler.GetFile)
		protected.GET("/files/:file_id/:chunk_index", handler.GetChunk)
		protected.POST("/files/:file_id", handler.UpdateFile)
		protected.POST("/files/folder/:folder_id", handler.UpdateFolder)
		protected.DELETE("/files/:file_id", handler.DeleteFile)

		protected.GET("/share/lookup", handler.FindUser)
		protected.POST("/share", handler.CreateShare)
		protected.GET("/share", handler.GetShares)
		protected.GET("/share/my", handler.GetMyShares)
		protected.GET("/share/:share_id", handler.GetShare)
		protected.GET("/share/:share_id/:chunk_index", handler.GetShareChunk)
		protected.DELETE("/share/:share_id", handler.DeleteShare)

		protected.GET("/user/:username", handler.GetUser)
	}
}
