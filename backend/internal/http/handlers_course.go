package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type courseHandlers struct {
	db *gorm.DB
}

func newCourseHandlers(db *gorm.DB) *courseHandlers {
	return &courseHandlers{db: db}
}

type createCourseRequest struct {
	Name     string `json:"name" binding:"required"`
	Code     string `json:"code"`
	Semester string `json:"semester"`
}

func (h *courseHandlers) Create(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	var req createCourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
		return
	}

	course := models.Course{
		Name:      req.Name,
		Code:      req.Code,
		Semester:  req.Semester,
		TeacherID: u.ID,
	}
	if err := h.db.Create(&course).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "CREATE_COURSE_FAILED", "create course failed", nil)
		return
	}
	respondCreated(c, course)
}

func (h *courseHandlers) List(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	var courses []models.Course

	switch u.Role {
	case "admin":
		// Admin sees all courses
		if err := h.db.Order("id desc").Find(&courses).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "LIST_COURSES_FAILED", "list courses failed", nil)
			return
		}
	case "teacher":
		// Teacher sees courses they created
		if err := h.db.Where("teacher_id = ?", u.ID).Order("id desc").Find(&courses).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "LIST_COURSES_FAILED", "list courses failed", nil)
			return
		}
	default:
		// Student/Assistant: filter by enrollment
		if err := h.db.Joins("JOIN course_enrollments ON course_enrollments.course_id = courses.id").
			Where("course_enrollments.user_id = ? AND course_enrollments.deleted_at IS NULL", u.ID).
			Order("courses.id desc").
			Find(&courses).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "LIST_COURSES_FAILED", "list courses failed", nil)
			return
		}
	}

	respondOK(c, courses)
}

func (h *courseHandlers) Get(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	var course models.Course
	if err := h.db.First(&course, courseID).Error; err != nil {
		respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
		return
	}

	// Access control
	switch u.Role {
	case "admin":
		// allow
	case "teacher":
		if course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	default:
		var enrollment models.CourseEnrollment
		if err := h.db.Where("course_id = ? AND user_id = ? AND deleted_at IS NULL", course.ID, u.ID).
			First(&enrollment).Error; err != nil {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	}

	respondOK(c, course)
}
