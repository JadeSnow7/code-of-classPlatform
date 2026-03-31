package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// WritingHandlers interface for writing handler methods
type WritingHandlers interface {
	SubmitWriting(c *gin.Context)
	GetWritingSubmissions(c *gin.Context)
	GetWritingStats(c *gin.Context)
	GetWritingSubmission(c *gin.Context)
	UpdateWritingFeedback(c *gin.Context)
	CreateWritingSubmission(c *gin.Context)
	GetWritingSubmissionV2(c *gin.Context)
	UpdateWritingSubmission(c *gin.Context)
	RequestWritingAIFeedback(c *gin.Context)
	ListWritingRevisions(c *gin.Context)
}

// RegisterWritingRoutes registers writing routes
func RegisterWritingRoutes(api *gin.RouterGroup, jwtSecret string, requireWritingModule gin.HandlerFunc, h WritingHandlers) {
	api.POST("/courses/:courseId/writing", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), requireWritingModule, h.SubmitWriting)
	api.GET("/courses/:courseId/writing", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), requireWritingModule, h.GetWritingSubmissions)
	api.GET("/courses/:courseId/writing/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), requireWritingModule, h.GetWritingStats)
	api.GET("/writing/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetWritingSubmission)
	api.PUT("/writing/:id/feedback", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), h.UpdateWritingFeedback)
	api.POST("/courses/:courseId/writing-submissions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), requireWritingModule, h.CreateWritingSubmission)
	api.GET("/writing-submissions/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetWritingSubmissionV2)
	api.PATCH("/writing-submissions/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), h.UpdateWritingSubmission)
	api.POST("/writing-submissions/:id/ai-feedback", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), h.RequestWritingAIFeedback)
	api.GET("/writing-submissions/:id/revisions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.ListWritingRevisions)
}
