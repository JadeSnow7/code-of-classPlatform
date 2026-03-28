package services

import (
	"context"
	"encoding/json"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type writingService struct {
	repo     repositories.WritingRepository
	aiClient clients.AIClientInterface
}

// NewWritingService 创建写作服务实例
func NewWritingService(repo repositories.WritingRepository, aiClient clients.AIClientInterface) WritingService {
	return &writingService{repo: repo, aiClient: aiClient}
}

func (s *writingService) Submit(ctx context.Context, submission *models.WritingSubmission, privacy, route string) error {
	if err := s.CreateSubmission(ctx, submission); err != nil {
		return err
	}

	_ = s.RecordLearningEvent(ctx, &models.LearningEvent{
		StudentID: submission.StudentID,
		CourseID:  &submission.CourseID,
		EventType: "writing_submit",
		Payload:   `{"submission_id":` + jsonNumber(submission.ID) + `,"writing_type":"` + submission.WritingType + `"}`,
	})

	// Do not fail submission on async analysis errors to keep API compatible.
	_ = s.ApplyAIAnalysis(ctx, submission, privacy, route)
	return nil
}

func (s *writingService) CreateSubmission(ctx context.Context, submission *models.WritingSubmission) error {
	if submission.Status == "" {
		submission.Status = "draft"
	}
	if err := s.repo.Create(ctx, submission); err != nil {
		return err
	}
	return s.CreateRevision(ctx, submission, "created", "Initial submission created")
}

func (s *writingService) ApplyAIAnalysis(ctx context.Context, submission *models.WritingSubmission, privacy, route string) error {
	if s.aiClient == nil {
		return nil
	}

	req := clients.WritingAnalysisRequest{
		Content:     submission.Content,
		WritingType: submission.WritingType,
		Title:       submission.Title,
		Privacy:     privacy,
		Route:       route,
	}

	resp, err := s.aiClient.AnalyzeWriting(ctx, req)
	if err != nil {
		return nil
	}

	feedbackJSON, _ := json.Marshal(resp)
	dimensionJSON, _ := json.Marshal(resp.Dimensions)
	if err := s.repo.UpdateFeedback(ctx, submission.ID, string(feedbackJSON), string(dimensionJSON)); err != nil {
		return err
	}
	if err := s.CreateRevision(ctx, submission, "ai_feedback", "AI feedback generated"); err != nil {
		return err
	}

	_ = s.RecordLearningEvent(ctx, &models.LearningEvent{
		StudentID: submission.StudentID,
		CourseID:  &submission.CourseID,
		EventType: "writing_analyzed",
		Payload:   `{"submission_id":` + jsonNumber(submission.ID) + `,"score":` + jsonFloat(resp.OverallScore) + `}`,
	})
	return nil
}

func (s *writingService) RecordLearningEvent(ctx context.Context, event *models.LearningEvent) error {
	return s.repo.CreateLearningEvent(ctx, event)
}

func (s *writingService) GetSubmissions(ctx context.Context, courseID uint, studentID *uint) ([]*models.WritingSubmission, error) {
	return s.repo.FindByCourseID(ctx, courseID, studentID)
}

func (s *writingService) GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error) {
	profiles, err := s.repo.FindLearningProfilesByCourseID(ctx, courseID)
	if err != nil {
		return nil, err
	}

	weaknessCounts := make(map[string]int)
	for _, profile := range profiles {
		if profile.WeakPoints == "" {
			continue
		}
		var weakPoints map[string]int
		if err := json.Unmarshal([]byte(profile.WeakPoints), &weakPoints); err == nil {
			for name := range weakPoints {
				weaknessCounts[name]++
			}
		}
	}

	type weaknessStat struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	stats := make([]weaknessStat, 0, len(weaknessCounts))
	for name, count := range weaknessCounts {
		stats = append(stats, weaknessStat{Name: name, Count: count})
	}

	return map[string]interface{}{
		"weakness_stats": stats,
		"student_count":  len(profiles),
	}, nil
}

func (s *writingService) GetSubmission(ctx context.Context, id uint) (*models.WritingSubmission, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *writingService) UpdateSubmission(ctx context.Context, id uint, updates map[string]interface{}) (*models.WritingSubmission, error) {
	submission, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateSubmission(ctx, submission, updates); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.CreateRevision(ctx, updated, "autosave", "Autosave snapshot"); err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *writingService) UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	return s.repo.UpdateFeedback(ctx, id, feedbackJSON, dimensionJSON)
}

func (s *writingService) CreateRevision(ctx context.Context, submission *models.WritingSubmission, triggerType string, summary string) error {
	return s.repo.CreateRevision(ctx, &models.WritingRevision{
		SubmissionID: submission.ID,
		Title:        submission.Title,
		Content:      submission.Content,
		WordCount:    submission.WordCount,
		Summary:      summary,
		TriggerType:  triggerType,
	})
}

func (s *writingService) ListRevisions(ctx context.Context, submissionID uint, page, pageSize int) ([]models.WritingRevision, int64, error) {
	return s.repo.ListRevisions(ctx, submissionID, page, pageSize)
}

func jsonNumber(v uint) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func jsonFloat(v float64) string {
	b, _ := json.Marshal(v)
	return string(b)
}
