package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AnnouncementHandlers interface for announcement handler methods
type AnnouncementHandlers interface {
	GetSummary(c *gin.Context)
	List(c *gin.Context)
	Create(c *gin.Context)
	Update(c *gin.Context)
	Delete(c *gin.Context)
	MarkRead(c *gin.Context)
}

// RegisterAnnouncementRoutes registers announcement routes
func RegisterAnnouncementRoutes(api *gin.RouterGroup, jwtSecret string, h AnnouncementHandlers) {
	api.GET("/courses/:courseId/announcements/summary", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementRead), h.GetSummary)
	api.GET("/courses/:courseId/announcements", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementRead), h.List)
	api.POST("/courses/:courseId/announcements", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementWrite), h.Create)
	api.PUT("/announcements/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementWrite), h.Update)
	api.DELETE("/announcements/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementWrite), h.Delete)
	api.POST("/announcements/:id/read", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAnnouncementRead), h.MarkRead)
}
