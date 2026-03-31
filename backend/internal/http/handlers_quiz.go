package http

import (
	"errors"
	"math"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type quizAttemptAnswerDTO struct {
	QuestionID string      `json:"questionId"`
	Answer     interface{} `json:"answer"`
}

type quizAttemptDTO struct {
	ID            uint                   `json:"id"`
	QuizID        uint                   `json:"quizId,omitempty"`
	StudentID     uint                   `json:"studentId,omitempty"`
	AttemptNumber int                    `json:"attemptNumber,omitempty"`
	StartedAt     time.Time              `json:"startedAt"`
	Deadline      time.Time              `json:"deadline"`
	SubmittedAt   *time.Time             `json:"submittedAt,omitempty"`
	Answers       []quizAttemptAnswerDTO `json:"answers,omitempty"`
	Score         *int                   `json:"score,omitempty"`
	MaxScore      int                    `json:"maxScore"`
	UpdatedAt     time.Time              `json:"updatedAt"`
}

type quizAttemptStateDTO struct {
	Attempt     quizAttemptDTO         `json:"attempt"`
	Answers     []quizAttemptAnswerDTO `json:"answers"`
	ElapsedTime int                    `json:"elapsedTime"`
}

type quizHandlers struct {
	service *services.QuizService
}

func NewQuizHandlers(db *gorm.DB) *quizHandlers {
	return &quizHandlers{
		service: services.NewQuizService(db),
	}
}

func newQuizHandlers(db *gorm.DB) *quizHandlers {
	return NewQuizHandlers(db)
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

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize == 0 {
		pageSize, _ = strconv.Atoi(c.Query("pageSize"))
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	switch items := data.(type) {
	case []models.Quiz:
		response.OK(c, paginateQuizList(items, page, pageSize))
	case []services.QuizWithAttempt:
		response.OK(c, paginateQuizList(items, page, pageSize))
	default:
		response.OK(c, data)
	}
}

func paginateQuizList[T any](items []T, page, pageSize int) gin.H {
	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	totalPages := 0
	if pageSize > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(pageSize)))
	}

	return gin.H{
		"items":       items[start:end],
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
		"has_more":    end < total,
	}
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

// CreateAttempt creates or resumes an attempt via the attempt resource model.
func (h *quizHandlers) CreateAttempt(c *gin.Context) {
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
			response.BadRequest(c, "failed to create attempt")
		}
		return
	}

	response.OK(c, toQuizAttemptDTO(result.Attempt, nil))
}

// GetAttempt returns a single attempt state.
func (h *quizHandlers) GetAttempt(c *gin.Context) {
	attemptID, err := strconv.ParseUint(c.Param("attemptId"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid attempt id")
		return
	}
	user, _ := middleware.GetUser(c)
	state, err := h.service.GetAttemptState(c.Request.Context(), uint(attemptID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		if errors.Is(err, services.ErrNoActiveAttempt) {
			response.NotFound(c, "quiz attempt")
			return
		}
		response.BadRequest(c, "failed to load attempt")
		return
	}
	response.OK(c, quizAttemptStateDTO{
		Attempt:     toQuizAttemptDTO(state.Attempt, state.Answers),
		Answers:     toQuizAttemptAnswersDTO(state.Answers),
		ElapsedTime: state.ElapsedTime,
	})
}

// UpdateAttemptAnswers autosaves part of an attempt.
func (h *quizHandlers) UpdateAttemptAnswers(c *gin.Context) {
	attemptID, err := strconv.ParseUint(c.Param("attemptId"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid attempt id")
		return
	}
	var req struct {
		Answers []struct {
			QuestionID      string      `json:"questionId"`
			QuestionIDSnake string      `json:"question_id"`
			Answer          interface{} `json:"answer"`
		} `json:"answers" binding:"required"`
		UpdatedAt         *time.Time `json:"updatedAt"`
		IfUnmodifiedSince *time.Time `json:"ifUnmodifiedSince"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	answers := make([]services.AttemptAnswer, 0, len(req.Answers))
	for _, item := range req.Answers {
		questionID := item.QuestionID
		if questionID == "" {
			questionID = item.QuestionIDSnake
		}
		answers = append(answers, services.AttemptAnswer{
			QuestionID: questionID,
			Answer:     item.Answer,
		})
	}
	expected := req.IfUnmodifiedSince
	if expected == nil {
		expected = req.UpdatedAt
	}
	user, _ := middleware.GetUser(c)
	_, err = h.service.UpdateAttemptAnswers(c.Request.Context(), uint(attemptID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	}, services.UpdateAttemptAnswersRequest{
		Answers:           answers,
		IfUnmodifiedSince: expected,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNoActiveAttempt):
			response.NotFound(c, "quiz attempt")
		case errors.Is(err, services.ErrAttemptConflict):
			c.JSON(409, gin.H{
				"success": false,
				"error": gin.H{
					"code":    "CONFLICT",
					"message": "attempt was modified by another request",
				},
			})
		default:
			response.BadRequest(c, "failed to save attempt answers")
		}
		return
	}
	response.OK(c, nil)
}

// SubmitAttempt submits a single attempt resource.
func (h *quizHandlers) SubmitAttempt(c *gin.Context) {
	attemptID, err := strconv.ParseUint(c.Param("attemptId"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid attempt id")
		return
	}
	user, _ := middleware.GetUser(c)
	result, err := h.service.SubmitAttempt(c.Request.Context(), uint(attemptID), services.UserInfo{
		ID:   user.ID,
		Role: user.Role,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNoActiveAttempt):
			response.NotFound(c, "quiz attempt")
		case errors.Is(err, services.ErrSubmissionDeadline):
			response.Forbidden(c, "submission deadline passed")
		default:
			response.BadRequest(c, "failed to submit attempt")
		}
		return
	}
	response.OK(c, gin.H{
		"score":    result.Score,
		"maxScore": result.MaxScore,
		"attempt":  toQuizAttemptDTO(result.Attempt, nil),
	})
}

func toQuizAttemptAnswersDTO(answers []services.AttemptAnswer) []quizAttemptAnswerDTO {
	out := make([]quizAttemptAnswerDTO, 0, len(answers))
	for _, answer := range answers {
		out = append(out, quizAttemptAnswerDTO{
			QuestionID: answer.QuestionID,
			Answer:     answer.Answer,
		})
	}
	return out
}

func toQuizAttemptDTO(attempt models.QuizAttempt, answers []services.AttemptAnswer) quizAttemptDTO {
	return quizAttemptDTO{
		ID:            attempt.ID,
		QuizID:        attempt.QuizID,
		StudentID:     attempt.StudentID,
		AttemptNumber: attempt.AttemptNumber,
		StartedAt:     attempt.StartedAt,
		Deadline:      attempt.Deadline,
		SubmittedAt:   attempt.SubmittedAt,
		Answers:       toQuizAttemptAnswersDTO(answers),
		Score:         attempt.Score,
		MaxScore:      attempt.MaxScore,
		UpdatedAt:     attempt.UpdatedAt,
	}
}
