package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type courseRepository struct {
	db *gorm.DB
}

func NewCourseRepository(db *gorm.DB) *CourseRepository {
	return &courseRepository{db: db}
}

func (r *courseRepository) FindByID(ctx context.Context, id uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, id).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *courseRepository) FindAll(ctx context.Context) ([]models.Course, error) {
	var courses []models.Course
	if err := r.db.WithContext(ctx).Order("id desc").Find(&courses).Error; err != nil {
		return nil, err
	}
	return courses, nil
}

func (r *courseRepository) FindByTeacherID(ctx context.Context, teacherID uint) ([]models.Course, error) {
	var courses []models.Course
	if err := r.db.WithContext(ctx).
		Where("teacher_id = ?", teacherID).
		Order("id desc").
		Find(&courses).Error; err != nil {
		return nil, err
	}
	return courses, nil
}

func (r *courseRepository) FindByStudentID(ctx context.Context, studentID uint) ([]models.Course, error) {
	var courses []models.Course
	if err := r.db.WithContext(ctx).
		Joins("JOIN course_enrollments ON course_enrollments.course_id = courses.id").
		Where("course_enrollments.user_id = ? AND course_enrollments.deleted_at IS NULL", studentID).
		Order("courses.id desc").
		Find(&courses).Error; err != nil {
		return nil, err
	}
	return courses, nil
}

func (r *courseRepository) Create(ctx context.Context, course *models.Course) error {
	return r.db.WithContext(ctx).Create(course).Error
}

func (r *courseRepository) Update(ctx context.Context, course *models.Course, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(course).Updates(updates).Error
}

func (r *courseRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Course{}, id).Error
}

func (r *courseRepository) HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error) {
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
