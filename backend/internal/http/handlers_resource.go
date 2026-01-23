package http

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type resourceHandlers struct {
	db *gorm.DB
}

func newResourceHandlers(db *gorm.DB) *resourceHandlers {
	return &resourceHandlers{db: db}
}

// --- Resource CRUD ---

type createResourceRequest struct {
	CourseID    uint   `json:"course_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Type        string `json:"type" binding:"required"` // video, paper, link
	URL         string `json:"url" binding:"required"`
	Description string `json:"description"`
}

func (h *resourceHandlers) CreateResource(c *gin.Context) {
	var req createResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Validate URL
	if _, err := url.ParseRequestURI(req.URL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid URL format"})
		return
	}

	// Get current user
	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	// Validate user is teacher of the course
	var course models.Course
	if err := h.db.First(&course, req.CourseID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.TeacherID != user.ID && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not the course teacher"})
		return
	}

	// Validate type
	validTypes := map[string]bool{"video": true, "paper": true, "link": true}
	if !validTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource type, must be: video, paper, or link"})
		return
	}

	resource := models.Resource{
		CourseID:    req.CourseID,
		CreatedByID: user.ID,
		Title:       req.Title,
		Type:        req.Type,
		URL:         req.URL,
		Description: req.Description,
	}

	if err := h.db.Create(&resource).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create resource"})
		return
	}

	c.JSON(http.StatusCreated, resource)
}

func (h *resourceHandlers) ListResources(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	// Optional type filter
	typeFilter := c.Query("type")

	query := h.db.Where("course_id = ?", courseID)
	if typeFilter != "" {
		query = query.Where("type = ?", typeFilter)
	}

	var resources []models.Resource
	if err := query.Order("created_at DESC").Find(&resources).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list resources"})
		return
	}

	c.JSON(http.StatusOK, resources)
}

func (h *resourceHandlers) DeleteResource(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var resource models.Resource
	if err := h.db.First(&resource, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
		return
	}

	// Only creator or admin can delete
	if resource.CreatedByID != user.ID && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not authorized to delete this resource"})
		return
	}

	if err := h.db.Delete(&resource).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete resource"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "resource deleted"})
}
