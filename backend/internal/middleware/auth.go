package middleware

import (
	"backend/internal/db"
	"backend/internal/permission"
	"backend/internal/utils"
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
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

		userID, err := strconv.ParseInt(claims.Subject, 10, 64)

		if err != nil {
			utils.ErrorResponse(c, 401, "Invalid session")
			c.Abort()
			return
		}

		ctx := c.Request.Context()
		authRow, err := db.Query().GetUserAuthByID(ctx, userID)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				utils.ErrorResponse(c, 401, "Invalid session")
			} else {
				utils.ErrorResponse(c, 500, "Failed when validating session")
			}
			c.Abort()
			return
		}

		if !authRow.IsActive {
			utils.ErrorResponse(c, 403, "Account is disabled")
			c.Abort()
			return
		}

		c.Set("UserID", userID)
		c.Set("Permission", authRow.Permission)

		c.Next()
	}
}

func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		p, ok := c.Get("Permission")

		if !ok {
			utils.ErrorResponse(c, 401, "Invalid session")
			c.Abort()
			return
		}

		perm, ok := p.(int64)

		if !ok {
			utils.ErrorResponse(c, 500, "Invalid session state")
			c.Abort()
			return
		}

		if !permission.IsAdmin(perm) {
			utils.ErrorResponse(c, 403, "Admin access required")
			c.Abort()
			return
		}

		c.Next()
	}
}
