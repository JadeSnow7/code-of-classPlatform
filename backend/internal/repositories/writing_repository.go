package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type writingRepository struct {
	db *gorm.DB
}

// NewWritingRepository 创建写作仓库实例
func NewWritingRepository(db *gorm.DB) WritingRepository {
	return &writingRepository{db: db}
}

func (r *writingRepository) FindByCourseID(ctx context.Context, courseID uint, studentID *uint) ([]*models.WritingSubmission, error) {
	var submissions []*models.WritingSubmission
	query := r.db.WithContext(ctx).Where("course_id = ?", courseID)
	if studentID != nil {
		query = query.Where("student_id = ?", *studentID)
	}
	if err := query.Order("created_at DESC").Find(&submissions).Error; err != nil {
		return nil, err
	}
	return submissions, nil
}

func (r *writingRepository) FindByID(ctx context.Context, id uint) (*models.WritingSubmission, error) {
	var submission models.WritingSubmission
	if err := r.db.WithContext(ctx).First(&submission, id).Error; err != nil {
		return nil, err
	}
	return &submission, nil
}

func (r *writingRepository) Create(ctx context.Context, submission *models.WritingSubmission) error {
	return r.db.WithContext(ctx).Create(submission).Error
}

func (r *writingRepository) UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	return r.db.WithContext(ctx).Model(&models.WritingSubmission{}).Where("id = ?", id).Updates(map[string]interface{}{
		"feedback_json":    feedbackJSON,
		"dimension_scores": dimensionJSON,
	}).Error
}

func (r *writingRepository) GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error) {
	var totalSubmissions int64
	var avgScore float64

	// Count total submissions
	if err := r.db.WithContext(ctx).Model(&models.WritingSubmission{}).Where("course_id = ?", courseID).Count(&totalSubmissions).Error; err != nil {
		return nil, err
	}

	// Calculate average score
	if err := r.db.WithContext(ctx).Model(&models.WritingSubmission{}).
		Where("course_id = ? AND overall_score IS NOT NULL", courseID).
		Select("AVG(overall_score)").
		Row().Scan(&avgScore); err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	return map[string]interface{}{
		"total_submissions": totalSubmissions,
		"average_score":     avgScore,
	}, nil
}
