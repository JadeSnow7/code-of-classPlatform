package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type globalProfileRepository struct {
	db *gorm.DB
}

// NewGlobalProfileRepository 创建全局学习档案仓库实例
func NewGlobalProfileRepository(db *gorm.DB) GlobalProfileRepository {
	return &globalProfileRepository{db: db}
}

func (r *globalProfileRepository) FindByStudentID(ctx context.Context, studentID uint) (*models.StudentGlobalProfile, error) {
	var profile models.StudentGlobalProfile
	if err := r.db.WithContext(ctx).Where("student_id = ?", studentID).First(&profile).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *globalProfileRepository) Save(ctx context.Context, profile *models.StudentGlobalProfile) error {
	return r.db.WithContext(ctx).Save(profile).Error
}

func (r *globalProfileRepository) RecordEvent(ctx context.Context, event *models.LearningEvent) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *globalProfileRepository) GetTimeline(ctx context.Context, studentID uint, limit int) ([]*models.LearningEvent, error) {
	var events []*models.LearningEvent
	query := r.db.WithContext(ctx).Where("student_id = ?", studentID).Order("occurred_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&events).Error; err != nil {
		return nil, err
	}
	return events, nil
}
