package services

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

var (
	// ErrQuizNotFound indicates the quiz does not exist.
	ErrQuizNotFound        = errors.New("quiz not found")
	// ErrQuizNotAvailable indicates the quiz is not available to students.
	ErrQuizNotAvailable    = errors.New("quiz not available")
	// ErrQuizNotStarted indicates the quiz start time has not been reached.
	ErrQuizNotStarted      = errors.New("quiz not started")
	// ErrQuizEnded indicates the quiz has passed its end time.
	ErrQuizEnded           = errors.New("quiz ended")
	// ErrMaxAttemptsReached indicates the student has exhausted attempts.
	ErrMaxAttemptsReached  = errors.New("maximum attempts reached")
	// ErrNoActiveAttempt indicates no in-progress attempt exists.
	ErrNoActiveAttempt     = errors.New("no active attempt")
	// ErrSubmissionDeadline indicates the attempt deadline has passed.
	ErrSubmissionDeadline  = errors.New("submission deadline passed")
	// ErrAnswersTooLarge indicates the answer payload exceeds limits.
	ErrAnswersTooLarge     = errors.New("answers too large")
	// ErrQuizPublished indicates edits are blocked for published quizzes.
	ErrQuizPublished       = errors.New("quiz is published")
	// ErrQuestionNotFound indicates the question does not exist.
	ErrQuestionNotFound    = errors.New("question not found")
	// ErrInvalidQuestionType indicates the question type is not supported.
	ErrInvalidQuestionType = errors.New("invalid question type")
	// ErrTooManyOptions indicates a question exceeds the options limit.
	ErrTooManyOptions      = errors.New("too many options")
	// ErrOptionsTooLarge indicates the options payload exceeds limits.
	ErrOptionsTooLarge     = errors.New("options too large")
	// ErrUnpublishNotAllowed indicates a quiz cannot be unpublished due to attempts.
	ErrUnpublishNotAllowed = errors.New("cannot unpublish: attempts exist")
)

// QuizService handles quiz management and attempts.
type QuizService struct {
	repo *repositories.QuizRepository
}

// NewQuizService builds a QuizService with its repository.
func NewQuizService(db *gorm.DB) *QuizService {
	return &QuizService{repo: repositories.NewQuizRepository(db)}
}

// QuizWithAttempt decorates a quiz with attempt statistics.
type QuizWithAttempt struct {
	models.Quiz
	AttemptCount int  `json:"attempt_count"`
	BestScore    *int `json:"best_score,omitempty"`
}

// QuestionWithAnswer includes the correct answer for staff users.
type QuestionWithAnswer struct {
	models.Question
	Answer string `json:"answer"`
}

// QuizDetail represents a quiz and its questions.
type QuizDetail struct {
	Quiz      models.Quiz
	Questions interface{}
}

// CreateQuizRequest contains the fields required to create a quiz.
type CreateQuizRequest struct {
	CourseID           uint
	Title              string
	Description        string
	TimeLimit          int
	StartTime          *time.Time
	EndTime            *time.Time
	MaxAttempts        int
	ShowAnswerAfterEnd bool
	CreatedByID        uint
}

// UpdateQuizRequest contains fields that can be updated on a quiz.
type UpdateQuizRequest struct {
	Title              *string
	Description        *string
	TimeLimit          *int
	StartTime          *time.Time
	EndTime            *time.Time
	MaxAttempts        *int
	ShowAnswerAfterEnd *bool
}

// AddQuestionRequest contains the fields required to add a question.
type AddQuestionRequest struct {
	Type      string
	Content   string
	Options   []string
	Answer    string
	MatchRule string
	Points    int
	OrderNum  int
}

// UpdateQuestionRequest contains the fields that can be updated on a question.
type UpdateQuestionRequest struct {
	Content   *string
	Options   []string
	Answer    *string
	MatchRule *string
	Points    *int
	OrderNum  *int
}

// QuestionResponse is the API response payload for a question.
type QuestionResponse struct {
	ID        uint        `json:"ID"`
	QuizID    uint        `json:"quiz_id"`
	Type      string      `json:"type"`
	Content   string      `json:"content"`
	Options   interface{} `json:"options"`
	Answer    string      `json:"answer"`
	MatchRule string      `json:"match_rule"`
	Points    int         `json:"points"`
	OrderNum  int         `json:"order_num"`
}

// StartQuizResult returns the attempt and questions for a started quiz.
type StartQuizResult struct {
	Attempt   models.QuizAttempt
	Questions []models.Question
	Resumed   bool
}

// SubmitQuizRequest contains the student's answers.
type SubmitQuizRequest struct {
	Answers map[string]interface{}
}

// SubmitQuizResult returns the attempt score summary.
type SubmitQuizResult struct {
	Attempt  models.QuizAttempt
	Score    int
	MaxScore int
}

// QuizResult represents quiz attempts and optional answer data.
type QuizResult struct {
	Quiz      models.Quiz
	Attempts  []models.QuizAttempt
	Questions interface{}
}

// ListQuizzes lists quizzes for a course, with student attempt metadata.
func (s *QuizService) ListQuizzes(ctx context.Context, courseID uint, user UserInfo) (interface{}, error) {
	quizzes, err := s.repo.ListByCourse(ctx, courseID, !user.IsTeacher())
	if err != nil {
		return nil, err
	}
	if user.IsTeacher() {
		return quizzes, nil
	}
	result := make([]QuizWithAttempt, 0, len(quizzes))
	for _, q := range quizzes {
		attempts, err := s.repo.ListAttemptsByQuizAndStudent(ctx, q.ID, user.ID)
		if err != nil {
			return nil, err
		}
		var bestScore *int
		for _, a := range attempts {
			if a.Score == nil {
				continue
			}
			score := *a.Score
			if bestScore == nil || score > *bestScore {
				bestScore = &score
			}
		}
		result = append(result, QuizWithAttempt{
			Quiz:         q,
			AttemptCount: len(attempts),
			BestScore:    bestScore,
		})
	}
	return result, nil
}

// CreateQuiz creates a new quiz.
func (s *QuizService) CreateQuiz(ctx context.Context, req CreateQuizRequest) (*models.Quiz, error) {
	maxAttempts := req.MaxAttempts
	if maxAttempts < 1 || maxAttempts > 3 {
		maxAttempts = 1
	}
	quiz := &models.Quiz{
		CourseID:           req.CourseID,
		CreatedByID:        req.CreatedByID,
		Title:              req.Title,
		Description:        req.Description,
		TimeLimit:          req.TimeLimit,
		StartTime:          req.StartTime,
		EndTime:            req.EndTime,
		MaxAttempts:        maxAttempts,
		ShowAnswerAfterEnd: req.ShowAnswerAfterEnd,
		IsPublished:        false,
		TotalPoints:        0,
	}
	if err := s.repo.Create(ctx, quiz); err != nil {
		return nil, err
	}
	return quiz, nil
}

// GetQuiz returns quiz details and questions, with access rules applied.
func (s *QuizService) GetQuiz(ctx context.Context, quizID uint, user UserInfo) (*QuizDetail, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	questions, err := s.repo.ListQuestions(ctx, quizID)
	if err != nil {
		return nil, err
	}
	if user.IsTeacher() {
		withAnswers := make([]QuestionWithAnswer, len(questions))
		for i, q := range questions {
			withAnswers[i] = QuestionWithAnswer{Question: q, Answer: q.Answer}
		}
		return &QuizDetail{Quiz: *quiz, Questions: withAnswers}, nil
	}
	if !quiz.IsPublished {
		return nil, ErrQuizNotAvailable
	}
	return &QuizDetail{Quiz: *quiz, Questions: questions}, nil
}

// UpdateQuiz updates editable quiz fields.
func (s *QuizService) UpdateQuiz(ctx context.Context, quizID uint, req UpdateQuizRequest) (*models.Quiz, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
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

	if len(updates) > 0 {
		if err := s.repo.Update(ctx, quiz, updates); err != nil {
			return nil, err
		}
	}

	updated, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// DeleteQuiz removes a quiz and its related records.
func (s *QuizService) DeleteQuiz(ctx context.Context, quizID uint) error {
	if _, err := s.repo.FindByID(ctx, quizID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrQuizNotFound
		}
		return err
	}
	if err := s.repo.DeleteQuestionsByQuiz(ctx, quizID); err != nil {
		return err
	}
	if err := s.repo.DeleteAttemptsByQuiz(ctx, quizID); err != nil {
		return err
	}
	return s.repo.DeleteByID(ctx, quizID)
}

// PublishQuiz publishes a quiz and calculates total points.
func (s *QuizService) PublishQuiz(ctx context.Context, quizID uint) (*models.Quiz, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	totalPoints, err := s.repo.SumQuestionPoints(ctx, quizID)
	if err != nil {
		return nil, err
	}
	quiz.IsPublished = true
	quiz.TotalPoints = totalPoints
	if err := s.repo.Save(ctx, quiz); err != nil {
		return nil, err
	}
	return quiz, nil
}

// UnpublishQuiz unpublishes a quiz when no attempts exist.
func (s *QuizService) UnpublishQuiz(ctx context.Context, quizID uint) (*models.Quiz, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	count, err := s.repo.CountAttempts(ctx, quizID)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, ErrUnpublishNotAllowed
	}
	quiz.IsPublished = false
	if err := s.repo.Save(ctx, quiz); err != nil {
		return nil, err
	}
	return quiz, nil
}

// AddQuestion adds a new question to a quiz.
func (s *QuizService) AddQuestion(ctx context.Context, quizID uint, req AddQuestionRequest) (*QuestionResponse, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	if quiz.IsPublished {
		return nil, ErrQuizPublished
	}

	validTypes := map[string]bool{"single_choice": true, "multiple_choice": true, "true_false": true, "fill_blank": true}
	if !validTypes[req.Type] {
		return nil, ErrInvalidQuestionType
	}

	optionsJSON := ""
	if len(req.Options) > 0 {
		if len(req.Options) > 10 {
			return nil, ErrTooManyOptions
		}
		b, _ := json.Marshal(req.Options)
		if len(b) > 10*1024 {
			return nil, ErrOptionsTooLarge
		}
		optionsJSON = string(b)
	}

	points := req.Points
	if points < 1 {
		points = 1
	}
	matchRule := req.MatchRule
	if matchRule == "" {
		matchRule = "exact_trim"
	}

	question := &models.Question{
		QuizID:    quizID,
		Type:      req.Type,
		Content:   req.Content,
		Options:   optionsJSON,
		Answer:    req.Answer,
		MatchRule: matchRule,
		Points:    points,
		OrderNum:  req.OrderNum,
	}
	if err := s.repo.CreateQuestion(ctx, question); err != nil {
		return nil, err
	}
	return &QuestionResponse{
		ID:        question.ID,
		QuizID:    question.QuizID,
		Type:      question.Type,
		Content:   question.Content,
		Options:   req.Options,
		Answer:    question.Answer,
		MatchRule: question.MatchRule,
		Points:    question.Points,
		OrderNum:  question.OrderNum,
	}, nil
}

// UpdateQuestion updates an existing quiz question.
func (s *QuizService) UpdateQuestion(ctx context.Context, questionID uint, req UpdateQuestionRequest) (*QuestionResponse, error) {
	question, err := s.repo.FindQuestionByID(ctx, questionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuestionNotFound
		}
		return nil, err
	}
	quiz, err := s.repo.FindByID(ctx, question.QuizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	if quiz.IsPublished {
		return nil, ErrQuizPublished
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

	if err := s.repo.SaveQuestion(ctx, question); err != nil {
		return nil, err
	}

	return &QuestionResponse{
		ID:        question.ID,
		QuizID:    question.QuizID,
		Type:      question.Type,
		Content:   question.Content,
		Options:   question.Options,
		Answer:    question.Answer,
		MatchRule: question.MatchRule,
		Points:    question.Points,
		OrderNum:  question.OrderNum,
	}, nil
}

// DeleteQuestion removes a question from an unpublished quiz.
func (s *QuizService) DeleteQuestion(ctx context.Context, questionID uint) error {
	question, err := s.repo.FindQuestionByID(ctx, questionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrQuestionNotFound
		}
		return err
	}
	quiz, err := s.repo.FindByID(ctx, question.QuizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrQuizNotFound
		}
		return err
	}
	if quiz.IsPublished {
		return ErrQuizPublished
	}
	return s.repo.DeleteQuestion(ctx, questionID)
}

// StartQuiz starts or resumes a quiz attempt for a student.
func (s *QuizService) StartQuiz(ctx context.Context, quizID uint, user UserInfo) (*StartQuizResult, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}
	if !quiz.IsPublished {
		return nil, ErrQuizNotAvailable
	}

	now := time.Now()
	if quiz.StartTime != nil && now.Before(*quiz.StartTime) {
		return nil, ErrQuizNotStarted
	}
	if quiz.EndTime != nil && now.After(*quiz.EndTime) {
		return nil, ErrQuizEnded
	}

	attemptCount, err := s.repo.CountAttemptsByQuizAndStudent(ctx, quizID, user.ID)
	if err != nil {
		return nil, err
	}
	if int(attemptCount) >= quiz.MaxAttempts {
		return nil, ErrMaxAttemptsReached
	}

	if existingAttempt, err := s.repo.FindInProgressAttempt(ctx, quizID, user.ID); err == nil {
		questions, err := s.repo.ListQuestions(ctx, quizID)
		if err != nil {
			return nil, err
		}
		return &StartQuizResult{
			Attempt:   *existingAttempt,
			Questions: questions,
			Resumed:   true,
		}, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	deadline := now.Add(24 * time.Hour)
	if quiz.TimeLimit > 0 {
		deadline = now.Add(time.Duration(quiz.TimeLimit) * time.Minute)
	}
	if quiz.EndTime != nil && quiz.EndTime.Before(deadline) {
		deadline = *quiz.EndTime
	}

	attempt := &models.QuizAttempt{
		QuizID:        quizID,
		StudentID:     user.ID,
		AttemptNumber: int(attemptCount) + 1,
		StartedAt:     now,
		Deadline:      deadline,
		MaxScore:      quiz.TotalPoints,
	}

	if err := s.repo.CreateAttempt(ctx, attempt); err != nil {
		return nil, err
	}

	questions, err := s.repo.ListQuestions(ctx, quizID)
	if err != nil {
		return nil, err
	}

	return &StartQuizResult{
		Attempt:   *attempt,
		Questions: questions,
		Resumed:   false,
	}, nil
}

// SubmitQuiz submits the current attempt answers for scoring.
func (s *QuizService) SubmitQuiz(ctx context.Context, quizID uint, user UserInfo, req SubmitQuizRequest) (*SubmitQuizResult, error) {
	attempt, err := s.repo.FindInProgressAttempt(ctx, quizID, user.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNoActiveAttempt
		}
		return nil, err
	}

	now := time.Now()
	if now.After(attempt.Deadline) {
		return nil, ErrSubmissionDeadline
	}

	answersJSON, _ := json.Marshal(req.Answers)
	if len(answersJSON) > 100*1024 {
		return nil, ErrAnswersTooLarge
	}

	questions, err := s.repo.ListQuestions(ctx, quizID)
	if err != nil {
		return nil, err
	}

	snapshotJSON, _ := json.Marshal(questions)

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

	if err := s.repo.SaveAttempt(ctx, attempt); err != nil {
		return nil, err
	}

	return &SubmitQuizResult{
		Attempt:  *attempt,
		Score:    score,
		MaxScore: attempt.MaxScore,
	}, nil
}

// GetQuizResult returns attempts and optional answers based on role and timing.
func (s *QuizService) GetQuizResult(ctx context.Context, quizID uint, user UserInfo) (*QuizResult, error) {
	quiz, err := s.repo.FindByID(ctx, quizID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrQuizNotFound
		}
		return nil, err
	}

	if user.IsTeacher() {
		attempts, err := s.repo.ListAttemptsByQuiz(ctx, quizID, "score DESC")
		if err != nil {
			return nil, err
		}
		return &QuizResult{
			Quiz:     *quiz,
			Attempts: attempts,
		}, nil
	}

	attempts, err := s.repo.ListAttemptsByQuizAndStudentOrder(ctx, quizID, user.ID, "attempt_number DESC")
	if err != nil {
		return nil, err
	}

	showAnswers := false
	if quiz.ShowAnswerAfterEnd && quiz.EndTime != nil && time.Now().After(*quiz.EndTime) {
		showAnswers = true
	}

	if showAnswers {
		questions, err := s.repo.ListQuestions(ctx, quizID)
		if err != nil {
			return nil, err
		}
		withAnswers := make([]QuestionWithAnswer, len(questions))
		for i, q := range questions {
			withAnswers[i] = QuestionWithAnswer{Question: q, Answer: q.Answer}
		}
		return &QuizResult{
			Quiz:      *quiz,
			Attempts:  attempts,
			Questions: withAnswers,
		}, nil
	}

	return &QuizResult{
		Quiz:     *quiz,
		Attempts: attempts,
	}, nil
}

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

		var correctAns []string
		json.Unmarshal([]byte(q.Answer), &correctAns)

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
