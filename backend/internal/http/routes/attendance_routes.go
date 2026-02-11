package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AttendanceHandlers interface for attendance handler methods
type AttendanceHandlers interface {
	GetSummary(c *gin.Context)
	ListSessions(c *gin.Context)
	StartSession(c *gin.Context)
	EndSession(c *gin.Context)
	Checkin(c *gin.Context)
	GetRecords(c *gin.Context)
}

// RegisterAttendanceRoutes registers attendance routes
func RegisterAttendanceRoutes(api *gin.RouterGroup, jwtSecret string, h AttendanceHandlers) {
	api.GET("/courses/:courseId/attendance/summary", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceRead), h.GetSummary)
	api.GET("/courses/:courseId/attendance/sessions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceRead), h.ListSessions)
	api.POST("/courses/:courseId/attendance/start", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceWrite), h.StartSession)
	api.POST("/attendance/:session_id/end", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceWrite), h.EndSession)
	api.POST("/attendance/:session_id/checkin", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceCheckin), h.Checkin)
	api.GET("/attendance/:session_id/records", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermAttendanceRead), h.GetRecords)
}
