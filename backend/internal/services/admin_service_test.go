package services

import (
	"context"
	"testing"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
)

type fakeAdminUserRepo struct {
	repositories.UserRepository
	total      int64
	byRole     map[string]int64
	exists     bool
	created    *models.User
	usersByID  map[uint]*models.User
	deletedIDs []uint
}

func (f *fakeAdminUserRepo) Count(context.Context) (int64, error) { return f.total, nil }
func (f *fakeAdminUserRepo) CountByRole(_ context.Context, role string) (int64, error) {
	return f.byRole[role], nil
}
func (f *fakeAdminUserRepo) ExistsByUsername(context.Context, string) (bool, error) {
	return f.exists, nil
}
func (f *fakeAdminUserRepo) Create(_ context.Context, user *models.User) error {
	f.created = user
	return nil
}
func (f *fakeAdminUserRepo) FindByID(_ context.Context, id uint) (*models.User, error) {
	return f.usersByID[id], nil
}
func (f *fakeAdminUserRepo) Update(_ context.Context, user *models.User) error {
	f.usersByID[user.ID] = user
	return nil
}
func (f *fakeAdminUserRepo) Delete(_ context.Context, id uint) error {
	f.deletedIDs = append(f.deletedIDs, id)
	return nil
}

type fakeCountCourseRepo struct {
	repositories.CourseRepository
	count int64
}

func (f *fakeCountCourseRepo) Count(context.Context) (int64, error) { return f.count, nil }

type fakeCountAssignmentRepo struct {
	repositories.AssignmentRepository
	count           int64
	submissionCount int64
}

func (f *fakeCountAssignmentRepo) Count(context.Context) (int64, error) { return f.count, nil }
func (f *fakeCountAssignmentRepo) CountSubmissions(context.Context) (int64, error) {
	return f.submissionCount, nil
}

type fakeCountQuizRepo struct {
	repositories.QuizRepository
	count int64
}

func (f *fakeCountQuizRepo) Count(context.Context) (int64, error) { return f.count, nil }

type fakeCountResourceRepo struct {
	repositories.ResourceRepository
	count int64
}

func (f *fakeCountResourceRepo) Count(context.Context) (int64, error) { return f.count, nil }

func TestAdminService_GetSystemStats(t *testing.T) {
	userRepo := &fakeAdminUserRepo{
		total: 10,
		byRole: map[string]int64{
			"admin":     1,
			"teacher":   2,
			"assistant": 1,
			"student":   6,
		},
	}
	svc := NewAdminService(
		userRepo,
		&fakeCountCourseRepo{count: 3},
		&fakeCountAssignmentRepo{count: 8, submissionCount: 20},
		&fakeCountQuizRepo{count: 5},
		&fakeCountResourceRepo{count: 7},
	)

	stats, err := svc.GetSystemStats(context.Background())
	assert.NoError(t, err)
	assert.Equal(t, int64(10), stats.TotalUsers)
	assert.Equal(t, int64(3), stats.TotalCourses)
	assert.Equal(t, int64(8), stats.TotalAssignments)
	assert.Equal(t, int64(20), stats.TotalSubmissions)
	assert.Equal(t, int64(5), stats.TotalQuizzes)
	assert.Equal(t, int64(7), stats.TotalResources)
	assert.Equal(t, int64(6), stats.UsersByRole["student"])
}

func TestAdminService_CreateUser_DuplicateUsername(t *testing.T) {
	userRepo := &fakeAdminUserRepo{exists: true}
	svc := NewAdminService(userRepo, &fakeCountCourseRepo{}, &fakeCountAssignmentRepo{}, &fakeCountQuizRepo{}, &fakeCountResourceRepo{})

	err := svc.CreateUser(context.Background(), &models.User{Username: "alice"}, "password123")
	assert.ErrorIs(t, err, ErrUsernameExists)
}

func TestAdminService_UpdateUser_Success(t *testing.T) {
	userRepo := &fakeAdminUserRepo{
		usersByID: map[uint]*models.User{
			1: {Username: "alice", Role: "student", Name: "Alice", PasswordHash: "x"},
		},
	}
	userRepo.usersByID[1].ID = 1

	svc := NewAdminService(userRepo, &fakeCountCourseRepo{}, &fakeCountAssignmentRepo{}, &fakeCountQuizRepo{}, &fakeCountResourceRepo{})
	updated, err := svc.UpdateUser(context.Background(), 1, map[string]interface{}{
		"name":          "Alice Updated",
		"role":          "teacher",
		"password_hash": "newhash",
	})

	assert.NoError(t, err)
	assert.Equal(t, uint(1), updated.ID)
	assert.Equal(t, "Alice Updated", updated.Name)
	assert.Equal(t, "teacher", updated.Role)
	assert.Equal(t, "newhash", updated.PasswordHash)
}
