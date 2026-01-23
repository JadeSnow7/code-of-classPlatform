package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
)

type UserContext struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

const userContextKey = "user"

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

func GetUser(c *gin.Context) (UserContext, bool) {
	v, ok := c.Get(userContextKey)
	if !ok {
		return UserContext{}, false
	}
	u, ok := v.(UserContext)
	return u, ok
}
