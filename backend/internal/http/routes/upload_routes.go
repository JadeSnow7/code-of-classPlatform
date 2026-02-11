package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// UploadHandlers interface for upload handler methods
type UploadHandlers interface {
	UploadAssignmentFile(c *gin.Context)
	UploadResourceFile(c *gin.Context)
}

// RegisterUploadRoutes registers file upload routes
func RegisterUploadRoutes(api *gin.RouterGroup, jwtSecret string, h UploadHandlers) {
	api.POST("/upload/assignment/:assignmentId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), h.UploadAssignmentFile)
	api.POST("/upload/resource/:courseId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermResourceWrite), h.UploadResourceFile)
}
