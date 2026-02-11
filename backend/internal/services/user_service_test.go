package services

import (
	"context"
	"testing"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type fakeUserSvcUserRepo struct {
	repositories.UserRepository
	users map[uint]*models.User
}

func (f *fakeUserSvcUserRepo) FindByID(_ context.Context, id uint) (*models.User, error) {
	if f.users == nil || f.users[id] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.users[id], nil
}

type fakeUserSvcCourseRepo struct {
	repositories.CourseRepository
	total             int64
	teacherCourses    []models.Course
	allCourses        []models.Course
	findByTeacherUsed bool
	findAllUsed       bool
}

func (f *fakeUserSvcCourseRepo) Count(context.Context) (int64, error) { return f.total, nil }

func (f *fakeUserSvcCourseRepo) FindByTeacherID(context.Context, uint) ([]models.Course, error) {
	f.findByTeacherUsed = true
	return f.teacherCourses, nil
}

func (f *fakeUserSvcCourseRepo) FindAll(context.Context) ([]models.Course, error) {
	f.findAllUsed = true
	return f.allCourses, nil
}

type fakeUserSvcAssignmentRepo struct {
	repositories.AssignmentRepository
	total                  int64
	submittedIDs           []uint
	upcoming               []models.Assignment
	recentByStudent        []models.Submission
	recentByCourseIDs      []models.Submission
	assignmentsByID        map[uint]*models.Assignment
	countByCourse          map[uint]int64
	pendingGradingByCourse map[uint]int64
}

func (f *fakeUserSvcAssignmentRepo) Count(context.Context) (int64, error) { return f.total, nil }

func (f *fakeUserSvcAssignmentRepo) FindSubmittedAssignmentIDsByStudent(context.Context, uint) ([]uint, error) {
	return f.submittedIDs, nil
}

func (f *fakeUserSvcAssignmentRepo) FindUpcoming(context.Context, time.Time) ([]models.Assignment, error) {
	return f.upcoming, nil
}

func (f *fakeUserSvcAssignmentRepo) FindRecentSubmissionsByStudent(context.Context, uint, int) ([]models.Submission, error) {
	return f.recentByStudent, nil
}

func (f *fakeUserSvcAssignmentRepo) FindRecentSubmissionsByCourseIDs(context.Context, []uint, int) ([]models.Submission, error) {
	return f.recentByCourseIDs, nil
}

func (f *fakeUserSvcAssignmentRepo) FindAssignment(_ context.Context, assignmentID uint) (*models.Assignment, error) {
	if f.assignmentsByID == nil || f.assignmentsByID[assignmentID] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.assignmentsByID[assignmentID], nil
}

func (f *fakeUserSvcAssignmentRepo) CountAssignmentsByCourse(_ context.Context, courseID uint) (int64, error) {
	return f.countByCourse[courseID], nil
}

func (f *fakeUserSvcAssignmentRepo) CountPendingGradingByCourse(_ context.Context, courseID uint) (int64, error) {
	return f.pendingGradingByCourse[courseID], nil
}

type fakeUserSvcQuizRepo struct {
	repositories.QuizRepository
	attempts                    []models.QuizAttempt
	publishedActive             []models.Quiz
	quizByID                    map[uint]*models.Quiz
	submittedAttemptsByQuizUser map[[2]uint]int64
	quizzesByCourse             map[uint][]models.Quiz
}

func (f *fakeUserSvcQuizRepo) FindSubmittedAttemptsByStudent(context.Context, uint) ([]models.QuizAttempt, error) {
	return f.attempts, nil
}

func (f *fakeUserSvcQuizRepo) FindPublishedActive(context.Context, time.Time) ([]models.Quiz, error) {
	return f.publishedActive, nil
}

func (f *fakeUserSvcQuizRepo) CountSubmittedAttemptsByQuizAndStudent(_ context.Context, quizID, studentID uint) (int64, error) {
	return f.submittedAttemptsByQuizUser[[2]uint{quizID, studentID}], nil
}

func (f *fakeUserSvcQuizRepo) FindByID(_ context.Context, quizID uint) (*models.Quiz, error) {
	if f.quizByID == nil || f.quizByID[quizID] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.quizByID[quizID], nil
}

func (f *fakeUserSvcQuizRepo) ListByCourse(_ context.Context, courseID uint, _ bool) ([]models.Quiz, error) {
	return f.quizzesByCourse[courseID], nil
}

func TestUserService_GetStudentStats_BasicAggregation(t *testing.T) {
	now := time.Now()
	grade := 80
	score := 8
	submittedAt := now.Add(-2 * time.Hour)

	courseRepo := &fakeUserSvcCourseRepo{total: 3}
	assignmentRepo := &fakeUserSvcAssignmentRepo{
		total:        5,
		submittedIDs: []uint{1, 3},
		upcoming: []models.Assignment{
			{Model: gorm.Model{ID: 2}, Title: "A2", CourseID: 11, Deadline: ptrTime(now.Add(4 * time.Hour))},
		},
		recentByStudent: []models.Submission{
			{AssignmentID: 1, StudentID: 9, Grade: &grade, Model: gorm.Model{CreatedAt: now.Add(-time.Hour)}},
		},
		assignmentsByID: map[uint]*models.Assignment{
			1: {Model: gorm.Model{ID: 1}, CourseID: 11, Title: "A1"},
		},
	}
	quizRepo := &fakeUserSvcQuizRepo{
		attempts: []models.QuizAttempt{
			{QuizID: 6, Score: &score, MaxScore: 10, SubmittedAt: &submittedAt},
		},
		publishedActive: []models.Quiz{
			{Model: gorm.Model{ID: 7}, CourseID: 11, Title: "Q2", MaxAttempts: 1, EndTime: ptrTime(now.Add(5 * time.Hour))},
		},
		submittedAttemptsByQuizUser: map[[2]uint]int64{
			{7, 9}: 0,
		},
		quizByID: map[uint]*models.Quiz{
			6: {Model: gorm.Model{ID: 6}, CourseID: 11, Title: "Q1"},
		},
	}
	svc := NewUserService(&fakeUserSvcUserRepo{}, courseRepo, assignmentRepo, quizRepo)

	stats, err := svc.GetStudentStats(context.Background(), 9)
	assert.NoError(t, err)
	assert.Equal(t, 3, stats.CoursesCount)
	assert.Equal(t, 5, stats.AssignmentsTotal)
	assert.Equal(t, 2, stats.AssignmentsSubmitted)
	assert.Equal(t, 1, stats.QuizzesTaken)
	assert.True(t, stats.QuizzesAvgScore > 0)
	assert.True(t, stats.PendingCount >= 1)
	assert.NotEmpty(t, stats.RecentActivity)
}

func TestUserService_GetTeacherStats_UsesTeacherScope(t *testing.T) {
	courseRepo := &fakeUserSvcCourseRepo{
		teacherCourses: []models.Course{
			{Model: gorm.Model{ID: 1}},
			{Model: gorm.Model{ID: 2}},
		},
	}
	assignmentRepo := &fakeUserSvcAssignmentRepo{
		countByCourse: map[uint]int64{
			1: 2,
			2: 3,
		},
		pendingGradingByCourse: map[uint]int64{
			1: 1,
			2: 2,
		},
	}
	quizRepo := &fakeUserSvcQuizRepo{
		quizzesByCourse: map[uint][]models.Quiz{
			1: {{Model: gorm.Model{ID: 10}}, {Model: gorm.Model{ID: 11}}},
			2: {{Model: gorm.Model{ID: 12}}},
		},
	}
	svc := NewUserService(&fakeUserSvcUserRepo{}, courseRepo, assignmentRepo, quizRepo)

	stats, err := svc.GetTeacherStats(context.Background(), 99, "teacher")
	assert.NoError(t, err)
	assert.Equal(t, 2, stats.CoursesCreated)
	assert.Equal(t, 5, stats.AssignmentsCreated)
	assert.Equal(t, 3, stats.QuizzesCreated)
	assert.Equal(t, 3, stats.PendingGrades)
	assert.True(t, courseRepo.findByTeacherUsed)
	assert.False(t, courseRepo.findAllUsed)
}

func ptrTime(t time.Time) *time.Time { return &t }
