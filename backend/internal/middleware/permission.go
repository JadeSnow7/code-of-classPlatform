package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/authz"
)

func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := GetUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if !authz.HasPermission(u.Role, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}
