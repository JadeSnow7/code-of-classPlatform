package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AIConfigHandlers interface for user AI config handlers.
type AIConfigHandlers interface {
	GetMyAIConfig(c *gin.Context)
	PatchMyAIConfig(c *gin.Context)
}

// RegisterAIConfigRoutes registers AI config routes.
func RegisterAIConfigRoutes(api *gin.RouterGroup, jwtSecret string, h AIConfigHandlers) {
	api.GET("/users/me/ai-config", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermUserStats), h.GetMyAIConfig)
	api.PATCH("/users/me/ai-config", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermUserStats), h.PatchMyAIConfig)
}
