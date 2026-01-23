package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type announcementHandlers struct {
	db *gorm.DB
}

func newAnnouncementHandlers(db *gorm.DB) *announcementHandlers {
	return &announcementHandlers{db: db}
}

// --- Summary ---

// AnnouncementSummaryResponse is the response for announcement summary
type AnnouncementSummaryResponse struct {
	UnreadCount int                     `json:"unread_count"`
	TotalCount  int                     `json:"total_count"`
	Latest      *AnnouncementLatestInfo `json:"latest"`
}

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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
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

	c.JSON(http.StatusOK, AnnouncementSummaryResponse{
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID := userCtx.ID

	var announcements []models.Announcement
	if err := h.db.Where("course_id = ?", courseID).Order("created_at DESC").Find(&announcements).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch announcements"})
		return
	}

	// Get read status for all announcements
	var readRecords []models.AnnouncementRead
	announcementIDs := make([]uint, len(announcements))
	for i, a := range announcements {
		announcementIDs[i] = a.ID
	}
	h.db.Where("announcement_id IN ? AND user_id = ?", announcementIDs, userID).Find(&readRecords)

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

	c.JSON(http.StatusOK, result)
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	var req createAnnouncementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID := userCtx.ID

	announcement := models.Announcement{
		CourseID:    uint(courseID),
		Title:       req.Title,
		Content:     req.Content,
		CreatedByID: userID,
	}

	if err := h.db.Create(&announcement).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create announcement"})
		return
	}

	c.JSON(http.StatusCreated, announcement)
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid announcement id"})
		return
	}

	var req updateAnnouncementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var announcement models.Announcement
	if err := h.db.First(&announcement, announcementID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "announcement not found"})
		return
	}

	updates := map[string]interface{}{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}

	if err := h.db.Model(&announcement).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update announcement"})
		return
	}

	h.db.First(&announcement, announcementID)
	c.JSON(http.StatusOK, announcement)
}

// --- Delete ---

// Delete deletes an announcement
// DELETE /announcements/:id
func (h *announcementHandlers) Delete(c *gin.Context) {
	announcementID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid announcement id"})
		return
	}

	// Delete read records first
	h.db.Where("announcement_id = ?", announcementID).Delete(&models.AnnouncementRead{})

	if err := h.db.Delete(&models.Announcement{}, announcementID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete announcement"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// --- Mark Read ---

// MarkRead marks an announcement as read for the current user
// POST /announcements/:id/read
func (h *announcementHandlers) MarkRead(c *gin.Context) {
	announcementID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid announcement id"})
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID := userCtx.ID

	// Check if announcement exists
	var announcement models.Announcement
	if err := h.db.First(&announcement, announcementID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "announcement not found"})
		return
	}

	// Upsert read record (idempotent)
	readRecord := models.AnnouncementRead{
		AnnouncementID: uint(announcementID),
		UserID:         userID,
		ReadAt:         time.Now(),
	}

	// Try to create, ignore duplicate key error
	if err := h.db.Create(&readRecord).Error; err != nil {
		// If duplicate, it's already read - that's fine
		if !isDuplicateKeyError(err) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark as read"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// isDuplicateKeyError checks if error is a duplicate key constraint violation
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return contains(errStr, "Duplicate entry") || contains(errStr, "UNIQUE constraint failed")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsImpl(s, substr))
}

func containsImpl(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
