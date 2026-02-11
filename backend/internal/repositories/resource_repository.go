package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type resourceRepository struct {
	db *gorm.DB
}

// NewResourceRepository 创建资源仓库实例
func NewResourceRepository(db *gorm.DB) ResourceRepository {
	return &resourceRepository{db: db}
}

func (r *resourceRepository) FindByCourseID(ctx context.Context, courseID uint) ([]*models.Resource, error) {
	var resources []*models.Resource
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC").Find(&resources).Error; err != nil {
		return nil, err
	}
	return resources, nil
}

func (r *resourceRepository) FindByID(ctx context.Context, id uint) (*models.Resource, error) {
	var resource models.Resource
	if err := r.db.WithContext(ctx).First(&resource, id).Error; err != nil {
		return nil, err
	}
	return &resource, nil
}

func (r *resourceRepository) FindCourseByID(ctx context.Context, courseID uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, courseID).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *resourceRepository) Count(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.Resource{}).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *resourceRepository) Create(ctx context.Context, resource *models.Resource) error {
	return r.db.WithContext(ctx).Create(resource).Error
}

func (r *resourceRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Resource{}, id).Error
}
