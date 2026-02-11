package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// CourseHandlers interface for course handler methods
type CourseHandlers interface {
	List(c *gin.Context)
	Get(c *gin.Context)
	GetModules(c *gin.Context)
	Create(c *gin.Context)
	UpdateModules(c *gin.Context)
}

// RegisterCourseRoutes registers course routes
func RegisterCourseRoutes(api *gin.RouterGroup, jwtSecret string, h CourseHandlers) {
	api.GET("/courses", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.List)
	api.GET("/courses/:courseId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.Get)
	api.GET("/courses/:courseId/modules", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseRead), h.GetModules)
	api.POST("/courses", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.Create)
	api.PUT("/courses/:courseId/modules", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermCourseWrite), h.UpdateModules)
}
