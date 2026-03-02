package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// KnowledgeExportHandlers interface for knowledge export endpoints.
type KnowledgeExportHandlers interface {
	Bootstrap(c *gin.Context)
	Changes(c *gin.Context)
	Document(c *gin.Context)
}

// RegisterKnowledgeExportRoutes registers internal backend content export routes.
func RegisterKnowledgeExportRoutes(group *gin.RouterGroup, sharedToken string, h KnowledgeExportHandlers) {
	group.GET("/knowledge-export/bootstrap", middleware.SharedTokenRequired(sharedToken), h.Bootstrap)
	group.GET("/knowledge-export/changes", middleware.SharedTokenRequired(sharedToken), h.Changes)
	group.GET("/knowledge-export/document/:kind/:id", middleware.SharedTokenRequired(sharedToken), h.Document)
}
