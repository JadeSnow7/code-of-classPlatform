package services

import (
	"context"
	"encoding/json"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type writingService struct {
	repo repositories.WritingRepository
}

// NewWritingService 创建写作服务实例
func NewWritingService(repo repositories.WritingRepository) WritingService {
	return &writingService{repo: repo}
}

func (s *writingService) Submit(ctx context.Context, submission *models.WritingSubmission, aiClient clients.AIClientInterface) error {
	// Save submission first
	if err := s.repo.Create(ctx, submission); err != nil {
		return err
	}

	// Analyze writing with AI
	req := clients.WritingAnalysisRequest{
		Content:     submission.Content,
		WritingType: submission.WritingType,
		Title:       submission.Title,
	}

	resp, err := aiClient.AnalyzeWriting(ctx, req)
	if err != nil {
		// Don't fail submission if AI analysis fails
		return nil
	}

	// Update feedback
	feedbackJSON, _ := json.Marshal(map[string]interface{}{
		"overall_score": resp.OverallScore,
		"strengths":     resp.Strengths,
		"improvements":  resp.Improvements,
		"summary":       resp.Summary,
	})

	dimensionJSON, _ := json.Marshal(resp.Dimensions)

	return s.repo.UpdateFeedback(ctx, submission.ID, string(feedbackJSON), string(dimensionJSON))
}

func (s *writingService) GetSubmissions(ctx context.Context, courseID uint, studentID *uint) ([]*models.WritingSubmission, error) {
	return s.repo.FindByCourseID(ctx, courseID, studentID)
}

func (s *writingService) GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error) {
	return s.repo.GetStats(ctx, courseID)
}

func (s *writingService) GetSubmission(ctx context.Context, id uint) (*models.WritingSubmission, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *writingService) UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	return s.repo.UpdateFeedback(ctx, id, feedbackJSON, dimensionJSON)
}
