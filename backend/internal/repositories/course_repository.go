package repositories

import (
	"context"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type CourseRepository struct {
	db *gorm.DB
}

func NewCourseRepository(db *gorm.DB) *CourseRepository {
	return &CourseRepository{db: db}
}

func (r *CourseRepository) FindByID(ctx context.Context, id uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, id).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *CourseRepository) FindAll(ctx context.Context) ([]models.Course, error) {
	var courses []models.Course
	if err := r.db.WithContext(ctx).Order("id desc").Find(&courses).Error; err != nil {
		return nil, err
	}
	return courses, nil
}

func (r *CourseRepository) FindByTeacherID(ctx context.Context, teacherID uint) ([]models.Course, error) {
	var courses []models.Course
	if err := r.db.WithContext(ctx).
		Where("teacher_id = ?", teacherID).
		Order("id desc").
		Find(&courses).Error; err != nil {
		return nil, err
	}
	return courses, nil
}

func (r *CourseRepository) FindByStudentID(ctx context.Context, studentID uint) ([]models.Course, error) {
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

func (r *CourseRepository) Create(ctx context.Context, course *models.Course) error {
	return r.db.WithContext(ctx).Create(course).Error
}

func (r *CourseRepository) Update(ctx context.Context, course *models.Course, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(course).Updates(updates).Error
}

func (r *CourseRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Course{}, id).Error
}

func (r *CourseRepository) HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error) {
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
