package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// LearningHubHandlers interface for learning hub read handlers.
type LearningHubHandlers interface {
	GetDashboard(c *gin.Context)
	ListKnowledgeBases(c *gin.Context)
}

// RegisterLearningHubRoutes registers learning hub read routes used by the dashboard page.
func RegisterLearningHubRoutes(api *gin.RouterGroup, jwtSecret string, h LearningHubHandlers) {
	api.GET("/users/me/dashboard", middleware.AuthRequired(jwtSecret), h.GetDashboard)
	api.GET("/users/me/knowledge-bases", middleware.AuthRequired(jwtSecret), h.ListKnowledgeBases)
}
