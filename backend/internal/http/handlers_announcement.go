package http

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type announcementHandlers struct {
	service services.AnnouncementService
}

func NewAnnouncementHandlers(service services.AnnouncementService) *announcementHandlers {
	return &announcementHandlers{service: service}
}

func newAnnouncementHandlers(service services.AnnouncementService) *announcementHandlers {
	return NewAnnouncementHandlers(service)
}

// --- Summary ---

// AnnouncementSummaryResponse is the response for announcement summary
type AnnouncementSummaryResponse struct {
	UnreadCount int                     `json:"unread_count"`
	TotalCount  int                     `json:"total_count"`
	Latest      *AnnouncementLatestInfo `json:"latest"`
}

// AnnouncementLatestInfo describes the latest announcement metadata.
type AnnouncementLatestInfo = services.AnnouncementLatestInfo

// GetSummary returns announcement summary for a course
// GET /courses/:id/announcements/summary
func (h *announcementHandlers) GetSummary(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userCtx.ID

	summary, err := h.service.GetSummary(c.Request.Context(), uint(courseID), userID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, AnnouncementSummaryResponse{
		UnreadCount: summary.UnreadCount,
		TotalCount:  summary.TotalCount,
		Latest:      summary.Latest,
	})
}

// --- List ---

// AnnouncementListItem is a single announcement in the list
type AnnouncementListItem = services.AnnouncementListItem

// List returns all announcements for a course
// GET /courses/:id/announcements
func (h *announcementHandlers) List(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userCtx.ID

	items, err := h.service.ListWithReadStatus(c.Request.Context(), uint(courseID), userID)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, items)
}

// --- Create ---

type createAnnouncementRequest struct {
	Title   string `json:"title" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// Create creates a new announcement
// POST /courses/:id/announcements
func (h *announcementHandlers) Create(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	var req createAnnouncementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userCtx.ID

	announcement := models.Announcement{
		CourseID:    uint(courseID),
		Title:       req.Title,
		Content:     req.Content,
		CreatedByID: userID,
	}

	// Use service to create
	if err := h.service.Create(c.Request.Context(), &announcement); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, announcement)
}

// --- Update ---

type updateAnnouncementRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// Update updates an announcement
// PUT /announcements/:id
func (h *announcementHandlers) Update(c *gin.Context) {
	announcementID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid announcement ID")
		return
	}

	var req updateAnnouncementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	updates := map[string]interface{}{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}

	announcement, err := h.service.UpdateAndGet(c.Request.Context(), uint(announcementID), updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "Announcement")
		} else {
			response.Error(c, err)
		}
		return
	}
	response.OK(c, announcement)
}

// --- Delete ---

// Delete deletes an announcement
// DELETE /announcements/:id
func (h *announcementHandlers) Delete(c *gin.Context) {
	announcementID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid announcement ID")
		return
	}

	if err := h.service.DeleteWithReads(c.Request.Context(), uint(announcementID)); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"message": "deleted"})
}

// --- Mark Read ---

// MarkRead marks an announcement as read for the current user
// POST /announcements/:id/read
func (h *announcementHandlers) MarkRead(c *gin.Context) {
	announcementID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid announcement ID")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userCtx.ID

	if err := h.service.MarkRead(c.Request.Context(), uint(announcementID), userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "Announcement")
			return
		}
		// Service handles duplicate key errors gracefully
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"success": true})
}
