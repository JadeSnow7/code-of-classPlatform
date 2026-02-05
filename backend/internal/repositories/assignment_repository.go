package repositories

import (
	"context"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type AssignmentRepository struct {
	db *gorm.DB
}

func NewAssignmentRepository(db *gorm.DB) *AssignmentRepository {
	return &AssignmentRepository{db: db}
}

func (r *AssignmentRepository) FindCourse(ctx context.Context, courseID uint) (*models.Course, error) {
	var course models.Course
	if err := r.db.WithContext(ctx).First(&course, courseID).Error; err != nil {
		return nil, err
	}
	return &course, nil
}

func (r *AssignmentRepository) FindAssignment(ctx context.Context, assignmentID uint) (*models.Assignment, error) {
	var assignment models.Assignment
	if err := r.db.WithContext(ctx).First(&assignment, assignmentID).Error; err != nil {
		return nil, err
	}
	return &assignment, nil
}

func (r *AssignmentRepository) CreateAssignment(ctx context.Context, assignment *models.Assignment) error {
	return r.db.WithContext(ctx).Create(assignment).Error
}

func (r *AssignmentRepository) ListByCourse(ctx context.Context, courseID uint) ([]models.Assignment, error) {
	var assignments []models.Assignment
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC").Find(&assignments).Error; err != nil {
		return nil, err
	}
	return assignments, nil
}

func (r *AssignmentRepository) FindSubmission(ctx context.Context, assignmentID uint, studentID uint) (*models.Submission, error) {
	var submission models.Submission
	if err := r.db.WithContext(ctx).Where("assignment_id = ? AND student_id = ?", assignmentID, studentID).First(&submission).Error; err != nil {
		return nil, err
	}
	return &submission, nil
}

func (r *AssignmentRepository) FindSubmissionByID(ctx context.Context, submissionID uint) (*models.Submission, error) {
	var submission models.Submission
	if err := r.db.WithContext(ctx).First(&submission, submissionID).Error; err != nil {
		return nil, err
	}
	return &submission, nil
}

func (r *AssignmentRepository) SaveSubmission(ctx context.Context, submission *models.Submission) error {
	return r.db.WithContext(ctx).Save(submission).Error
}

func (r *AssignmentRepository) CreateSubmission(ctx context.Context, submission *models.Submission) error {
	return r.db.WithContext(ctx).Create(submission).Error
}

func (r *AssignmentRepository) ListSubmissionsByAssignment(ctx context.Context, assignmentID uint) ([]models.Submission, error) {
	var submissions []models.Submission
	if err := r.db.WithContext(ctx).Where("assignment_id = ?", assignmentID).Order("created_at DESC").Find(&submissions).Error; err != nil {
		return nil, err
	}
	return submissions, nil
}

func (r *AssignmentRepository) CountAssignmentsByCourse(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.Assignment{}).Where("course_id = ?", courseID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AssignmentRepository) CountSubmissionsByCourseAndStudent(ctx context.Context, courseID uint, studentID uint) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("submissions").
		Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
		Where("assignments.course_id = ? AND submissions.student_id = ?", courseID, studentID).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AssignmentRepository) CountPendingGradingByCourse(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("submissions").
		Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
		Where("assignments.course_id = ? AND submissions.grade IS NULL", courseID).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AssignmentRepository) AvgGradeByCourseAndStudent(ctx context.Context, courseID uint, studentID uint) (float64, error) {
	var avg float64
	err := r.db.WithContext(ctx).
		Table("submissions").
		Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
		Where("assignments.course_id = ? AND submissions.student_id = ? AND submissions.grade IS NOT NULL", courseID, studentID).
		Select("AVG(submissions.grade)").
		Row().
		Scan(&avg)
	if err != nil {
		return 0, err
	}
	return avg, nil
}

func (r *AssignmentRepository) AvgGradeByCourse(ctx context.Context, courseID uint) (float64, error) {
	var avg float64
	err := r.db.WithContext(ctx).
		Table("submissions").
		Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
		Where("assignments.course_id = ? AND submissions.grade IS NOT NULL", courseID).
		Select("AVG(submissions.grade)").
		Row().
		Scan(&avg)
	if err != nil {
		return 0, err
	}
	return avg, nil
}

func (r *AssignmentRepository) CountStudentsByCourse(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&models.CourseEnrollment{}).
		Where("course_id = ? AND role = 'student'", courseID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AssignmentRepository) HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error) {
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
