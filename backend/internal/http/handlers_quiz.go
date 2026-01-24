package http

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type quizHandlers struct {
	db *gorm.DB
}

func newQuizHandlers(db *gorm.DB) *quizHandlers {
	return &quizHandlers{db: db}
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
	isTeacher := user.Role == "admin" || user.Role == "teacher" || user.Role == "assistant"

	var quizzes []models.Quiz
	query := h.db.Where("course_id = ?", courseID).Order("created_at DESC")
	if !isTeacher {
		// Students only see published quizzes
		query = query.Where("is_published = ?", true)
	}
	if err := query.Find(&quizzes).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load quizzes", nil)
		return
	}

	// For students, add attempt info
	if !isTeacher {
		type quizWithAttempt struct {
			models.Quiz
			AttemptCount int  `json:"attempt_count"`
			BestScore    *int `json:"best_score,omitempty"`
		}
		result := make([]quizWithAttempt, 0, len(quizzes))
		for _, q := range quizzes {
			qa := quizWithAttempt{Quiz: q}
			var attempts []models.QuizAttempt
			h.db.Where("quiz_id = ? AND student_id = ?", q.ID, user.ID).Find(&attempts)
			qa.AttemptCount = len(attempts)
			for _, a := range attempts {
				if a.Score != nil && (qa.BestScore == nil || *a.Score > *qa.BestScore) {
					qa.BestScore = a.Score
				}
			}
			result = append(result, qa)
		}
		respondOK(c, result)
		return
	}

	respondOK(c, quizzes)
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

	// Validate max_attempts (1-3)
	if req.MaxAttempts < 1 || req.MaxAttempts > 3 {
		req.MaxAttempts = 1
	}

	quiz := models.Quiz{
		CourseID:           req.CourseID,
		CreatedByID:        user.ID,
		Title:              req.Title,
		Description:        req.Description,
		TimeLimit:          req.TimeLimit,
		StartTime:          req.StartTime,
		EndTime:            req.EndTime,
		MaxAttempts:        req.MaxAttempts,
		ShowAnswerAfterEnd: req.ShowAnswerAfterEnd,
		IsPublished:        false,
		TotalPoints:        0,
	}

	if err := h.db.Create(&quiz).Error; err != nil {
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
	isTeacher := user.Role == "admin" || user.Role == "teacher" || user.Role == "assistant"

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	// Get questions
	var questions []models.Question
	h.db.Where("quiz_id = ?", quizID).Order("order_num ASC").Find(&questions)

	// For teachers, include answers
	if isTeacher {
		type questionWithAnswer struct {
			models.Question
			Answer string `json:"answer"`
		}
		questionsWithAnswers := make([]questionWithAnswer, len(questions))
		for i, q := range questions {
			questionsWithAnswers[i] = questionWithAnswer{Question: q}
			questionsWithAnswers[i].Answer = q.Answer
		}
		respondOK(c, gin.H{
			"quiz":      quiz,
			"questions": questionsWithAnswers,
		})
		return
	}

	// For students: check if published
	if !quiz.IsPublished {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz not available", nil)
		return
	}

	respondOK(c, gin.H{
		"quiz":      quiz,
		"questions": questions, // Answer field has json:"-" so it's not included
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

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
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

	updates := make(map[string]interface{})
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.TimeLimit != nil {
		updates["time_limit"] = *req.TimeLimit
	}
	if req.StartTime != nil {
		updates["start_time"] = *req.StartTime
	}
	if req.EndTime != nil {
		updates["end_time"] = *req.EndTime
	}
	if req.MaxAttempts != nil && *req.MaxAttempts >= 1 && *req.MaxAttempts <= 3 {
		updates["max_attempts"] = *req.MaxAttempts
	}
	if req.ShowAnswerAfterEnd != nil {
		updates["show_answer_after_end"] = *req.ShowAnswerAfterEnd
	}

	if err := h.db.Model(&quiz).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update quiz", nil)
		return
	}

	h.db.First(&quiz, quizID)
	respondOK(c, quiz)
}

// DeleteQuiz deletes a quiz and its questions
// DELETE /quizzes/:id
func (h *quizHandlers) DeleteQuiz(c *gin.Context) {
	quizID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid quiz id", nil)
		return
	}

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	// Delete questions first
	h.db.Where("quiz_id = ?", quizID).Delete(&models.Question{})
	// Delete attempts
	h.db.Where("quiz_id = ?", quizID).Delete(&models.QuizAttempt{})
	// Delete quiz
	h.db.Delete(&quiz)

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

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	// Calculate total points
	var totalPoints int
	h.db.Model(&models.Question{}).Where("quiz_id = ?", quizID).Select("COALESCE(SUM(points), 0)").Scan(&totalPoints)

	quiz.IsPublished = true
	quiz.TotalPoints = totalPoints
	h.db.Save(&quiz)

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

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	// Check if any attempts exist
	var attemptCount int64
	h.db.Model(&models.QuizAttempt{}).Where("quiz_id = ?", quizID).Count(&attemptCount)
	if attemptCount > 0 {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot unpublish: students have already attempted", nil)
		return
	}

	quiz.IsPublished = false
	h.db.Save(&quiz)

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

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	if quiz.IsPublished {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot add questions to published quiz", nil)
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

	// Validate type
	validTypes := map[string]bool{"single_choice": true, "multiple_choice": true, "true_false": true, "fill_blank": true}
	if !validTypes[req.Type] {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question type", nil)
		return
	}

	// Validate options JSON
	optionsJSON := ""
	if len(req.Options) > 0 {
		if len(req.Options) > 10 {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "too many options (max 10)", nil)
			return
		}
		b, _ := json.Marshal(req.Options)
		if len(b) > 10*1024 {
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "options too large", nil)
			return
		}
		optionsJSON = string(b)
	}

	if req.Points < 1 {
		req.Points = 1
	}
	if req.MatchRule == "" {
		req.MatchRule = "exact_trim"
	}

	question := models.Question{
		QuizID:    uint(quizID),
		Type:      req.Type,
		Content:   req.Content,
		Options:   optionsJSON,
		Answer:    req.Answer,
		MatchRule: req.MatchRule,
		Points:    req.Points,
		OrderNum:  req.OrderNum,
	}

	if err := h.db.Create(&question).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create question", nil)
		return
	}

	// Return with answer for teacher
	respondCreated(c, gin.H{
		"ID":         question.ID,
		"quiz_id":    question.QuizID,
		"type":       question.Type,
		"content":    question.Content,
		"options":    req.Options,
		"answer":     question.Answer,
		"match_rule": question.MatchRule,
		"points":     question.Points,
		"order_num":  question.OrderNum,
	})
}

// UpdateQuestion updates a question
// PUT /questions/:id
func (h *quizHandlers) UpdateQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question id", nil)
		return
	}

	var question models.Question
	if err := h.db.First(&question, questionID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "question not found", nil)
		return
	}

	// Check if quiz is published
	var quiz models.Quiz
	h.db.First(&quiz, question.QuizID)
	if quiz.IsPublished {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot edit questions in published quiz", nil)
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

	if req.Content != nil {
		question.Content = *req.Content
	}
	if req.Options != nil {
		b, _ := json.Marshal(req.Options)
		question.Options = string(b)
	}
	if req.Answer != nil {
		question.Answer = *req.Answer
	}
	if req.MatchRule != nil {
		question.MatchRule = *req.MatchRule
	}
	if req.Points != nil && *req.Points > 0 {
		question.Points = *req.Points
	}
	if req.OrderNum != nil {
		question.OrderNum = *req.OrderNum
	}

	h.db.Save(&question)

	respondOK(c, gin.H{
		"ID":         question.ID,
		"quiz_id":    question.QuizID,
		"type":       question.Type,
		"content":    question.Content,
		"options":    question.Options,
		"answer":     question.Answer,
		"match_rule": question.MatchRule,
		"points":     question.Points,
		"order_num":  question.OrderNum,
	})
}

// DeleteQuestion deletes a question
// DELETE /questions/:id
func (h *quizHandlers) DeleteQuestion(c *gin.Context) {
	questionID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid question id", nil)
		return
	}

	var question models.Question
	if err := h.db.First(&question, questionID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "question not found", nil)
		return
	}

	// Check if quiz is published
	var quiz models.Quiz
	h.db.First(&quiz, question.QuizID)
	if quiz.IsPublished {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "cannot delete questions from published quiz", nil)
		return
	}

	h.db.Delete(&question)
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

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	// Validate quiz availability
	if !quiz.IsPublished {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz not available", nil)
		return
	}

	now := time.Now()
	if quiz.StartTime != nil && now.Before(*quiz.StartTime) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz has not started yet", nil)
		return
	}
	if quiz.EndTime != nil && now.After(*quiz.EndTime) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "quiz has ended", nil)
		return
	}

	// Check attempt count
	var attemptCount int64
	h.db.Model(&models.QuizAttempt{}).Where("quiz_id = ? AND student_id = ?", quizID, user.ID).Count(&attemptCount)
	if int(attemptCount) >= quiz.MaxAttempts {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "maximum attempts reached", nil)
		return
	}

	// Check for in-progress attempt
	var existingAttempt models.QuizAttempt
	if err := h.db.Where("quiz_id = ? AND student_id = ? AND submitted_at IS NULL", quizID, user.ID).First(&existingAttempt).Error; err == nil {
		// Resume existing attempt
		var questions []models.Question
		h.db.Where("quiz_id = ?", quizID).Order("order_num ASC").Find(&questions)

		respondOK(c, gin.H{
			"attempt":   existingAttempt,
			"questions": questions,
			"resumed":   true,
		})
		return
	}

	// Calculate deadline
	deadline := now.Add(24 * time.Hour) // Default 24h
	if quiz.TimeLimit > 0 {
		deadline = now.Add(time.Duration(quiz.TimeLimit) * time.Minute)
	}
	if quiz.EndTime != nil && quiz.EndTime.Before(deadline) {
		deadline = *quiz.EndTime
	}

	attempt := models.QuizAttempt{
		QuizID:        uint(quizID),
		StudentID:     user.ID,
		AttemptNumber: int(attemptCount) + 1,
		StartedAt:     now,
		Deadline:      deadline,
		MaxScore:      quiz.TotalPoints,
	}

	if err := h.db.Create(&attempt).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to start quiz", nil)
		return
	}

	var questions []models.Question
	h.db.Where("quiz_id = ?", quizID).Order("order_num ASC").Find(&questions)

	respondOK(c, gin.H{
		"attempt":   attempt,
		"questions": questions,
		"resumed":   false,
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

	// Find in-progress attempt
	var attempt models.QuizAttempt
	if err := h.db.Where("quiz_id = ? AND student_id = ? AND submitted_at IS NULL", quizID, user.ID).First(&attempt).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "no active attempt found", nil)
		return
	}

	// Check deadline
	now := time.Now()
	if now.After(attempt.Deadline) {
		respondError(c, http.StatusForbidden, "FORBIDDEN", "submission deadline passed", nil)
		return
	}

	var req struct {
		Answers map[string]interface{} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", err.Error(), nil)
		return
	}

	// Validate answers size
	answersJSON, _ := json.Marshal(req.Answers)
	if len(answersJSON) > 100*1024 {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "answers too large", nil)
		return
	}

	// Get questions for grading
	var questions []models.Question
	h.db.Where("quiz_id = ?", quizID).Find(&questions)

	// Create snapshot
	snapshotJSON, _ := json.Marshal(questions)

	// Grade
	score := 0
	for _, q := range questions {
		qIDStr := strconv.FormatUint(uint64(q.ID), 10)
		studentAnswer, ok := req.Answers[qIDStr]
		if !ok {
			continue
		}
		score += gradeQuestion(q, studentAnswer)
	}

	attempt.Answers = string(answersJSON)
	attempt.AnswerSnapshot = string(snapshotJSON)
	attempt.SubmittedAt = &now
	attempt.Score = &score

	h.db.Save(&attempt)

	respondOK(c, gin.H{
		"score":     score,
		"max_score": attempt.MaxScore,
		"attempt":   attempt,
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
	isTeacher := user.Role == "admin" || user.Role == "teacher" || user.Role == "assistant"

	var quiz models.Quiz
	if err := h.db.First(&quiz, quizID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "quiz not found", nil)
		return
	}

	if isTeacher {
		// Return all attempts
		var attempts []models.QuizAttempt
		h.db.Where("quiz_id = ?", quizID).Order("score DESC").Find(&attempts)
		respondOK(c, gin.H{
			"quiz":     quiz,
			"attempts": attempts,
		})
		return
	}

	// Student: return own attempts
	var attempts []models.QuizAttempt
	h.db.Where("quiz_id = ? AND student_id = ?", quizID, user.ID).Order("attempt_number DESC").Find(&attempts)

	// Check if can show answers
	showAnswers := false
	if quiz.ShowAnswerAfterEnd && quiz.EndTime != nil && time.Now().After(*quiz.EndTime) {
		showAnswers = true
	}

	if showAnswers {
		var questions []models.Question
		h.db.Where("quiz_id = ?", quizID).Order("order_num ASC").Find(&questions)

		type questionWithAnswer struct {
			models.Question
			Answer string `json:"answer"`
		}
		questionsWithAnswers := make([]questionWithAnswer, len(questions))
		for i, q := range questions {
			questionsWithAnswers[i] = questionWithAnswer{Question: q}
			questionsWithAnswers[i].Answer = q.Answer
		}

		respondOK(c, gin.H{
			"quiz":      quiz,
			"attempts":  attempts,
			"questions": questionsWithAnswers,
		})
		return
	}

	respondOK(c, gin.H{
		"quiz":     quiz,
		"attempts": attempts,
	})
}

// --- Grading Logic ---

func gradeQuestion(q models.Question, studentAnswer interface{}) int {
	switch q.Type {
	case "single_choice", "true_false":
		ans, ok := studentAnswer.(string)
		if !ok {
			return 0
		}
		if ans == q.Answer {
			return q.Points
		}

	case "multiple_choice":
		// Parse student answer
		var studentAns []string
		switch v := studentAnswer.(type) {
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok {
					studentAns = append(studentAns, s)
				}
			}
		case string:
			json.Unmarshal([]byte(v), &studentAns)
		}

		// Parse correct answer
		var correctAns []string
		json.Unmarshal([]byte(q.Answer), &correctAns)

		// Sort and compare
		sort.Strings(studentAns)
		sort.Strings(correctAns)
		if equalStringSlices(studentAns, correctAns) {
			return q.Points
		}

	case "fill_blank":
		ans, ok := studentAnswer.(string)
		if !ok {
			return 0
		}
		if matchFillBlank(q.Answer, ans, q.MatchRule) {
			return q.Points
		}
	}

	return 0
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func matchFillBlank(answer, studentAns, rule string) bool {
	// Handle array of acceptable answers
	var answers []string
	if err := json.Unmarshal([]byte(answer), &answers); err != nil {
		answers = []string{answer}
	}

	for _, ans := range answers {
		switch rule {
		case "exact":
			if studentAns == ans {
				return true
			}
		case "exact_trim":
			if strings.TrimSpace(strings.ToLower(studentAns)) == strings.TrimSpace(strings.ToLower(ans)) {
				return true
			}
		case "contains":
			if strings.Contains(strings.ToLower(studentAns), strings.ToLower(ans)) {
				return true
			}
		case "regex":
			if matched, _ := regexp.MatchString(ans, studentAns); matched {
				return true
			}
		}
	}
	return false
}
