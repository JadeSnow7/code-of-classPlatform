package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// FeishuHandlers interface for Feishu handler methods.
type FeishuHandlers interface {
	Login(c *gin.Context)
	Notify(c *gin.Context)
}

// RegisterFeishuRoutes registers Feishu login and bot notification routes.
func RegisterFeishuRoutes(api *gin.RouterGroup, jwtSecret string, h FeishuHandlers) {
	api.POST("/auth/feishu", h.Login)
	api.POST("/feishu/notify", middleware.AuthRequired(jwtSecret), h.Notify)
}
