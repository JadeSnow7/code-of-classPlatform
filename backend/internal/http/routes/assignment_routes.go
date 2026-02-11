package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AssignmentHandlers interface for assignment handler methods
type AssignmentHandlers interface {
	GetCourseAssignmentStats(c *gin.Context)
	ListAssignments(c *gin.Context)
	CreateAssignment(c *gin.Context)
	GetAssignment(c *gin.Context)
	GetAssignmentStats(c *gin.Context)
	SubmitAssignment(c *gin.Context)
	GetMySubmission(c *gin.Context)
	ListSubmissions(c *gin.Context)
	GradeSubmission(c *gin.Context)
	AIGradeSubmission(c *gin.Context)
}

// RegisterAssignmentRoutes registers assignment routes
func RegisterAssignmentRoutes(api *gin.RouterGroup, jwtSecret string, h AssignmentHandlers) {
	// Course-level assignment routes
	api.GET("/courses/:courseId/assignments/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetCourseAssignmentStats)
	api.GET("/courses/:courseId/assignments", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.ListAssignments)
	api.POST("/courses/:courseId/assignments", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentWrite), h.CreateAssignment)

	// Compatibility alias for web client
	api.POST("/assignments", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentWrite), h.CreateAssignment)

	// Assignment operations
	api.GET("/assignments/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetAssignment)
	api.GET("/assignments/:id/stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetAssignmentStats)
	api.POST("/assignments/:id/submit", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentSubmit), h.SubmitAssignment)
	api.GET("/assignments/:id/my-submission", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentRead), h.GetMySubmission)
	api.GET("/assignments/:id/submissions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), h.ListSubmissions)

	// Submission grading
	api.POST("/submissions/:submissionId/grade", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), h.GradeSubmission)
	api.POST("/submissions/:submissionId/ai-grade", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAssignmentGrade), h.AIGradeSubmission)
}
