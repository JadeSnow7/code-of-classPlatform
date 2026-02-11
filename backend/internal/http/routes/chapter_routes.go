package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// ChapterHandlers interface for chapter handler methods
type ChapterHandlers interface {
	ListChapters(c *gin.Context)
	CreateChapter(c *gin.Context)
	GetChapter(c *gin.Context)
	UpdateChapter(c *gin.Context)
	DeleteChapter(c *gin.Context)
	Heartbeat(c *gin.Context)
	GetMyStats(c *gin.Context)
	GetClassStats(c *gin.Context)
}

// RegisterChapterRoutes registers chapter routes
func RegisterChapterRoutes(api *gin.RouterGroup, jwtSecret string, h ChapterHandlers) {
	// Chapter routes under courses
	api.GET("/courses/:courseId/chapters", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.ListChapters)

	// Chapter CRUD
	api.POST("/chapters", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.CreateChapter)
	api.GET("/chapters/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetChapter)
	api.PUT("/chapters/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.UpdateChapter)
	api.DELETE("/chapters/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.DeleteChapter)

	// Chapter study tracking
	api.POST("/chapters/:id/heartbeat", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.Heartbeat)
	api.POST("/chapters/:id/study-time", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.Heartbeat) // Compatibility alias for mobile

	// Chapter statistics
	api.GET("/chapters/:id/my-stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetMyStats)
	api.GET("/chapters/:id/class-stats", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.GetClassStats)
}
