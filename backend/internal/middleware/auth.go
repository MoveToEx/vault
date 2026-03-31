package middleware

import (
	"backend/internal/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		val, ok := c.Request.Header["Authorization"]

		if !ok || len(val) < 1 {
			utils.ErrorResponse(c, 401, "Invalid authorization")
			c.Abort()
			return
		}

		parts := strings.Split(val[0], " ")

		if len(parts) < 2 {
			utils.ErrorResponse(c, 401, "Invalid authorization")
			c.Abort()
			return
		}

		if parts[0] != "Bearer" {
			utils.ErrorResponse(c, 401, "Invalid authorization")
			c.Abort()
			return
		}

		claims, err := utils.ParseToken(parts[1])

		if err != nil {
			utils.ErrorResponse(c, 401, "Invalid session")
			c.Abort()
			return
		}

		c.Set("UserID", claims.UserID)
		c.Set("Permission", claims.Permission)

		c.Next()
	}
}
