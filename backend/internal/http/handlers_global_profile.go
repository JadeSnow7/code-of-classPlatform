package http

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type globalProfileHandlers struct {
	service services.GlobalProfileService
	db      *gorm.DB // Keep for pagination/filtering queries temporarily
}

func newGlobalProfileHandlers(service services.GlobalProfileService, db *gorm.DB) *globalProfileHandlers {
	return &globalProfileHandlers{service: service, db: db}
}

// GetGlobalProfile returns a student's global learning profile
// GET /api/v1/students/:studentId/global-profile
func (h *globalProfileHandlers) GetGlobalProfile(c *gin.Context) {
	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid student ID")
		return
	}

	// Check permission: students can only view their own profile
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && currentUserID != uint(studentID) {
		response.Forbidden(c, "Cannot view other student's global profile")
		return
	}

	// Use service to get profile
	profile, err := h.service.GetGlobalProfile(c.Request.Context(), uint(studentID))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Return empty profile if not found
			response.OK(c, models.StudentGlobalProfile{
				StudentID:          uint(studentID),
				GlobalCompetencies: "{}",
				TotalStudyHours:    0,
				LearningStyle:      "{}",
			})
			return
		}
		response.Error(c, err)
		return
	}

	response.OK(c, profile)
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
		response.BadRequest(c, "Invalid student ID")
		return
	}

	var req saveGlobalProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	now := time.Now()
	profile := &models.StudentGlobalProfile{
		StudentID:          uint(studentID),
		GlobalCompetencies: req.GlobalCompetencies,
		TotalStudyHours:    req.TotalStudyHours,
		LearningStyle:      req.LearningStyle,
		UpdatedAt:          &now,
	}

	// Use service to save
	if err := h.service.SaveGlobalProfile(c.Request.Context(), profile); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, profile)
}

// GetLearningTimeline returns paginated learning events for a student
// GET /api/v1/students/:studentId/learning-timeline
func (h *globalProfileHandlers) GetLearningTimeline(c *gin.Context) {
	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid student ID")
		return
	}

	// Check permission
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && currentUserID != uint(studentID) {
		response.Forbidden(c, "Cannot view other student's timeline")
		return
	}

	// Parse pagination (keep in handler for now - complex filtering)
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

	// Query events (keep DB query for pagination - service doesn't support it yet)
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

	response.OK(c, gin.H{"items": events, "total": total, "page": page, "page_size": pageSize})
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
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	event := &models.LearningEvent{
		StudentID: req.StudentID,
		CourseID:  req.CourseID,
		EventType: req.EventType,
		Payload:   req.Payload,
		CreatedAt: time.Now(),
	}

	// Use service to record event
	if err := h.service.RecordLearningEvent(c.Request.Context(), event); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, event)
}
