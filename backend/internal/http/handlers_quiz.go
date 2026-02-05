package http

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/services"
	"gorm.io/gorm"
)

type quizHandlers struct {
	service *services.QuizService
}

func newQuizHandlers(db *gorm.DB) *quizHandlers {
	return &quizHandlers{
		service: services.NewQuizService(db),
	}
}

// --- Quiz CRUD ---

// ListQuizzes returns quizzes for a course
// GET /courses/:courseId/quizzes
func (h *quizHandlers) ListQuizzes(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	user, _ := middleware.GetUser(c)
	data, err := h.service.ListQuizzes(c.Request.Context(), uint(courseID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load quizzes", nil)
		return
	}
	respondOK(c, data)
}

// CreateQuiz creates a new quiz
// POST /quizzes
func (h *quizHandlers) CreateQuiz(c *gin.Context) {
	user, _ := middleware.GetUser(c)

	var req struct {
		CourseID           uint       `json:"course_id" binding:"required"`
		Title              string     `json:"title" binding:"required"`
		Description        string     `json:"description"`
		TimeLimit          int        `json:"time_limit"`
		StartTime          *time.Time `json:"start_time"`
		EndTime            *time.Time `json:"end_time"`
		MaxAttempts        int        `json:"max_attempts"`
		ShowAnswerAfterEnd bool       `json:"show_answer_after_end"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}

	quiz, err := h.service.CreateQuiz(c.Request.Context(), services.CreateQuizRequest{
		CourseID:           req.CourseID,
		Title:              req.Title,
		Description:        req.Description,
		TimeLimit:          req.TimeLimit,
		StartTime:          req.StartTime,
		EndTime:            req.EndTime,
		MaxAttempts:        req.MaxAttempts,
		ShowAnswerAfterEnd: req.ShowAnswerAfterEnd,
		CreatedByID:        user.ID,
	})
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create quiz", nil)
		return
	}

	respondCreated(c, quiz)
}

// GetQuiz returns quiz details with questions
// GET /quizzes/:id
func (h *quizHandlers) GetQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	user, _ := middleware.GetUser(c)
	detail, err := h.service.GetQuiz(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		if errors.Is(err, services.ErrQuizNotAvailable) {
			respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz not available", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load quiz", nil)
		return
	}

	respondOK(c, gin.H{
		"quiz":      detail.Quiz,
		"questions": detail.Questions,
	})
}

// UpdateQuiz updates quiz metadata
// PUT /quizzes/:id
func (h *quizHandlers) UpdateQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	var req struct {
		Title              *string    `json:"title"`
		Description        *string    `json:"description"`
		TimeLimit          *int       `json:"time_limit"`
		StartTime          *time.Time `json:"start_time"`
		EndTime            *time.Time `json:"end_time"`
		MaxAttempts        *int       `json:"max_attempts"`
		ShowAnswerAfterEnd *bool      `json:"show_answer_after_end"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}

	updated, err := h.service.UpdateQuiz(c.Request.Context(), uint(quizID), services.UpdateQuizRequest{
		Title:              req.Title,
		Description:        req.Description,
		TimeLimit:          req.TimeLimit,
		StartTime:          req.StartTime,
		EndTime:            req.EndTime,
		MaxAttempts:        req.MaxAttempts,
		ShowAnswerAfterEnd: req.ShowAnswerAfterEnd,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update quiz", nil)
		return
	}

	respondOK(c, updated)
}

// DeleteQuiz deletes a quiz and its questions
// DELETE /quizzes/:id
func (h *quizHandlers) DeleteQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	if err := h.service.DeleteQuiz(c.Request.Context(), uint(quizID)); err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete quiz", nil)
		return
	}

	respondOK(c, gin.H{"message": "quiz deleted"})
}

// PublishQuiz publishes a quiz (locks questions)
// POST /quizzes/:id/publish
func (h *quizHandlers) PublishQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	quiz, err := h.service.PublishQuiz(c.Request.Context(), uint(quizID))
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to publish quiz", nil)
		return
	}
	respondOK(c, quiz)
}

// UnpublishQuiz unpublishes a quiz (allows editing)
// POST /quizzes/:id/unpublish
func (h *quizHandlers) UnpublishQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	quiz, err := h.service.UnpublishQuiz(c.Request.Context(), uint(quizID))
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		if errors.Is(err, services.ErrUnpublishNotAllowed) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot unpublish: students have already attempted", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to unpublish quiz", nil)
		return
	}
	respondOK(c, quiz)
}

// --- Question CRUD ---

// AddQuestion adds a question to a quiz
// POST /quizzes/:id/questions
func (h *quizHandlers) AddQuestion(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	var req struct {
		Type      string   `json:"type" binding:"required"`
		Content   string   `json:"content" binding:"required"`
		Options   []string `json:"options"`
		Answer    string   `json:"answer" binding:"required"`
		MatchRule string   `json:"match_rule"`
		Points    int      `json:"points"`
		OrderNum  int      `json:"order_num"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}
	question, err := h.service.AddQuestion(c.Request.Context(), uint(quizID), services.AddQuestionRequest{
		Type:      req.Type,
		Content:   req.Content,
		Options:   req.Options,
		Answer:    req.Answer,
		MatchRule: req.MatchRule,
		Points:    req.Points,
		OrderNum:  req.OrderNum,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot add questions to published quiz", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidQuestionType) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question type", nil)
			return
		}
		if errors.Is(err, services.ErrTooManyOptions) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "too many options (max 10)", nil)
			return
		}
		if errors.Is(err, services.ErrOptionsTooLarge) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "options too large", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create question", nil)
		return
	}

	respondCreated(c, question)
}

// UpdateQuestion updates a question
// PUT /questions/:id
func (h *quizHandlers) UpdateQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question id", nil)
		return
	}

	var req struct {
		Content   *string  `json:"content"`
		Options   []string `json:"options"`
		Answer    *string  `json:"answer"`
		MatchRule *string  `json:"match_rule"`
		Points    *int     `json:"points"`
		OrderNum  *int     `json:"order_num"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}
	updated, err := h.service.UpdateQuestion(c.Request.Context(), uint(questionID), services.UpdateQuestionRequest{
		Content:   req.Content,
		Options:   req.Options,
		Answer:    req.Answer,
		MatchRule: req.MatchRule,
		Points:    req.Points,
		OrderNum:  req.OrderNum,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuestionNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "question not found", nil)
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot edit questions in published quiz", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update question", nil)
		return
	}

	respondOK(c, updated)
}

// DeleteQuestion deletes a question
// DELETE /questions/:id
func (h *quizHandlers) DeleteQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question id", nil)
		return
	}

	if err := h.service.DeleteQuestion(c.Request.Context(), uint(questionID)); err != nil {
		if errors.Is(err, services.ErrQuestionNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "question not found", nil)
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot delete questions from published quiz", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete question", nil)
		return
	}
	respondOK(c, gin.H{"message": "question deleted"})
}

// --- Quiz Attempts ---

// StartQuiz starts a new quiz attempt
// POST /quizzes/:id/start
func (h *quizHandlers) StartQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	user, _ := middleware.GetUser(c)
	result, err := h.service.StartQuiz(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrQuizNotFound):
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		case errors.Is(err, services.ErrQuizNotAvailable):
			respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz not available", nil)
		case errors.Is(err, services.ErrQuizNotStarted):
			respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz has not started yet", nil)
		case errors.Is(err, services.ErrQuizEnded):
			respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz has ended", nil)
		case errors.Is(err, services.ErrMaxAttemptsReached):
			respondError(c, http.StatusForbidden, "FORBIDDEN", "maximum attempts reached", nil)
		default:
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to start quiz", nil)
		}
		return
	}

	respondOK(c, gin.H{
		"attempt":   result.Attempt,
		"questions": result.Questions,
		"resumed":   result.Resumed,
	})
}

// SubmitQuiz submits quiz answers
// POST /quizzes/:id/submit
func (h *quizHandlers) SubmitQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	user, _ := middleware.GetUser(c)
	var req struct {
		Answers map[string]interface{} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}
	result, err := h.service.SubmitQuiz(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, services.SubmitQuizRequest{Answers: req.Answers})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNoActiveAttempt):
			respondError(c, http.StatusNotFound, "NOT_FOUND", "no active attempt found", nil)
		case errors.Is(err, services.ErrSubmissionDeadline):
			respondError(c, http.StatusForbidden, "FORBIDDEN", "submission deadline passed", nil)
		case errors.Is(err, services.ErrAnswersTooLarge):
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "answers too large", nil)
		default:
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to submit quiz", nil)
		}
		return
	}

	respondOK(c, gin.H{
		"score":     result.Score,
		"max_score": result.MaxScore,
		"attempt":   result.Attempt,
	})
}

// GetQuizResult returns quiz result for student
// GET /quizzes/:id/result
func (h *quizHandlers) GetQuizResult(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	user, _ := middleware.GetUser(c)
	result, err := h.service.GetQuizResult(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load quiz result", nil)
		return
	}

	if result.Questions != nil {
		respondOK(c, gin.H{
			"quiz":      result.Quiz,
			"attempts":  result.Attempts,
			"questions": result.Questions,
		})
		return
	}

	respondOK(c, gin.H{
		"quiz":     result.Quiz,
		"attempts": result.Attempts,
	})
}
