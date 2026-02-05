package http

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/services"
	"gorm.io/gorm"
)

type assignmentHandlers struct {
	db       *gorm.DB
	aiClient *clients.AIClient
	service  *services.AssignmentService
}

func newAssignmentHandlers(db *gorm.DB, aiClient *clients.AIClient) *assignmentHandlers {
	return &assignmentHandlers{
		db:       db,
		aiClient: aiClient,
		service:  services.NewAssignmentService(db),
	}
}

// --- Assignment CRUD ---

type createAssignmentRequest struct {
	CourseID    uint   `json:"course_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Deadline    string `json:"deadline"` // ISO8601 format
	AllowFile   bool   `json:"allow_file"`
}

func (h *assignmentHandlers) CreateAssignment(c *gin.Context) {
	var req createAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}
	// If courseId is provided in path, enforce consistency
	if courseIDStr := c.Param("courseId"); courseIDStr != "" {
		courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
		if err != nil {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
			return
		}
		if req.CourseID == 0 {
			req.CourseID = uint(courseID)
		} else if uint64(req.CourseID) != courseID {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "course_id mismatch", nil)
			return
		}
	}

	// Get current user from context (set by AuthRequired middleware)
	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	assignment, err := h.service.CreateAssignment(c.Request.Context(), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, services.CreateAssignmentRequest{
		CourseID:    req.CourseID,
		Title:       req.Title,
		Description: req.Description,
		AllowFile:   req.AllowFile,
	})
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "FORBIDDEN", "you are not the course teacher", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create assignment", nil)
		return
	}

	respondCreated(c, assignment)
}

func (h *assignmentHandlers) ListAssignments(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	assignments, err := h.service.ListAssignments(c.Request.Context(), uint(courseID))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list assignments", nil)
		return
	}

	respondOK(c, assignments)
}

func (h *assignmentHandlers) GetAssignment(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid id", nil)
		return
	}

	assignment, err := h.service.GetAssignment(c.Request.Context(), uint(id))
	if err != nil {
		if errors.Is(err, services.ErrAssignmentNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "assignment not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch assignment", nil)
		return
	}

	respondOK(c, assignment)
}

// --- Submission ---

type submitRequest struct {
	Content string `json:"content"`
	FileURL string `json:"file_url"`
}

func (h *assignmentHandlers) SubmitAssignment(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid assignment id", nil)
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	submission, created, err := h.service.SubmitAssignment(c.Request.Context(), uint(assignmentID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, services.SubmitAssignmentRequest{
		Content: req.Content,
		FileURL: req.FileURL,
	})
	if err != nil {
		if errors.Is(err, services.ErrAssignmentNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "assignment not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to submit assignment", nil)
		return
	}
	if created {
		respondCreated(c, submission)
		return
	}
	respondOK(c, submission)
}

// GetMySubmission returns the current user's submission for an assignment
func (h *assignmentHandlers) GetMySubmission(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid assignment id", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	submission, found, err := h.service.GetMySubmission(c.Request.Context(), uint(assignmentID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch submission", nil)
		return
	}
	if !found {
		respondOK(c, nil)
		return
	}

	respondOK(c, submission)
}

// --- Grading ---

type gradeRequest struct {
	Grade    int    `json:"grade" binding:"required,min=0,max=100"`
	Feedback string `json:"feedback"`
}

func (h *assignmentHandlers) GradeSubmission(c *gin.Context) {
	idStr := c.Param("submissionId")
	submissionID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid submission id", nil)
		return
	}

	var req gradeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	submission, err := h.service.GradeSubmission(c.Request.Context(), uint(submissionID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, req.Grade, req.Feedback)
	if err != nil {
		if errors.Is(err, services.ErrSubmissionNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "submission not found", nil)
			return
		}
		if errors.Is(err, services.ErrAssignmentNotFound) {
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "assignment not found", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "FORBIDDEN", "you are not authorized to grade this submission", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save grade", nil)
		return
	}

	respondOK(c, submission)
}

func (h *assignmentHandlers) ListSubmissions(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid assignment id", nil)
		return
	}

	submissions, err := h.service.ListSubmissions(c.Request.Context(), uint(assignmentID))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list submissions", nil)
		return
	}

	respondOK(c, submissions)
}

// AIGradeSubmission uses AI to analyze a submission and suggest a grade
// Route: POST /submissions/:submissionId/ai-grade
// Requires: teacher/admin/assistant of the course
func (h *assignmentHandlers) AIGradeSubmission(c *gin.Context) {
	idStr := c.Param("submissionId")
	submissionID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid submission id", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	ctxData, err := h.service.GetSubmissionForGrading(c.Request.Context(), uint(submissionID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrSubmissionNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "submission not found", nil)
			return
		}
		if errors.Is(err, services.ErrAssignmentNotFound) {
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "assignment not found", nil)
			return
		}
		if errors.Is(err, services.ErrCourseNotFound) {
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "FORBIDDEN", "you are not authorized to grade this submission", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load submission", nil)
		return
	}

	// Build prompt for AI
	prompt := "请评阅以下学生作业并给出评分建议（0-100分）和详细反馈。\n\n"
	prompt += "作业题目: " + ctxData.Assignment.Title + "\n"
	prompt += "作业要求: " + ctxData.Assignment.Description + "\n\n"
	prompt += "学生提交内容:\n" + ctxData.Submission.Content + "\n\n"
	prompt += "请按以下格式回复:\n建议分数: [0-100]\n评语: [详细反馈]\n改进建议: [如有]"

	// Call AI service
	aiRequest := clients.ChatRequest{
		Mode: "default",
		Messages: []clients.ChatMessage{
			{Role: "user", Content: prompt},
		},
		Stream: false,
	}
	aiResponse, err := h.aiClient.Chat(c.Request.Context(), aiRequest)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "AI service unavailable", nil)
		return
	}

	respondOK(c, gin.H{
		"suggestion":        aiResponse.Reply,
		"recommended_grade": nil, // Let teacher decide based on AI suggestion
	})
}

// --- Statistics ---

func (h *assignmentHandlers) GetCourseAssignmentStats(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	stats, err := h.service.GetCourseAssignmentStats(c.Request.Context(), uint(courseID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch assignment stats", nil)
		return
	}

	respondOK(c, stats)
}

// --- Single Assignment Stats ---

// GetAssignmentStats returns detailed statistics for a single assignment
// GET /assignments/:id/stats
func (h *assignmentHandlers) GetAssignmentStats(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid assignment id", nil)
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not authenticated", nil)
		return
	}

	stats, err := h.service.GetAssignmentStats(c.Request.Context(), uint(assignmentID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrAssignmentNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "assignment not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDenied) {
			respondError(c, http.StatusForbidden, "FORBIDDEN", "not enrolled in this course", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch stats", nil)
		return
	}

	respondOK(c, stats)
}
