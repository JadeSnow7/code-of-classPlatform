package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
)

// UserContext stores authenticated user info in the request context.
type UserContext struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

const userContextKey = "user"

// AuthRequired validates the JWT and injects UserContext into the request.
func AuthRequired(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authz := c.GetHeader("Authorization")
		if authz == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
			return
		}
		tokenString := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer"))
		tokenString = strings.TrimSpace(tokenString)
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}

		claims, err := auth.ParseToken(jwtSecret, tokenString)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(userContextKey, UserContext{
			ID:       claims.UserID,
			Username: claims.Username,
			Role:     claims.Role,
		})
		c.Next()
	}
}

// GetUser returns the authenticated user from the Gin context.
func GetUser(c *gin.Context) (UserContext, bool) {
	v, ok := c.Get(userContextKey)
	if !ok {
		return UserContext{}, false
	}
	u, ok := v.(UserContext)
	return u, ok
}
