package http

import (
	"errors"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type resourceHandlers struct {
	service services.ResourceService
}

func NewResourceHandlers(service services.ResourceService) *resourceHandlers {
	return &resourceHandlers{service: service}
}

func newResourceHandlers(service services.ResourceService) *resourceHandlers {
	return NewResourceHandlers(service)
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
		response.BadRequest(c, "Invalid request")
		return
	}

	// Validate URL
	if _, err := url.ParseRequestURI(req.URL); err != nil {
		response.BadRequest(c, "Invalid URL format")
		return
	}

	// Get current user
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	// Validate type
	validTypes := map[string]bool{"video": true, "paper": true, "link": true}
	if !validTypes[req.Type] {
		response.BadRequest(c, "Invalid resource type, must be: video, paper, or link")
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

	if err := h.service.CreateWithPermission(c.Request.Context(), &resource, user.ID, user.Role); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Course")
		case errors.Is(err, services.ErrAccessDeniedService):
			response.Forbidden(c, "You are not the course teacher")
		default:
			response.Error(c, err)
		}
		return
	}

	response.Created(c, resource)
}

func (h *resourceHandlers) ListResources(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	// Use service to list resources
	resources, err := h.service.List(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	// Note: Type filtering removed for simplicity in integration phase
	// Can be added later to service layer if needed
	response.OK(c, resources)
}

func (h *resourceHandlers) DeleteResource(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	if err := h.service.DeleteWithPermission(c.Request.Context(), uint(id), user.ID, user.Role); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Resource")
		case errors.Is(err, services.ErrAccessDeniedService):
			response.Forbidden(c, "You are not authorized to delete this resource")
		default:
			response.Error(c, err)
		}
		return
	}

	response.OK(c, gin.H{"message": "resource deleted"})
}
