package routes

import (
	"github.com/gin-gonic/gin"
)

// WecomHandlers interface for WeChat Work handler methods
type WecomHandlers interface {
	Login(c *gin.Context)
	GetJSConfig(c *gin.Context)
	GetOAuthURL(c *gin.Context)
}

// RegisterWecomRoutes registers WeChat Work OAuth routes
func RegisterWecomRoutes(api *gin.RouterGroup, h WecomHandlers) {
	// WeChat Work OAuth routes (no auth required)
	api.POST("/auth/wecom", h.Login)
	api.POST("/auth/wecom/jsconfig", h.GetJSConfig)
	api.GET("/auth/wecom/oauth-url", h.GetOAuthURL)
}
