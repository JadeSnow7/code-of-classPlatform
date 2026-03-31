package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// LearningHubHandlers interface for learning hub read handlers.
type LearningHubHandlers interface {
	GetDashboard(c *gin.Context)
	ListKnowledgeBases(c *gin.Context)
	CreateKnowledgeBase(c *gin.Context)
	ListKnowledgeBaseFiles(c *gin.Context)
	UploadKnowledgeBaseFile(c *gin.Context)
	DeleteKnowledgeBaseFile(c *gin.Context)
	ReindexKnowledgeBase(c *gin.Context)
}

// RegisterLearningHubRoutes registers learning hub read routes used by the dashboard page.
func RegisterLearningHubRoutes(api *gin.RouterGroup, jwtSecret string, h LearningHubHandlers) {
	api.GET("/users/me/dashboard", middleware.AuthRequired(jwtSecret), h.GetDashboard)
	api.GET("/users/me/knowledge-bases", middleware.AuthRequired(jwtSecret), h.ListKnowledgeBases)
	api.POST("/users/me/knowledge-bases", middleware.AuthRequired(jwtSecret), h.CreateKnowledgeBase)
	api.GET("/users/me/knowledge-bases/:id/files", middleware.AuthRequired(jwtSecret), h.ListKnowledgeBaseFiles)
	api.POST("/users/me/knowledge-bases/:id/files", middleware.AuthRequired(jwtSecret), h.UploadKnowledgeBaseFile)
	api.DELETE("/users/me/knowledge-bases/:id/files/:fileId", middleware.AuthRequired(jwtSecret), h.DeleteKnowledgeBaseFile)
	api.POST("/users/me/knowledge-bases/:id/reindex", middleware.AuthRequired(jwtSecret), h.ReindexKnowledgeBase)
}
