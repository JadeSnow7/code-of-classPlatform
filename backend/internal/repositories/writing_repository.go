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

func (r *writingRepository) UpdateSubmission(ctx context.Context, submission *models.WritingSubmission, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(submission).Updates(updates).Error
}

func (r *writingRepository) UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	return r.db.WithContext(ctx).Model(&models.WritingSubmission{}).Where("id = ?", id).Updates(map[string]interface{}{
		"feedback_json":  feedbackJSON,
		"dimension_json": dimensionJSON,
	}).Error
}

func (r *writingRepository) CreateRevision(ctx context.Context, revision *models.WritingRevision) error {
	return r.db.WithContext(ctx).Create(revision).Error
}

func (r *writingRepository) ListRevisions(ctx context.Context, submissionID uint, page, pageSize int) ([]models.WritingRevision, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	var total int64
	query := r.db.WithContext(ctx).Model(&models.WritingRevision{}).Where("submission_id = ?", submissionID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var revisions []models.WritingRevision
	if err := query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&revisions).Error; err != nil {
		return nil, 0, err
	}
	return revisions, total, nil
}

func (r *writingRepository) GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error) {
	var totalSubmissions int64

	// Count total submissions
	if err := r.db.WithContext(ctx).Model(&models.WritingSubmission{}).Where("course_id = ?", courseID).Count(&totalSubmissions).Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"total_submissions": totalSubmissions,
		"average_score":     0,
	}, nil
}

func (r *writingRepository) CreateLearningEvent(ctx context.Context, event *models.LearningEvent) error {
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *writingRepository) FindLearningProfilesByCourseID(ctx context.Context, courseID uint) ([]models.StudentLearningProfile, error) {
	var profiles []models.StudentLearningProfile
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Find(&profiles).Error; err != nil {
		return nil, err
	}
	return profiles, nil
}
