package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

// authorizeCourseAccess validates the current user can access a course.
// It writes an error response and returns false when access is denied.
func authorizeCourseAccess(c *gin.Context, db *gorm.DB, course *models.Course) bool {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return false
	}

	switch u.Role {
	case "admin":
		return true
	case "teacher":
		if course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return false
		}
		return true
	default:
		var enrollment models.CourseEnrollment
		if err := db.Where("course_id = ? AND user_id = ? AND deleted_at IS NULL", course.ID, u.ID).
			First(&enrollment).Error; err != nil {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return false
		}
		return true
	}
}
