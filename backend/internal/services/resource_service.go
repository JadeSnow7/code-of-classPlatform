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

func (s *resourceService) CreateWithPermission(ctx context.Context, resource *models.Resource, userID uint, userRole string) error {
	course, err := s.repo.FindCourseByID(ctx, resource.CourseID)
	if err != nil {
		return err
	}
	if course.TeacherID != userID && userRole != "admin" {
		return ErrAccessDeniedService
	}
	return s.repo.Create(ctx, resource)
}

func (s *resourceService) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}

func (s *resourceService) DeleteWithPermission(ctx context.Context, id uint, userID uint, userRole string) error {
	resource, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if resource.CreatedByID != userID && userRole != "admin" {
		return ErrAccessDeniedService
	}
	return s.repo.Delete(ctx, id)
}
