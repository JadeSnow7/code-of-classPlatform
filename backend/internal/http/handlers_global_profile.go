package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type globalProfileHandlers struct {
	db *gorm.DB
}

func newGlobalProfileHandlers(db *gorm.DB) *globalProfileHandlers {
	return &globalProfileHandlers{db: db}
}

// GetGlobalProfile returns a student's global learning profile
// GET /api/v1/students/:studentId/global-profile
func (h *globalProfileHandlers) GetGlobalProfile(c *gin.Context) {
	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid student_id", nil)
		return
	}

	// Check permission: students can only view their own profile
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && currentUserID != uint(studentID) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "cannot view other student's global profile", nil)
		return
	}

	var profile models.StudentGlobalProfile
	result := h.db.Where("student_id = ?", studentID).First(&profile)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Return empty profile if not found
			respondOK(c, models.StudentGlobalProfile{
				StudentID:          uint(studentID),
				GlobalCompetencies: "{}",
				TotalStudyHours:    0,
				LearningStyle:      "{}",
			})
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", result.Error.Error(), nil)
		return
	}

	respondOK(c, profile)
}

// SaveGlobalProfile creates or updates a student's global profile
// POST /api/v1/students/:studentId/global-profile
type saveGlobalProfileRequest struct {
	GlobalCompetencies string `json:"global_competencies"`
	TotalStudyHours    int    `json:"total_study_hours"`
	LearningStyle      string `json:"learning_style"`
}

func (h *globalProfileHandlers) SaveGlobalProfile(c *gin.Context) {
	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid student_id", nil)
		return
	}

	var req saveGlobalProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	now := time.Now()
	profile := models.StudentGlobalProfile{
		StudentID:          uint(studentID),
		GlobalCompetencies: req.GlobalCompetencies,
		TotalStudyHours:    req.TotalStudyHours,
		LearningStyle:      req.LearningStyle,
		UpdatedAt:          &now,
	}

	// Upsert using ON CONFLICT
	result := h.db.Save(&profile)
	if result.Error != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", result.Error.Error(), nil)
		return
	}

	respondOK(c, profile)
}

// GetLearningTimeline returns paginated learning events for a student
// GET /api/v1/students/:studentId/learning-timeline
func (h *globalProfileHandlers) GetLearningTimeline(c *gin.Context) {
	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid student_id", nil)
		return
	}

	// Check permission
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && currentUserID != uint(studentID) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "cannot view other student's timeline", nil)
		return
	}

	// Parse pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Optional course filter
	courseIDStr := c.Query("course_id")
	var courseID *uint
	if courseIDStr != "" {
		if cid, err := strconv.ParseUint(courseIDStr, 10, 32); err == nil {
			cidUint := uint(cid)
			courseID = &cidUint
		}
	}

	// Query events
	var events []models.LearningEvent
	var total int64

	query := h.db.Model(&models.LearningEvent{}).Where("student_id = ?", studentID)
	if courseID != nil {
		query = query.Where("course_id = ?", *courseID)
	}

	query.Count(&total)
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&events)

	respondOK(c, gin.H{"items": events, "total": total, "page": page, "page_size": pageSize})
}

// RecordLearningEvent creates a new learning event
// POST /api/v1/learning-events
type recordLearningEventRequest struct {
	StudentID uint   `json:"student_id" binding:"required"`
	CourseID  *uint  `json:"course_id"`
	EventType string `json:"event_type" binding:"required"`
	Payload   string `json:"payload"`
}

func (h *globalProfileHandlers) RecordLearningEvent(c *gin.Context) {
	var req recordLearningEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request: "+err.Error(), nil)
		return
	}

	event := models.LearningEvent{
		StudentID: req.StudentID,
		CourseID:  req.CourseID,
		EventType: req.EventType,
		Payload:   req.Payload,
		CreatedAt: time.Now(),
	}

	if err := h.db.Create(&event).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error(), nil)
		return
	}

	respondCreated(c, event)
}
