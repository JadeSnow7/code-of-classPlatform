package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type writingHandlers struct {
	db       *gorm.DB
	aiClient *clients.AIClient
}

func newWritingHandlers(db *gorm.DB, aiClient *clients.AIClient) *writingHandlers {
	return &writingHandlers{db: db, aiClient: aiClient}
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
}

func (h *writingHandlers) SubmitWriting(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course_id", nil)
		return
	}

	var req submitWritingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request: "+err.Error(), nil)
		return
	}

	// Validate writing type
	if !validWritingTypes[req.WritingType] {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid writing_type, must be one of: literature_review, course_paper, thesis, abstract", nil)
		return
	}

	studentID, _ := c.Get("user_id")

	// Count words (simple split by whitespace)
	wordCount := len(strings.Fields(req.Content))

	submission := models.WritingSubmission{
		StudentID:    studentID.(uint),
		CourseID:     uint(courseID),
		AssignmentID: req.AssignmentID,
		WritingType:  req.WritingType,
		Title:        req.Title,
		Content:      req.Content,
		WordCount:    wordCount,
	}

	if err := h.db.Create(&submission).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error(), nil)
		return
	}

	// Record learning event
	h.db.Create(&models.LearningEvent{
		StudentID: studentID.(uint),
		CourseID:  &submission.CourseID,
		EventType: "writing_submit",
		Payload:   `{"submission_id":` + strconv.Itoa(int(submission.ID)) + `,"writing_type":"` + req.WritingType + `"}`,
	})

	// Trigger async AI analysis
	go h.triggerAIAnalysis(submission)

	respondCreated(c, submission)
}

func (h *writingHandlers) triggerAIAnalysis(submission models.WritingSubmission) {
	// Create context with timeout for analysis
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Prepare request
	req := clients.WritingAnalysisRequest{
		Content:     submission.Content,
		WritingType: submission.WritingType,
		Title:       submission.Title,
	}

	// Call AI service
	resp, err := h.aiClient.AnalyzeWriting(ctx, req)
	if err != nil {
		// Log error (in a real app, use a logger)
		// fmt.Printf("AI analysis failed for submission %d: %v\n", submission.ID, err)
		return
	}

	// Serialize results
	feedbackJSON, _ := json.Marshal(resp)
	dimensionJSON, _ := json.Marshal(resp.Dimensions)

	// Update submission
	h.db.Model(&submission).Updates(map[string]interface{}{
		"feedback_json":  string(feedbackJSON),
		"dimension_json": string(dimensionJSON),
	})

	// Record completion event
	h.db.Create(&models.LearningEvent{
		StudentID: submission.StudentID,
		CourseID:  &submission.CourseID,
		EventType: "writing_analyzed",
		Payload:   `{"submission_id":` + strconv.Itoa(int(submission.ID)) + `,"score":` + strconv.FormatFloat(resp.OverallScore, 'f', 1, 64) + `}`,
	})
}

// GetWritingSubmissions returns writing submissions for a student in a course
// GET /api/v1/courses/:courseId/writing
func (h *writingHandlers) GetWritingSubmissions(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course_id", nil)
		return
	}

	studentID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	var submissions []models.WritingSubmission
	query := h.db.Where("course_id = ?", courseID)

	// Students can only see their own submissions
	if role == "student" {
		query = query.Where("student_id = ?", studentID)
	}

	// Optional writing_type filter
	if writingType := c.Query("writing_type"); writingType != "" {
		query = query.Where("writing_type = ?", writingType)
	}

	query.Order("created_at DESC").Find(&submissions)

	respondOK(c, submissions)
}

// GetWritingSubmission returns a single writing submission with feedback
// GET /api/v1/writing/:id
func (h *writingHandlers) GetWritingSubmission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid id", nil)
		return
	}

	var submission models.WritingSubmission
	if err := h.db.First(&submission, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "submission not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error(), nil)
		return
	}

	if !requireCourseModuleForCourseID(c, h.db, submission.CourseID, "course.writing") {
		return
	}

	// Check permission
	studentID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && submission.StudentID != studentID.(uint) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "cannot view other student's submission", nil)
		return
	}

	respondOK(c, submission)
}

// UpdateWritingFeedback updates AI-generated feedback for a submission (internal/AI service use)
// PUT /api/v1/writing/:id/feedback
type updateFeedbackRequest struct {
	FeedbackJSON  string `json:"feedback_json"`
	DimensionJSON string `json:"dimension_json"`
}

func (h *writingHandlers) UpdateWritingFeedback(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid id", nil)
		return
	}

	var submission models.WritingSubmission
	if err := h.db.First(&submission, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "submission not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error(), nil)
		return
	}

	if !requireCourseModuleForCourseID(c, h.db, submission.CourseID, "course.writing") {
		return
	}

	var req updateFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	result := h.db.Model(&models.WritingSubmission{}).Where("id = ?", id).Updates(map[string]interface{}{
		"feedback_json":  req.FeedbackJSON,
		"dimension_json": req.DimensionJSON,
	})

	if result.Error != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", result.Error.Error(), nil)
		return
	}

	if result.RowsAffected == 0 {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "submission not found", nil)
		return
	}

	respondOK(c, gin.H{"message": "feedback updated"})
}

// GetWritingStats returns aggregated writing statistics for a course (teacher only)
// GET /api/v1/courses/:courseId/writing/stats
func (h *writingHandlers) GetWritingStats(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course_id", nil)
		return
	}

	var profiles []models.StudentLearningProfile
	if err := h.db.Where("course_id = ?", courseID).Find(&profiles).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch profiles", nil)
		return
	}

	// Aggregate weak points
	weaknessCounts := make(map[string]int)
	for _, p := range profiles {
		if p.WeakPoints == "" {
			continue
		}
		var wp map[string]int
		if err := json.Unmarshal([]byte(p.WeakPoints), &wp); err == nil {
			for k := range wp {
				weaknessCounts[k]++
			}
		}
	}

	// Convert to list for frontend
	type WeaknessStat struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	stats := make([]WeaknessStat, 0, len(weaknessCounts))
	for k, v := range weaknessCounts {
		stats = append(stats, WeaknessStat{Name: k, Count: v})
	}

	respondOK(c, gin.H{
		"weakness_stats": stats,
		"student_count":  len(profiles),
	})
}
