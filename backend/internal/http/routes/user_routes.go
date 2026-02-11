package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// UserHandlers interface for user handler methods
type UserHandlers interface {
	GetStats(c *gin.Context)
}

// RegisterUserRoutes registers user routes
func RegisterUserRoutes(api *gin.RouterGroup, jwtSecret string, h UserHandlers) {
	// User stats route
	api.GET("/user/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermUserStats), h.GetStats)

	// Compatibility alias for mobile client
	api.GET("/users/me/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermUserStats), h.GetStats)
}
