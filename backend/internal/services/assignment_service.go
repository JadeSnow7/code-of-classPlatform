package services

import (
	"context"
	"errors"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

var (
	// ErrAssignmentNotFound indicates the assignment does not exist.
	ErrAssignmentNotFound = errors.New("assignment not found")
	// ErrSubmissionNotFound indicates the submission does not exist.
	ErrSubmissionNotFound = errors.New("submission not found")
)

// AssignmentService handles assignment CRUD and grading workflows.
type AssignmentService struct {
	repo *repositories.AssignmentRepository
}

// NewAssignmentService builds an AssignmentService with its repository.
func NewAssignmentService(db *gorm.DB) *AssignmentService {
	return &AssignmentService{repo: repositories.NewAssignmentRepository(db)}
}

// CreateAssignmentRequest contains the fields required to create an assignment.
type CreateAssignmentRequest struct {
	CourseID    uint
	Title       string
	Description string
	AllowFile   bool
}

// SubmitAssignmentRequest contains the student submission payload.
type SubmitAssignmentRequest struct {
	Content string
	FileURL string
}

// CourseAssignmentStats summarizes assignment progress for a course.
type CourseAssignmentStats struct {
	TotalAssignments int     `json:"total_assignments"`
	PendingCount     int     `json:"pending_count"`
	SubmittedCount   int     `json:"submitted_count"`
	AverageGrade     float64 `json:"average_grade"`
}

// AssignmentDetailedStats summarizes grading progress for a single assignment.
type AssignmentDetailedStats struct {
	TotalStudents  int     `json:"total_students"`
	SubmittedCount int     `json:"submitted_count"`
	GradedCount    int     `json:"graded_count"`
	AverageGrade   float64 `json:"average_grade"`
	HighestGrade   int     `json:"highest_grade"`
	LowestGrade    int     `json:"lowest_grade"`
}

// AssignmentGradingContext bundles the submission, assignment, and course.
type AssignmentGradingContext struct {
	Submission models.Submission
	Assignment models.Assignment
	Course     models.Course
}

// CreateAssignment creates a new assignment in the specified course.
func (s *AssignmentService) CreateAssignment(ctx context.Context, user UserInfo, req CreateAssignmentRequest) (*models.Assignment, error) {
	course, err := s.repo.FindCourse(ctx, req.CourseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCourseNotFound
		}
		return nil, err
	}
	if course.TeacherID != user.ID && user.Role != "admin" {
		return nil, ErrAccessDenied
	}
	assignment := &models.Assignment{
		CourseID:    req.CourseID,
		TeacherID:   user.ID,
		Title:       req.Title,
		Description: req.Description,
		AllowFile:   req.AllowFile,
	}
	if err := s.repo.CreateAssignment(ctx, assignment); err != nil {
		return nil, err
	}
	return assignment, nil
}

// ListAssignments returns assignments for a course.
func (s *AssignmentService) ListAssignments(ctx context.Context, courseID uint) ([]models.Assignment, error) {
	return s.repo.ListByCourse(ctx, courseID)
}

// GetAssignment fetches a single assignment by ID.
func (s *AssignmentService) GetAssignment(ctx context.Context, assignmentID uint) (*models.Assignment, error) {
	assignment, err := s.repo.FindAssignment(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, err
	}
	return assignment, nil
}

// SubmitAssignment creates or updates a student's submission.
func (s *AssignmentService) SubmitAssignment(ctx context.Context, assignmentID uint, user UserInfo, req SubmitAssignmentRequest) (*models.Submission, bool, error) {
	if _, err := s.repo.FindAssignment(ctx, assignmentID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, ErrAssignmentNotFound
		}
		return nil, false, err
	}
	existing, err := s.repo.FindSubmission(ctx, assignmentID, user.ID)
	if err == nil {
		existing.Content = req.Content
		existing.FileURL = req.FileURL
		if err := s.repo.SaveSubmission(ctx, existing); err != nil {
			return nil, false, err
		}
		return existing, false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, err
	}
	submission := &models.Submission{
		AssignmentID: assignmentID,
		StudentID:    user.ID,
		Content:      req.Content,
		FileURL:      req.FileURL,
	}
	if err := s.repo.CreateSubmission(ctx, submission); err != nil {
		return nil, false, err
	}
	return submission, true, nil
}

// GetMySubmission fetches the current user's submission for the assignment.
func (s *AssignmentService) GetMySubmission(ctx context.Context, assignmentID uint, user UserInfo) (*models.Submission, bool, error) {
	submission, err := s.repo.FindSubmission(ctx, assignmentID, user.ID)
	if err == nil {
		return submission, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	return nil, false, err
}

// ListSubmissions lists all submissions for an assignment.
func (s *AssignmentService) ListSubmissions(ctx context.Context, assignmentID uint) ([]models.Submission, error) {
	return s.repo.ListSubmissionsByAssignment(ctx, assignmentID)
}

// GetSubmissionForGrading loads submission details for grading.
func (s *AssignmentService) GetSubmissionForGrading(ctx context.Context, submissionID uint, user UserInfo) (*AssignmentGradingContext, error) {
	submission, err := s.repo.FindSubmissionByID(ctx, submissionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSubmissionNotFound
		}
		return nil, err
	}
	assignment, err := s.repo.FindAssignment(ctx, submission.AssignmentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, err
	}
	course, err := s.repo.FindCourse(ctx, assignment.CourseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCourseNotFound
		}
		return nil, err
	}
	if course.TeacherID != user.ID && user.Role != "admin" && user.Role != "assistant" {
		return nil, ErrAccessDenied
	}
	return &AssignmentGradingContext{
		Submission: *submission,
		Assignment: *assignment,
		Course:     *course,
	}, nil
}

// GradeSubmission sets the grade and feedback on a submission.
func (s *AssignmentService) GradeSubmission(ctx context.Context, submissionID uint, user UserInfo, grade int, feedback string) (*models.Submission, error) {
	ctxData, err := s.GetSubmissionForGrading(ctx, submissionID, user)
	if err != nil {
		return nil, err
	}
	ctxData.Submission.Grade = &grade
	ctxData.Submission.Feedback = feedback
	ctxData.Submission.GradedBy = &user.ID
	if err := s.repo.SaveSubmission(ctx, &ctxData.Submission); err != nil {
		return nil, err
	}
	return &ctxData.Submission, nil
}

// GetCourseAssignmentStats returns aggregated stats for a course.
func (s *AssignmentService) GetCourseAssignmentStats(ctx context.Context, courseID uint, user UserInfo) (CourseAssignmentStats, error) {
	var stats CourseAssignmentStats

	totalAssignments, err := s.repo.CountAssignmentsByCourse(ctx, courseID)
	if err != nil {
		return stats, err
	}
	stats.TotalAssignments = int(totalAssignments)

	if user.Role == "student" {
		submittedCount, err := s.repo.CountSubmissionsByCourseAndStudent(ctx, courseID, user.ID)
		if err != nil {
			return stats, err
		}
		stats.SubmittedCount = int(submittedCount)
		stats.PendingCount = int(totalAssignments) - int(submittedCount)

		avgGrade, err := s.repo.AvgGradeByCourseAndStudent(ctx, courseID, user.ID)
		if err == nil {
			stats.AverageGrade = avgGrade
		}
	} else {
		pendingCount, err := s.repo.CountPendingGradingByCourse(ctx, courseID)
		if err == nil {
			stats.PendingCount = int(pendingCount)
		}

		avgGrade, err := s.repo.AvgGradeByCourse(ctx, courseID)
		if err == nil {
			stats.AverageGrade = avgGrade
		}
	}

	return stats, nil
}

// GetAssignmentStats returns grading stats for a specific assignment.
func (s *AssignmentService) GetAssignmentStats(ctx context.Context, assignmentID uint, user UserInfo) (AssignmentDetailedStats, error) {
	var stats AssignmentDetailedStats

	assignment, err := s.repo.FindAssignment(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return stats, ErrAssignmentNotFound
		}
		return stats, err
	}

	if user.Role != "admin" {
		enrolled, err := s.repo.HasEnrollment(ctx, assignment.CourseID, user.ID)
		if err != nil {
			return stats, err
		}
		if !enrolled {
			return stats, ErrAccessDenied
		}
	}

	totalStudents, err := s.repo.CountStudentsByCourse(ctx, assignment.CourseID)
	if err != nil {
		return stats, err
	}
	stats.TotalStudents = int(totalStudents)

	submissions, err := s.repo.ListSubmissionsByAssignment(ctx, assignmentID)
	if err != nil {
		return stats, err
	}

	stats.SubmittedCount = len(submissions)

	totalGrade := 0
	gradedCount := 0
	maxGrade := 0
	minGrade := 100

	for _, s := range submissions {
		if s.Grade == nil {
			continue
		}
		g := *s.Grade
		totalGrade += g
		gradedCount++
		if g > maxGrade {
			maxGrade = g
		}
		if g < minGrade {
			minGrade = g
		}
	}

	stats.GradedCount = gradedCount
	if gradedCount > 0 {
		stats.AverageGrade = float64(totalGrade) / float64(gradedCount)
		stats.HighestGrade = maxGrade
		stats.LowestGrade = minGrade
	}

	return stats, nil
}
