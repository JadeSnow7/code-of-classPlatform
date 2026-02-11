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
	return s.repo.Create(ctx, submission)
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

func (s *writingService) UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	return s.repo.UpdateFeedback(ctx, id, feedbackJSON, dimensionJSON)
}

func jsonNumber(v uint) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func jsonFloat(v float64) string {
	b, _ := json.Marshal(v)
	return string(b)
}
