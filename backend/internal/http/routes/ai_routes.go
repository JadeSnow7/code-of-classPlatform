package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AIHandlers interface for AI handler methods
type AIHandlers interface {
	Chat(c *gin.Context)
	ChatMultimodal(c *gin.Context)
	ChatWithTools(c *gin.Context)
	ChatGuided(c *gin.Context)
}

// RegisterAIRoutes registers AI routes
func RegisterAIRoutes(api *gin.RouterGroup, jwtSecret string, aiLimiter *middleware.RateLimiter, h AIHandlers) {
	api.POST("/ai/chat", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.Chat)
	api.POST("/ai/chat/multimodal", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatMultimodal)
	api.POST("/ai/chat_with_tools", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatWithTools)
	api.POST("/ai/chat/guided", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatGuided)
}
