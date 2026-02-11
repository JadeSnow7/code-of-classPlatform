package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

// authorizeCourseAccess validates the current user can access a course.
// It writes an error response and returns false when access is denied.
func authorizeCourseAccess(c *gin.Context, db *gorm.DB, course *models.Course) bool {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return false
	}

	switch u.Role {
	case "admin":
		return true
	case "teacher":
		if course.TeacherID != u.ID {
			response.Forbidden(c, "access denied")
			return false
		}
		return true
	default:
		var enrollment models.CourseEnrollment
		if err := db.Where("course_id = ? AND user_id = ? AND deleted_at IS NULL", course.ID, u.ID).
			First(&enrollment).Error; err != nil {
			response.Forbidden(c, "access denied")
			return false
		}
		return true
	}
}
