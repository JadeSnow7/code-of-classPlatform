package services

import (
	"context"

	"gorm.io/gorm"
)

type userService struct {
	db *gorm.DB
}

// NewUserService 创建用户服务实例
func NewUserService(db *gorm.DB) UserService {
	return &userService{db: db}
}

func (s *userService) GetStats(ctx context.Context, userID uint) (map[string]interface{}, error) {
	// This implementation mirrors the existing handler logic
	// Count enrolled courses
	var courseCount int64
	if err := s.db.WithContext(ctx).Model(&struct {
		ID uint `gorm:"primaryKey"`
	}{}).
		Table("course_enrollments").
		Where("user_id = ?", userID).
		Count(&courseCount).Error; err != nil {
		return nil, err
	}

	// Count submitted assignments
	var submissionCount int64
	if err := s.db.WithContext(ctx).Model(&struct {
		ID uint `gorm:"primaryKey"`
	}{}).
		Table("submissions").
		Where("student_id = ?", userID).
		Count(&submissionCount).Error; err != nil {
		return nil, err
	}

	// Count completed quizzes
	var quizCount int64
	if err := s.db.WithContext(ctx).Model(&struct {
		ID uint `gorm:"primaryKey"`
	}{}).
		Table("quiz_attempts").
		Where("student_id = ? AND submitted_at IS NOT NULL", userID).
		Count(&quizCount).Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"enrolled_courses":      courseCount,
		"submitted_assignments": submissionCount,
		"completed_quizzes":     quizCount,
	}, nil
}
