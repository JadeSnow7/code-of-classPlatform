package http

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type writingHandlers struct {
	service services.WritingService
}

func NewWritingHandlers(service services.WritingService) *writingHandlers {
	return &writingHandlers{service: service}
}

func newWritingHandlers(service services.WritingService) *writingHandlers {
	return NewWritingHandlers(service)
}

// WritingType validation
var validWritingTypes = map[string]bool{
	"literature_review": true,
	"course_paper":      true,
	"thesis":            true,
	"abstract":          true,
}

// SubmitWriting creates a new writing submission
// POST /api/v1/courses/:courseId/writing
type submitWritingRequest struct {
	Title        string `json:"title" binding:"required"`
	Content      string `json:"content" binding:"required"`
	WritingType  string `json:"writing_type" binding:"required"`
	AssignmentID *uint  `json:"assignment_id"`
	Privacy      string `json:"privacy,omitempty"`
	Route        string `json:"route,omitempty"`
}

func (h *writingHandlers) SubmitWriting(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	var req submitWritingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if !validWritingTypes[req.WritingType] {
		response.BadRequest(c, "Invalid writing_type, must be one of: literature_review, course_paper, thesis, abstract")
		return
	}

	studentID, _ := c.Get("user_id")
	wordCount := len(strings.Fields(req.Content))

	submission := &models.WritingSubmission{
		StudentID:    studentID.(uint),
		CourseID:     uint(courseID),
		AssignmentID: req.AssignmentID,
		WritingType:  req.WritingType,
		Title:        req.Title,
		Content:      req.Content,
		WordCount:    wordCount,
	}

	if err := h.service.CreateSubmission(c.Request.Context(), submission); err != nil {
		response.Error(c, err)
		return
	}

	_ = h.service.RecordLearningEvent(c.Request.Context(), &models.LearningEvent{
		StudentID: studentID.(uint),
		CourseID:  &submission.CourseID,
		EventType: "writing_submit",
		Payload:   `{"submission_id":` + strconv.Itoa(int(submission.ID)) + `,"writing_type":"` + req.WritingType + `"}`,
	})

	// Keep async behavior compatible with previous implementation.
	go h.triggerAIAnalysis(*submission, req.Privacy, req.Route)

	response.Created(c, submission)
}

func (h *writingHandlers) triggerAIAnalysis(submission models.WritingSubmission, privacy string, route string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	_ = h.service.ApplyAIAnalysis(ctx, &submission, privacy, route)
}

// GetWritingSubmissions returns writing submissions for a student in a course
// GET /api/v1/courses/:courseId/writing
func (h *writingHandlers) GetWritingSubmissions(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	var studentID *uint
	if role == "student" {
		id := userID.(uint)
		studentID = &id
	}

	submissions, err := h.service.GetSubmissions(c.Request.Context(), uint(courseID), studentID)
	if err != nil {
		response.Error(c, err)
		return
	}

	if writingType := c.Query("writing_type"); writingType != "" {
		filtered := make([]*models.WritingSubmission, 0, len(submissions))
		for _, submission := range submissions {
			if submission.WritingType == writingType {
				filtered = append(filtered, submission)
			}
		}
		response.OK(c, filtered)
		return
	}

	response.OK(c, submissions)
}

// GetWritingSubmission returns a single writing submission with feedback
// GET /api/v1/writing/:id
func (h *writingHandlers) GetWritingSubmission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	submission, err := h.service.GetSubmission(c.Request.Context(), uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "Submission")
			return
		}
		response.Error(c, err)
		return
	}

	studentID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && submission.StudentID != studentID.(uint) {
		response.Forbidden(c, "Cannot view other student's submission")
		return
	}

	response.OK(c, submission)
}

// UpdateWritingFeedback updates AI-generated feedback for a submission
// PUT /api/v1/writing/:id/feedback
type updateFeedbackRequest struct {
	FeedbackJSON  string `json:"feedback_json"`
	DimensionJSON string `json:"dimension_json"`
}

func (h *writingHandlers) UpdateWritingFeedback(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid ID")
		return
	}

	if _, err := h.service.GetSubmission(c.Request.Context(), uint(id)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "Submission")
			return
		}
		response.Error(c, err)
		return
	}

	var req updateFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	if err := h.service.UpdateFeedback(c.Request.Context(), uint(id), req.FeedbackJSON, req.DimensionJSON); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"message": "feedback updated"})
}

// GetWritingStats returns aggregated writing statistics for a course (teacher only)
// GET /api/v1/courses/:courseId/writing/stats
func (h *writingHandlers) GetWritingStats(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	stats, err := h.service.GetStats(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, stats)
}
