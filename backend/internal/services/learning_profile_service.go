package services

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type learningProfileService struct {
	repo repositories.LearningProfileRepository
}

// NewLearningProfileService 创建学习档案服务实例
func NewLearningProfileService(repo repositories.LearningProfileRepository) LearningProfileService {
	return &learningProfileService{repo: repo}
}

func (s *learningProfileService) GetProfile(ctx context.Context, courseID, studentID uint) (*models.StudentLearningProfile, error) {
	return s.repo.FindByCourseAndStudent(ctx, courseID, studentID)
}

func (s *learningProfileService) SaveProfile(ctx context.Context, profile *models.StudentLearningProfile) error {
	return s.repo.Save(ctx, profile)
}

func (s *learningProfileService) ListCourseProfiles(ctx context.Context, courseID uint) ([]*models.StudentLearningProfile, error) {
	return s.repo.ListByCourse(ctx, courseID)
}
