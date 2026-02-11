package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type learningProfileRepository struct {
	db *gorm.DB
}

// NewLearningProfileRepository 创建学习档案仓库实例
func NewLearningProfileRepository(db *gorm.DB) LearningProfileRepository {
	return &learningProfileRepository{db: db}
}

func (r *learningProfileRepository) FindByCourseAndStudent(ctx context.Context, courseID, studentID uint) (*models.StudentLearningProfile, error) {
	var profile models.StudentLearningProfile
	if err := r.db.WithContext(ctx).Where("course_id = ? AND student_id = ?", courseID, studentID).First(&profile).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *learningProfileRepository) Save(ctx context.Context, profile *models.StudentLearningProfile) error {
	// Use GORM's Save which will insert or update based on primary key
	return r.db.WithContext(ctx).Save(profile).Error
}

func (r *learningProfileRepository) ListByCourse(ctx context.Context, courseID uint) ([]*models.StudentLearningProfile, error) {
	var profiles []*models.StudentLearningProfile
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Find(&profiles).Error; err != nil {
		return nil, err
	}
	return profiles, nil
}
