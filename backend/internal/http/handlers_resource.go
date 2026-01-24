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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	// Validate URL
	if _, err := url.ParseRequestURI(req.URL); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid URL format", nil)
		return
	}

	// Get current user
	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	// Validate user is teacher of the course
	var course models.Course
	if err := h.db.First(&course, req.CourseID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "course not found", nil)
		return
	}
	if course.TeacherID != user.ID && user.Role != "admin" {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "you are not the course teacher", nil)
		return
	}

	// Validate type
	validTypes := map[string]bool{"video": true, "paper": true, "link": true}
	if !validTypes[req.Type] {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid resource type, must be: video, paper, or link", nil)
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
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create resource", nil)
		return
	}

	respondCreated(c, resource)
}

func (h *resourceHandlers) ListResources(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
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
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list resources", nil)
		return
	}

	respondOK(c, resources)
}

func (h *resourceHandlers) DeleteResource(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid id", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	var resource models.Resource
	if err := h.db.First(&resource, id).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "resource not found", nil)
		return
	}

	// Only creator or admin can delete
	if resource.CreatedByID != user.ID && user.Role != "admin" {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "you are not authorized to delete this resource", nil)
		return
	}

	if err := h.db.Delete(&resource).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete resource", nil)
		return
	}

	respondOK(c, gin.H{"message": "resource deleted"})
}
