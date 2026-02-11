package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type chapterRepository struct {
	db *gorm.DB
}

func NewChapterRepository(db *gorm.DB) *ChapterRepository {
	return &chapterRepository{db: db}
}

func (r *chapterRepository) FindCourse(ctx context.Context, courseID uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, courseID).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *chapterRepository) FindChapter(ctx context.Context, chapterID uint) (*models.Chapter, error) {
	var chapter models.Chapter
	if err := r.db.WithContext(ctx).First(&chapter, chapterID).Error; err != nil {
		return nil, err
	}
	return &chapter, nil
}

func (r *chapterRepository) ListByCourse(ctx context.Context, courseID uint) ([]models.Chapter, error) {
	var chapters []models.Chapter
	if err := r.db.WithContext(ctx).
		Where("course_id = ?", courseID).
		Order("order_num ASC, id ASC").
		Find(&chapters).Error; err != nil {
		return nil, err
	}
	return chapters, nil
}

func (r *chapterRepository) Create(ctx context.Context, chapter *models.Chapter) error {
	return r.db.WithContext(ctx).Create(chapter).Error
}

func (r *chapterRepository) Update(ctx context.Context, chapter *models.Chapter, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(chapter).Updates(updates).Error
}

func (r *chapterRepository) Delete(ctx context.Context, chapterID uint) error {
	return r.db.WithContext(ctx).Delete(&models.Chapter{}, chapterID).Error
}

func (r *chapterRepository) HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error) {
	var enrollment models.CourseEnrollment
	err := r.db.WithContext(ctx).
		Where("course_id = ? AND user_id = ?", courseID, userID).
		First(&enrollment).Error
	if err == nil {
		return true, nil
	}
	if err == gorm.ErrRecordNotFound {
		return false, nil
	}
	return false, err
}

func (r *chapterRepository) ClearChapterReferences(ctx context.Context, chapterID uint) error {
	if err := r.db.WithContext(ctx).Model(&models.Resource{}).Where("chapter_id = ?", chapterID).Update("chapter_id", nil).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Model(&models.Assignment{}).Where("chapter_id = ?", chapterID).Update("chapter_id", nil).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Model(&models.Quiz{}).Where("chapter_id = ?", chapterID).Update("chapter_id", nil).Error; err != nil {
		return err
	}
	return nil
}

func (r *chapterRepository) DeleteProgressByChapter(ctx context.Context, chapterID uint) error {
	return r.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Delete(&models.ChapterProgress{}).Error
}
