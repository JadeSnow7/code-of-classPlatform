package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// GlobalProfileHandlers interface for global profile handler methods
type GlobalProfileHandlers interface {
	GetGlobalProfile(c *gin.Context)
	SaveGlobalProfile(c *gin.Context)
	GetLearningTimeline(c *gin.Context)
	RecordLearningEvent(c *gin.Context)
}

// RegisterGlobalProfileRoutes registers global profile routes
func RegisterGlobalProfileRoutes(api *gin.RouterGroup, jwtSecret string, h GlobalProfileHandlers) {
	api.GET("/students/:studentId/global-profile", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetGlobalProfile)
	api.POST("/students/:studentId/global-profile", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.SaveGlobalProfile)
	api.GET("/students/:studentId/learning-timeline", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetLearningTimeline)
	api.POST("/learning-events", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.RecordLearningEvent)
}
