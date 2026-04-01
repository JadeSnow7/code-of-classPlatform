package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AIHandlers interface for AI handler methods
type AIHandlers interface {
	Health(c *gin.Context)
	Chat(c *gin.Context)
	ChatOrchestrated(c *gin.Context)
	ChatMultimodal(c *gin.Context)
	ChatWithTools(c *gin.Context)
	ChatGuided(c *gin.Context)
	Derive(c *gin.Context)
	CreateSession(c *gin.Context)
	ListSessions(c *gin.Context)
	DeleteSession(c *gin.Context)
	ListSessionMessages(c *gin.Context)
	RunSession(c *gin.Context)
}

// RegisterAIRoutes registers AI routes
func RegisterAIRoutes(api *gin.RouterGroup, jwtSecret string, aiLimiter *middleware.RateLimiter, h AIHandlers) {
	api.GET("/ai/health", h.Health)
	api.POST("/ai/chat", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.Chat)
	api.POST("/ai/orchestrated", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatOrchestrated)
	api.POST("/ai/chat/multimodal", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatMultimodal)
	api.POST("/ai/chat_with_tools", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatWithTools)
	api.POST("/ai/chat/guided", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ChatGuided)
	api.POST("/ai/derive", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.Derive)
	api.POST("/ai/sessions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.CreateSession)
	api.GET("/ai/sessions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ListSessions)
	api.DELETE("/ai/sessions/:sessionId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.DeleteSession)
	api.GET("/ai/sessions/:sessionId/messages", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.ListSessionMessages)
	api.POST("/ai/sessions/:sessionId/runs", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAIUse), middleware.RateLimitByUserOrIP(aiLimiter), h.RunSession)
}
