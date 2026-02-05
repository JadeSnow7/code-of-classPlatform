package http

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/services"
	"gorm.io/gorm"
)

type chapterHandlers struct {
	db      *gorm.DB
	service *services.ChapterService
}

func newChapterHandlers(db *gorm.DB) *chapterHandlers {
	return &chapterHandlers{
		db:      db,
		service: services.NewChapterService(db),
	}
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
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	chapters, err := h.service.ListChapters(c.Request.Context(), uint(courseID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "LIST_CHAPTERS_FAILED", "list chapters failed", nil)
		return
	}

	respondOK(c, chapters)
}

// CreateChapter creates a new chapter
func (h *chapterHandlers) CreateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	var req createChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
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
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "CREATE_CHAPTER_FAILED", "create chapter failed", nil)
		return
	}

	respondCreated(c, chapter)
}

// GetChapter returns a single chapter
func (h *chapterHandlers) GetChapter(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	chapter, err := h.service.GetChapter(c.Request.Context(), uint(id), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "GET_CHAPTER_FAILED", "get chapter failed", nil)
		return
	}

	respondOK(c, chapter)
}

// UpdateChapter updates a chapter
func (h *chapterHandlers) UpdateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var req updateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
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
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "UPDATE_CHAPTER_FAILED", "update chapter failed", nil)
		return
	}

	respondOK(c, chapter)
}

// DeleteChapter deletes a chapter
func (h *chapterHandlers) DeleteChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	if err := h.service.DeleteChapter(c.Request.Context(), uint(id), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	}); err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "DELETE_CHAPTER_FAILED", "delete chapter failed", nil)
		return
	}

	respondOK(c, gin.H{"message": "deleted"})
}

// ============ Heartbeat Handler ============

// Heartbeat records student study time with idempotent logic
func (h *chapterHandlers) Heartbeat(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	started, duration, err := h.service.RecordHeartbeat(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			if u.Role != "student" {
				respondError(c, http.StatusForbidden, "ROLE_NOT_ALLOWED", "only students can record study time", nil)
				return
			}
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "DATABASE_ERROR", "database error", nil)
		return
	}

	if started {
		respondOK(c, gin.H{"message": "started", "duration": 0})
		return
	}

	respondOK(c, gin.H{
		"message":  "recorded",
		"duration": duration,
	})
}

// ============ Stats Handlers ============

// GetMyStats returns student's personal stats for a chapter
func (h *chapterHandlers) GetMyStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	stats, err := h.service.GetMyStats(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load stats", nil)
		return
	}

	respondOK(c, stats)
}

// GetClassStats returns class-wide stats for a chapter (teachers only)
func (h *chapterHandlers) GetClassStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	response, err := h.service.GetClassStats(c.Request.Context(), uint(chapterID), services.UserInfo{
		ID:   u.ID,
		Role: u.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrChapterNotFound) {
			respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load stats", nil)
		return
	}

	respondOK(c, response)
}
