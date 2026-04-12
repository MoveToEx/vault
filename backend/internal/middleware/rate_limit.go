package middleware

import (
	"backend/internal/config"
	"backend/internal/utils"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	authRateLimitMaxRequests = 10
	authRateLimitWindow      = time.Minute
)

func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := authRateLimitKey(c)
		ctx := c.Request.Context()

		count, err := config.Redis().Incr(ctx, key).Result()
		if err != nil {
			slog.WarnContext(ctx, "auth rate limit unavailable", "err", err, "path", c.FullPath(), "client_ip", c.ClientIP())
			utils.ErrorResponse(c, http.StatusServiceUnavailable, "Service temporarily unavailable")
			c.Abort()
			return
		}

		if count == 1 {
			if err := config.Redis().Expire(ctx, key, authRateLimitWindow).Err(); err != nil {
				slog.WarnContext(ctx, "auth rate limit expire failed", "err", err, "path", c.FullPath())
			}
		}

		ttl, err := config.Redis().TTL(ctx, key).Result()
		if err != nil {
			slog.WarnContext(ctx, "auth rate limit ttl failed", "err", err, "path", c.FullPath())
			ttl = authRateLimitWindow
		}

		remaining := authRateLimitMaxRequests - count
		if remaining < 0 {
			remaining = 0
		}

		c.Header("X-RateLimit-Limit", strconv.FormatInt(authRateLimitMaxRequests, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(remaining, 10))

		if count > authRateLimitMaxRequests {
			retryAfter := int64(ttl.Seconds())
			if retryAfter < 1 {
				retryAfter = 1
			}

			c.Header("Retry-After", strconv.FormatInt(retryAfter, 10))
			utils.ErrorResponse(c, http.StatusTooManyRequests, "Too many auth requests, please try again later")
			c.Abort()
			return
		}

		c.Next()
	}
}

func authRateLimitKey(c *gin.Context) string {
	path := c.FullPath()
	if path == "" {
		path = c.Request.URL.Path
	}

	path = strings.Trim(path, "/")
	path = strings.ReplaceAll(path, "/", ":")

	if path == "" {
		path = "root"
	}

	return "rate_limit:auth:" + path + ":" + c.ClientIP()
}
