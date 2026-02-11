package http

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type chapterHandlers struct {
	db      *gorm.DB
	service *services.ChapterService
}

func NewChapterHandlers(db *gorm.DB) *chapterHandlers {
	return &chapterHandlers{
		db:      db,
		service: services.NewChapterService(db),
	}
}

func newChapterHandlers(db *gorm.DB) *chapterHandlers {
	return NewChapterHandlers(db)
}

// ============ Request/Response Types ============

type createChapterRequest struct {
	Title           string `json:"title" binding:"required"`
	OrderNum        int    `json:"order_num"`
	Summary         string `json:"summary"`
	KnowledgePoints string `json:"knowledge_points"` // JSON array string
}

type updateChapterRequest struct {
	Title           *string `json:"title"`
	OrderNum        *int    `json:"order_num"`
	Summary         *string `json:"summary"`
	KnowledgePoints *string `json:"knowledge_points"`
}

// ============ CRUD Handlers ============

// ListChapters returns all chapters for a course
func (h *chapterHandlers) ListChapters(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	chapters, err := h.service.ListChapters(c.Request.Context(), uint(courseID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "access this course")
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			response.NotFound(c, "Course")
			return
		}
		response.BadRequest(c, "Failed to list chapters")
		return
	}

	response.OK(c, chapters)
}

// CreateChapter creates a new chapter
func (h *chapterHandlers) CreateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	var req createChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	chapter, err := h.service.CreateChapter(c.Request.Context(), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	}, services.CreateChapterRequest{
		CourseID:        uint(courseID),
		Title:           req.Title,
		OrderNum:        req.OrderNum,
		Summary:         req.Summary,
		KnowledgePoints: req.KnowledgePoints,
	})
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFound) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "create chapter")
			return
		}
		response.BadRequest(c, "Failed to create chapter")
		return
	}

	response.Created(c, chapter)
}

// GetChapter returns a single chapter
func (h *chapterHandlers) GetChapter(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	chapter, err := h.service.GetChapter(c.Request.Context(), uint(id), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "access this chapter")
			return
		}
		response.BadRequest(c, "Failed to get chapter")
		return
	}

	response.OK(c, chapter)
}

// UpdateChapter updates a chapter
func (h *chapterHandlers) UpdateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	var req updateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	chapter, err := h.service.UpdateChapter(c.Request.Context(), uint(id), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	}, services.UpdateChapterRequest{
		Title:           req.Title,
		OrderNum:        req.OrderNum,
		Summary:         req.Summary,
		KnowledgePoints: req.KnowledgePoints,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "update chapter")
			return
		}
		response.BadRequest(c, "Failed to update chapter")
		return
	}

	response.OK(c, chapter)
}

// DeleteChapter deletes a chapter
func (h *chapterHandlers) DeleteChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	if err := h.service.DeleteChapter(c.Request.Context(), uint(id), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	}); err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "delete chapter")
			return
		}
		response.BadRequest(c, "Failed to delete chapter")
		return
	}

	response.OK(c, gin.H{"message": "deleted"})
}

// ============ Heartbeat Handler ============

// Heartbeat records student study time with idempotent logic
func (h *chapterHandlers) Heartbeat(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	started, duration, err := h.service.RecordHeartbeat(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			if u.Role != "student" {
				response.Forbidden(c, "record study time (students only)")
				return
			}
			response.Forbidden(c, "access this chapter")
			return
		}
		response.BadRequest(c, "Database error")
		return
	}

	if started {
		response.OK(c, gin.H{"message": "started", "duration": 0})
		return
	}

	response.OK(c, gin.H{
		"message":  "recorded",
		"duration": duration,
	})
}

// ============ Stats Handlers ============

// GetMyStats returns student's personal stats for a chapter
func (h *chapterHandlers) GetMyStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	stats, err := h.service.GetMyStats(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "access this chapter")
			return
		}
		response.BadRequest(c, "Failed to load stats")
		return
	}

	response.OK(c, stats)
}

// GetClassStats returns class-wide stats for a chapter (teachers only)
func (h *chapterHandlers) GetClassStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	statsData, err := h.service.GetClassStats(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			response.NotFound(c, "Chapter")
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			response.Forbidden(c, "access class stats")
			return
		}
		response.BadRequest(c, "Failed to load stats")
		return
	}

	response.OK(c, statsData)
}
