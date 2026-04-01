package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// EventHandlers handles real-time SSE event streaming.
type EventHandlers interface {
	Stream(c *gin.Context)
}

// RegisterEventRoutes registers the SSE event stream endpoint.
func RegisterEventRoutes(api *gin.RouterGroup, jwtSecret string, h EventHandlers) {
	api.GET("/events", middleware.AuthRequired(jwtSecret), h.Stream)
}
