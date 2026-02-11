package http

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
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
		response.BadRequest(c, "Invalid course ID")
		return
	}

	user, _ := middleware.GetUser(c)
	data, err := h.service.ListQuizzes(c.Request.Context(), uint(courseID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		response.BadRequest(c, "Failed to load quizzes")
		return
	}
	response.OK(c, data)
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
		response.BadRequest(c, err.Error())
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
		response.BadRequest(c, "Failed to create quiz")
		return
	}

	response.Created(c, quiz)
}

// GetQuiz returns quiz details with questions
// GET /quizzes/:id
func (h *quizHandlers) GetQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
		return
	}

	user, _ := middleware.GetUser(c)
	detail, err := h.service.GetQuiz(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			response.NotFound(c, "quiz not found")
			return
		}
		if errors.Is(err, services.ErrQuizNotAvailable) {
			response.Forbidden(c, "quiz not available")
			return
		}
		response.BadRequest(c, "failed to load quiz")
		return
	}

	response.OK(c, gin.H{
		"quiz":      detail.Quiz,
		"questions": detail.Questions,
	})
}

// UpdateQuiz updates quiz metadata
// PUT /quizzes/:id
func (h *quizHandlers) UpdateQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
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
		response.BadRequest(c, err.Error())
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
			response.NotFound(c, "quiz not found")
			return
		}
		response.BadRequest(c, "failed to update quiz")
		return
	}

	response.OK(c, updated)
}

// DeleteQuiz deletes a quiz and its questions
// DELETE /quizzes/:id
func (h *quizHandlers) DeleteQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
		return
	}

	if err := h.service.DeleteQuiz(c.Request.Context(), uint(quizID)); err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			response.NotFound(c, "quiz not found")
			return
		}
		response.BadRequest(c, "failed to delete quiz")
		return
	}

	response.OK(c, gin.H{"message": "quiz deleted"})
}

// PublishQuiz publishes a quiz (locks questions)
// POST /quizzes/:id/publish
func (h *quizHandlers) PublishQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
		return
	}

	quiz, err := h.service.PublishQuiz(c.Request.Context(), uint(quizID))
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			response.NotFound(c, "quiz not found")
			return
		}
		response.BadRequest(c, "failed to publish quiz")
		return
	}
	response.OK(c, quiz)
}

// UnpublishQuiz unpublishes a quiz (allows editing)
// POST /quizzes/:id/unpublish
func (h *quizHandlers) UnpublishQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
		return
	}

	quiz, err := h.service.UnpublishQuiz(c.Request.Context(), uint(quizID))
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			response.NotFound(c, "quiz not found")
			return
		}
		if errors.Is(err, services.ErrUnpublishNotAllowed) {
			response.BadRequest(c, "cannot unpublish: students have already attempted")
			return
		}
		response.BadRequest(c, "failed to unpublish quiz")
		return
	}
	response.OK(c, quiz)
}

// --- Question CRUD ---

// AddQuestion adds a question to a quiz
// POST /quizzes/:id/questions
func (h *quizHandlers) AddQuestion(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
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
		response.BadRequest(c, err.Error())
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
			response.NotFound(c, "quiz not found")
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			response.BadRequest(c, "cannot add questions to published quiz")
			return
		}
		if errors.Is(err, services.ErrInvalidQuestionType) {
			response.BadRequest(c, "invalid question type")
			return
		}
		if errors.Is(err, services.ErrTooManyOptions) {
			response.BadRequest(c, "too many options (max 10)")
			return
		}
		if errors.Is(err, services.ErrOptionsTooLarge) {
			response.BadRequest(c, "options too large")
			return
		}
		response.BadRequest(c, "failed to create question")
		return
	}

	response.Created(c, question)
}

// UpdateQuestion updates a question
// PUT /questions/:id
func (h *quizHandlers) UpdateQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid question id")
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
		response.BadRequest(c, err.Error())
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
			response.NotFound(c, "question not found")
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			response.BadRequest(c, "cannot edit questions in published quiz")
			return
		}
		response.BadRequest(c, "failed to update question")
		return
	}

	response.OK(c, updated)
}

// DeleteQuestion deletes a question
// DELETE /questions/:id
func (h *quizHandlers) DeleteQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid question id")
		return
	}

	if err := h.service.DeleteQuestion(c.Request.Context(), uint(questionID)); err != nil {
		if errors.Is(err, services.ErrQuestionNotFound) {
			response.NotFound(c, "question not found")
			return
		}
		if errors.Is(err, services.ErrQuizPublished) {
			response.BadRequest(c, "cannot delete questions from published quiz")
			return
		}
		response.BadRequest(c, "failed to delete question")
		return
	}
	response.OK(c, gin.H{"message": "question deleted"})
}

// --- Quiz Attempts ---

// StartQuiz starts a new quiz attempt
// POST /quizzes/:id/start
func (h *quizHandlers) StartQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid quiz id")
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
			response.NotFound(c, "quiz not found")
		case errors.Is(err, services.ErrQuizNotAvailable):
			response.Forbidden(c, "quiz not available")
		case errors.Is(err, services.ErrQuizNotStarted):
			response.Forbidden(c, "quiz has not started yet")
		case errors.Is(err, services.ErrQuizEnded):
			response.Forbidden(c, "quiz has ended")
		case errors.Is(err, services.ErrMaxAttemptsReached):
			response.Forbidden(c, "maximum attempts reached")
		default:
			response.BadRequest(c, "failed to start quiz")
		}
		return
	}

	response.OK(c, gin.H{
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
		response.BadRequest(c, "invalid quiz id")
		return
	}

	user, _ := middleware.GetUser(c)
	var req struct {
		Answers map[string]interface{} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	result, err := h.service.SubmitQuiz(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, services.SubmitQuizRequest{Answers: req.Answers})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNoActiveAttempt):
			response.NotFound(c, "no active attempt found")
		case errors.Is(err, services.ErrSubmissionDeadline):
			response.Forbidden(c, "submission deadline passed")
		case errors.Is(err, services.ErrAnswersTooLarge):
			response.BadRequest(c, "answers too large")
		default:
			response.BadRequest(c, "failed to submit quiz")
		}
		return
	}

	response.OK(c, gin.H{
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
		response.BadRequest(c, "invalid quiz id")
		return
	}

	user, _ := middleware.GetUser(c)
	result, err := h.service.GetQuizResult(c.Request.Context(), uint(quizID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrQuizNotFound) {
			response.NotFound(c, "quiz not found")
			return
		}
		response.BadRequest(c, "failed to load quiz result")
		return
	}

	if result.Questions != nil {
		response.OK(c, gin.H{
			"quiz":      result.Quiz,
			"attempts":  result.Attempts,
			"questions": result.Questions,
		})
		return
	}

	response.OK(c, gin.H{
		"quiz":     result.Quiz,
		"attempts": result.Attempts,
	})
}
