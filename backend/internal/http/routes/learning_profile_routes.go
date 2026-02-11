package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// LearningProfileHandlers interface for learning profile handler methods
type LearningProfileHandlers interface {
	GetProfile(c *gin.Context)
	SaveProfile(c *gin.Context)
	ListCourseProfiles(c *gin.Context)
}

// RegisterLearningProfileRoutes registers learning profile routes
func RegisterLearningProfileRoutes(api *gin.RouterGroup, jwtSecret string, h LearningProfileHandlers) {
	api.GET("/learning-profiles/:courseId/:studentId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetProfile)
	api.POST("/learning-profiles", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.SaveProfile)
	api.GET("/courses/:courseId/learning-profiles", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.ListCourseProfiles)
}
