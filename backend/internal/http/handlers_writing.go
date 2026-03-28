package http

import (
	"context"
	"encoding/json"
	"errors"
	"math"
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

type writingFeedbackDimensionDTO struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Score       float64  `json:"score"`
	Comment     string   `json:"comment"`
	Suggestions []string `json:"suggestions,omitempty"`
}

type writingFeedbackDTO struct {
	OverallScore      float64                       `json:"overallScore"`
	Summary           string                        `json:"summary"`
	Dimensions        []writingFeedbackDimensionDTO `json:"dimensions"`
	InlineSuggestions []map[string]interface{}      `json:"inlineSuggestions,omitempty"`
}

type writingSubmissionDTO struct {
	ID          string              `json:"id"`
	Title       string              `json:"title"`
	WritingType string              `json:"writingType"`
	Content     string              `json:"content,omitempty"`
	WordCount   *int                `json:"wordCount,omitempty"`
	Status      string              `json:"status,omitempty"`
	CreatedAt   string              `json:"createdAt,omitempty"`
	UpdatedAt   string              `json:"updatedAt,omitempty"`
	StudentID   uint                `json:"studentId,omitempty"`
	Feedback    *writingFeedbackDTO `json:"feedback,omitempty"`
}

type writingRevisionDTO struct {
	ID          string `json:"id"`
	CreatedAt   string `json:"createdAt"`
	WordCount   int    `json:"wordCount"`
	Summary     string `json:"summary,omitempty"`
	TriggerType string `json:"triggerType"`
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
	h.getWritingSubmission(c, false)
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

func (h *writingHandlers) CreateWritingSubmission(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}
	var req struct {
		Title       string `json:"title" binding:"required"`
		WritingType string `json:"writingType" binding:"required"`
		Content     string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if !validWritingTypes[req.WritingType] {
		response.BadRequest(c, "Invalid writingType")
		return
	}
	user, _ := c.Get("user_id")
	wordCount := len(strings.Fields(req.Content))
	submission := &models.WritingSubmission{
		StudentID:   user.(uint),
		CourseID:    uint(courseID),
		WritingType: req.WritingType,
		Title:       req.Title,
		Content:     req.Content,
		WordCount:   wordCount,
		Status:      "draft",
	}
	if err := h.service.CreateSubmission(c.Request.Context(), submission); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, toWritingSubmissionDTO(submission))
}

func (h *writingHandlers) GetWritingSubmissionV2(c *gin.Context) {
	h.getWritingSubmission(c, true)
}

func (h *writingHandlers) UpdateWritingSubmission(c *gin.Context) {
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
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && submission.StudentID != userID.(uint) {
		response.Forbidden(c, "Cannot update other student's submission")
		return
	}
	var req struct {
		Title     *string `json:"title"`
		Content   *string `json:"content"`
		WordCount *int    `json:"wordCount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}
	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		updates["content"] = *req.Content
		if req.WordCount == nil {
			updates["word_count"] = len(strings.Fields(*req.Content))
		}
	}
	if req.WordCount != nil {
		updates["word_count"] = *req.WordCount
	}
	updated, err := h.service.UpdateSubmission(c.Request.Context(), uint(id), updates)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, toWritingSubmissionDTO(updated))
}

func (h *writingHandlers) RequestWritingAIFeedback(c *gin.Context) {
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
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && submission.StudentID != userID.(uint) {
		response.Forbidden(c, "Cannot analyze other student's submission")
		return
	}
	if err := h.service.ApplyAIAnalysis(c.Request.Context(), submission, "", ""); err != nil {
		response.Error(c, err)
		return
	}
	updated, err := h.service.GetSubmission(c.Request.Context(), uint(id))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, toWritingFeedbackDTO(updated))
}

func (h *writingHandlers) ListWritingRevisions(c *gin.Context) {
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
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && submission.StudentID != userID.(uint) {
		response.Forbidden(c, "Cannot view other student's submission revisions")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	revisions, total, err := h.service.ListRevisions(c.Request.Context(), uint(id), page, pageSize)
	if err != nil {
		response.Error(c, err)
		return
	}
	items := make([]writingRevisionDTO, 0, len(revisions))
	for _, revision := range revisions {
		items = append(items, writingRevisionDTO{
			ID:          strconv.FormatUint(uint64(revision.ID), 10),
			CreatedAt:   revision.CreatedAt.Format(time.RFC3339),
			WordCount:   revision.WordCount,
			Summary:     revision.Summary,
			TriggerType: revision.TriggerType,
		})
	}
	totalPages := 0
	if pageSize > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(pageSize)))
	}
	response.OK(c, gin.H{
		"items":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": totalPages,
		"hasMore":    int64(page*pageSize) < total,
	})
}

func (h *writingHandlers) getWritingSubmission(c *gin.Context, camelCase bool) {
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
	if camelCase {
		response.OK(c, toWritingSubmissionDTO(submission))
		return
	}
	response.OK(c, submission)
}

func toWritingSubmissionDTO(submission *models.WritingSubmission) writingSubmissionDTO {
	var wordCount *int
	if submission != nil {
		wordCount = &submission.WordCount
	}
	dto := writingSubmissionDTO{
		ID:          strconv.FormatUint(uint64(submission.ID), 10),
		Title:       submission.Title,
		WritingType: submission.WritingType,
		Content:     submission.Content,
		WordCount:   wordCount,
		Status:      submission.Status,
		CreatedAt:   submission.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   submission.UpdatedAt.Format(time.RFC3339),
		StudentID:   submission.StudentID,
	}
	dto.Feedback = toWritingFeedbackDTO(submission)
	return dto
}

func toWritingFeedbackDTO(submission *models.WritingSubmission) *writingFeedbackDTO {
	if submission == nil || strings.TrimSpace(submission.FeedbackJSON) == "" {
		return nil
	}
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(submission.FeedbackJSON), &payload); err != nil {
		return nil
	}
	dto := &writingFeedbackDTO{
		OverallScore: toFloat(payload["overall_score"]),
		Summary:      toString(payload["feedback"]),
	}
	if summary := toString(payload["summary"]); summary != "" {
		dto.Summary = summary
	}
	if rawInlineSuggestions, ok := payload["inline_suggestions"].([]interface{}); ok {
		dto.InlineSuggestions = toObjectSlice(rawInlineSuggestions)
	}
	if rawDimensions, ok := payload["dimensions"].([]interface{}); ok {
		for _, rawDimension := range rawDimensions {
			dimension, ok := rawDimension.(map[string]interface{})
			if !ok {
				continue
			}
			key := toString(dimension["key"])
			if key == "" {
				key = toString(dimension["name"])
			}
			label := toString(dimension["label"])
			if label == "" {
				label = toString(dimension["name"])
			}
			if label == "" {
				label = key
			}
			comment := toString(dimension["comment"])
			if comment == "" {
				comment = toString(dimension["feedback"])
			}
			dto.Dimensions = append(dto.Dimensions, writingFeedbackDimensionDTO{
				Key:         key,
				Label:       label,
				Score:       toFloat(dimension["score"]),
				Comment:     comment,
				Suggestions: toStringSlice(dimension["suggestions"]),
			})
		}
	}
	return dto
}

func toFloat(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		f, _ := v.Float64()
		return f
	default:
		return 0
	}
}

func toString(value interface{}) string {
	if v, ok := value.(string); ok {
		return v
	}
	return ""
}

func toStringSlice(value interface{}) []string {
	raw, ok := value.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func toObjectSlice(items []interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		if object, ok := item.(map[string]interface{}); ok {
			out = append(out, object)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
