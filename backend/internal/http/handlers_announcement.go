package http

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type announcementHandlers struct {
	service services.AnnouncementService
	db      *gorm.DB // Keep temporarily for read status queries (complex joins)
}

func newAnnouncementHandlers(service services.AnnouncementService, db *gorm.DB) *announcementHandlers {
	return &announcementHandlers{service: service, db: db}
}

// --- Summary ---

// AnnouncementSummaryResponse is the response for announcement summary
type AnnouncementSummaryResponse struct {
	UnreadCount int                     `json:"unread_count"`
	TotalCount  int                     `json:"total_count"`
	Latest      *AnnouncementLatestInfo `json:"latest"`
}

// AnnouncementLatestInfo describes the latest announcement metadata.
type AnnouncementLatestInfo struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
}

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

	// Get total count
	var totalCount int64
	h.db.Model(&models.Announcement{}).Where("course_id = ?", courseID).Count(&totalCount)

	// Get unread count (announcements not in announcement_reads for this user)
	var readCount int64
	h.db.Model(&models.AnnouncementRead{}).
		Joins("JOIN announcements ON announcements.id = announcement_reads.announcement_id").
		Where("announcements.course_id = ? AND announcement_reads.user_id = ?", courseID, userID).
		Count(&readCount)
	unreadCount := int(totalCount) - int(readCount)

	// Get latest announcement
	var latest models.Announcement
	var latestInfo *AnnouncementLatestInfo
	if err := h.db.Where("course_id = ?", courseID).Order("created_at DESC").First(&latest).Error; err == nil {
		latestInfo = &AnnouncementLatestInfo{
			ID:        latest.ID,
			Title:     latest.Title,
			CreatedAt: latest.CreatedAt,
		}
	}

	response.OK(c, AnnouncementSummaryResponse{
		UnreadCount: unreadCount,
		TotalCount:  int(totalCount),
		Latest:      latestInfo,
	})
}

// --- List ---

// AnnouncementListItem is a single announcement in the list
type AnnouncementListItem struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	IsRead    bool      `json:"is_read"`
}

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

	// Use service to list announcements
	announcementsPtr, err := h.service.List(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	// Convert []*models.Announcement to []models.Announcement for compatibility
	announcements := make([]models.Announcement, len(announcementsPtr))
	announcementIDs := make([]uint, len(announcementsPtr))
	for i, a := range announcementsPtr {
		announcements[i] = *a
		announcementIDs[i] = a.ID
	}

	// Get read status for all announcements  (keep complex join in handler for now)
	var readRecords []models.AnnouncementRead
	if len(announcementIDs) > 0 {
		h.db.Where("announcement_id IN ? AND user_id = ?", announcementIDs, userID).Find(&readRecords)
	}

	readMap := make(map[uint]bool)
	for _, r := range readRecords {
		readMap[r.AnnouncementID] = true
	}

	result := make([]AnnouncementListItem, len(announcements))
	for i, a := range announcements {
		result[i] = AnnouncementListItem{
			ID:        a.ID,
			Title:     a.Title,
			Content:   a.Content,
			CreatedAt: a.CreatedAt,
			IsRead:    readMap[a.ID],
		}
	}

	response.OK(c, result)
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

	// Use service to update
	if err := h.service.Update(c.Request.Context(), uint(announcementID), updates); err != nil {
		if err == gorm.ErrRecordNotFound {
			response.NotFound(c, "Announcement")
		} else {
			response.Error(c, err)
		}
		return
	}

	// Fetch updated announcement (service Update doesn't return it)
	var announcement models.Announcement
	h.db.First(&announcement, announcementID)
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

	// Delete read records first (keep in handler for now - cascade delete)
	h.db.Where("announcement_id = ?", announcementID).Delete(&models.AnnouncementRead{})

	// Use service to delete
	if err := h.service.Delete(c.Request.Context(), uint(announcementID)); err != nil {
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

	// Check if announcement exists (keep in handler for now)
	var announcement models.Announcement
	if err := h.db.First(&announcement, announcementID).Error; err != nil {
		response.NotFound(c, "Announcement")
		return
	}

	// Use service to mark read
	if err := h.service.MarkRead(c.Request.Context(), uint(announcementID), userID); err != nil {
		// Service handles duplicate key errors gracefully
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"success": true})
}
