package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"gorm.io/gorm"
)

// WritingHandlers interface for writing handler methods
type WritingHandlers interface {
	SubmitWriting(c *gin.Context)
	GetWritingSubmissions(c *gin.Context)
	GetWritingStats(c *gin.Context)
	GetWritingSubmission(c *gin.Context)
	UpdateWritingFeedback(c *gin.Context)
}

// RegisterWritingRoutes registers writing routes
func RegisterWritingRoutes(api *gin.RouterGroup, jwtSecret string, db *gorm.DB, h WritingHandlers) {
	// Note: RequireCourseModule is a custom middleware requiring DB access
	requireWritingModule := RequireCourseModule(db, "course.writing")

	api.POST("/courses/:courseId/writing", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), requireWritingModule, h.SubmitWriting)
	api.GET("/courses/:courseId/writing", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), requireWritingModule, h.GetWritingSubmissions)
	api.GET("/courses/:courseId/writing/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), requireWritingModule, h.GetWritingStats)
	api.GET("/writing/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetWritingSubmission)
	api.PUT("/writing/:id/feedback", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), h.UpdateWritingFeedback)
}
