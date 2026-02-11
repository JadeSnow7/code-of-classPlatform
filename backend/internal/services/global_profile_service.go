package services

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type globalProfileService struct {
	repo repositories.GlobalProfileRepository
}

// NewGlobalProfileService 创建全局档案服务实例
func NewGlobalProfileService(repo repositories.GlobalProfileRepository) GlobalProfileService {
	return &globalProfileService{repo: repo}
}

func (s *globalProfileService) GetGlobalProfile(ctx context.Context, studentID uint) (*models.StudentGlobalProfile, error) {
	return s.repo.FindByStudentID(ctx, studentID)
}

func (s *globalProfileService) SaveGlobalProfile(ctx context.Context, profile *models.StudentGlobalProfile) error {
	return s.repo.Save(ctx, profile)
}

func (s *globalProfileService) GetLearningTimeline(ctx context.Context, studentID uint, limit int) ([]*models.LearningEvent, error) {
	return s.repo.GetTimeline(ctx, studentID, limit)
}

func (s *globalProfileService) GetLearningTimelinePage(ctx context.Context, studentID uint, page, pageSize int, courseID *uint) ([]*models.LearningEvent, int64, error) {
	return s.repo.GetTimelinePage(ctx, studentID, page, pageSize, courseID)
}

func (s *globalProfileService) RecordLearningEvent(ctx context.Context, event *models.LearningEvent) error {
	return s.repo.RecordEvent(ctx, event)
}
