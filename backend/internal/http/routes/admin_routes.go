package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AdminHandlers interface for admin handler methods
type AdminHandlers interface {
	GetSystemStats(c *gin.Context)
	ListUsers(c *gin.Context)
	CreateUser(c *gin.Context)
	UpdateUser(c *gin.Context)
	DeleteUser(c *gin.Context)
}

// RegisterAdminRoutes registers admin routes
func RegisterAdminRoutes(api *gin.RouterGroup, jwtSecret string, h AdminHandlers) {
	adminMW := []gin.HandlerFunc{
		middleware.AuthRequired(jwtSecret),
		middleware.RequirePermission(authz.PermUserManage),
	}

	api.GET("/admin/stats", append(adminMW, h.GetSystemStats)...)
	api.GET("/admin/users", append(adminMW, h.ListUsers)...)
	api.POST("/admin/users", append(adminMW, h.CreateUser)...)
	api.PUT("/admin/users/:id", append(adminMW, h.UpdateUser)...)
	api.DELETE("/admin/users/:id", append(adminMW, h.DeleteUser)...)
}
