package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SharedTokenRequired protects internal service-to-service endpoints.
func SharedTokenRequired(expected string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(c.GetHeader("X-AI-Gateway-Token"))
		if strings.TrimSpace(expected) == "" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "shared token is not configured"})
			return
		}
		if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(expected)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid shared token"})
			return
		}
		c.Next()
	}
}
