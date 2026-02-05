package repositories

import (
	"context"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type ChapterRepository struct {
	db *gorm.DB
}

func NewChapterRepository(db *gorm.DB) *ChapterRepository {
	return &ChapterRepository{db: db}
}

func (r *ChapterRepository) FindCourse(ctx context.Context, courseID uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, courseID).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *ChapterRepository) FindChapter(ctx context.Context, chapterID uint) (*models.Chapter, error) {
	var chapter models.Chapter
	if err := r.db.WithContext(ctx).First(&chapter, chapterID).Error; err != nil {
		return nil, err
	}
	return &chapter, nil
}

func (r *ChapterRepository) ListByCourse(ctx context.Context, courseID uint) ([]models.Chapter, error) {
	var chapters []models.Chapter
	if err := r.db.WithContext(ctx).
		Where("course_id = ?", courseID).
		Order("order_num ASC, id ASC").
		Find(&chapters).Error; err != nil {
		return nil, err
	}
	return chapters, nil
}

func (r *ChapterRepository) Create(ctx context.Context, chapter *models.Chapter) error {
	return r.db.WithContext(ctx).Create(chapter).Error
}

func (r *ChapterRepository) Update(ctx context.Context, chapter *models.Chapter, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(chapter).Updates(updates).Error
}

func (r *ChapterRepository) Delete(ctx context.Context, chapterID uint) error {
	return r.db.WithContext(ctx).Delete(&models.Chapter{}, chapterID).Error
}

func (r *ChapterRepository) HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error) {
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

func (r *ChapterRepository) ClearChapterReferences(ctx context.Context, chapterID uint) error {
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

func (r *ChapterRepository) DeleteProgressByChapter(ctx context.Context, chapterID uint) error {
	return r.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Delete(&models.ChapterProgress{}).Error
}
