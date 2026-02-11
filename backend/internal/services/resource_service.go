package services

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type resourceService struct {
	repo repositories.ResourceRepository
}

// NewResourceService 创建资源服务实例
func NewResourceService(repo repositories.ResourceRepository) ResourceService {
	return &resourceService{repo: repo}
}

func (s *resourceService) List(ctx context.Context, courseID uint) ([]*models.Resource, error) {
	return s.repo.FindByCourseID(ctx, courseID)
}

func (s *resourceService) Create(ctx context.Context, resource *models.Resource) error {
	return s.repo.Create(ctx, resource)
}

func (s *resourceService) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}
