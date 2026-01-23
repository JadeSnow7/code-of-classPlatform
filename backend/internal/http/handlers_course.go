package http

import (
	"net/http"

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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req createCourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	course := models.Course{
		Name:      req.Name,
		Code:      req.Code,
		Semester:  req.Semester,
		TeacherID: u.ID,
	}
	if err := h.db.Create(&course).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create course failed"})
		return
	}
	c.JSON(http.StatusOK, course)
}

func (h *courseHandlers) List(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var courses []models.Course

	switch u.Role {
	case "admin":
		// Admin sees all courses
		if err := h.db.Order("id desc").Find(&courses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "list courses failed"})
			return
		}
	case "teacher":
		// Teacher sees courses they created
		if err := h.db.Where("teacher_id = ?", u.ID).Order("id desc").Find(&courses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "list courses failed"})
			return
		}
	default:
		// Student/Assistant: filter by enrollment
		if err := h.db.Joins("JOIN course_enrollments ON course_enrollments.course_id = courses.id").
			Where("course_enrollments.user_id = ? AND course_enrollments.deleted_at IS NULL", u.ID).
			Order("courses.id desc").
			Find(&courses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "list courses failed"})
			return
		}
	}

	c.JSON(http.StatusOK, courses)
}
