package services

import (
	"context"
	"testing"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
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
func (f *fakeAdminUserRepo) CreateActivationToken(context.Context, *models.ActivationToken) error {
	return nil
}
func (f *fakeAdminUserRepo) FindActivationTokenByHash(context.Context, string) (*models.ActivationToken, error) {
	return nil, nil
}
func (f *fakeAdminUserRepo) MarkActivationTokenUsed(context.Context, uint, int64) error {
	return nil
}
func (f *fakeAdminUserRepo) ConsumeActivationTokenByHash(context.Context, string, int64) (bool, error) {
	return false, nil
}
func (f *fakeAdminUserRepo) RevokeActivationTokensByUser(context.Context, uint, int64) error {
	return nil
}
func (f *fakeAdminUserRepo) CreateRefreshSession(context.Context, *models.RefreshSession) error {
	return nil
}
func (f *fakeAdminUserRepo) FindRefreshSessionByHash(context.Context, string) (*models.RefreshSession, error) {
	return nil, nil
}
func (f *fakeAdminUserRepo) RevokeRefreshSessionByHash(context.Context, string, int64) error {
	return nil
}
func (f *fakeAdminUserRepo) ConsumeRefreshSessionByHash(context.Context, string, int64) (bool, error) {
	return false, nil
}
func (f *fakeAdminUserRepo) RevokeRefreshSessionsByUser(context.Context, uint, int64) error {
	return nil
}
func (f *fakeAdminUserRepo) TouchRefreshSession(context.Context, uint, int64) error {
	return nil
}

type fakeAuthService struct{}

func (f *fakeAuthService) Login(context.Context, string, string, AuthSessionMeta) (AuthSessionBundle, error) {
	return AuthSessionBundle{}, nil
}
func (f *fakeAuthService) IssueSession(context.Context, *models.User, AuthSessionMeta) (AuthSessionBundle, error) {
	return AuthSessionBundle{}, nil
}
func (f *fakeAuthService) GetUserByID(context.Context, uint) (*models.User, error) {
	return nil, nil
}
func (f *fakeAuthService) GetInvitePreview(context.Context, string) (InvitePreview, error) {
	return InvitePreview{}, nil
}
func (f *fakeAuthService) ActivateRegistration(context.Context, string, string, string, AuthSessionMeta) (AuthSessionBundle, error) {
	return AuthSessionBundle{}, nil
}
func (f *fakeAuthService) Refresh(context.Context, string, AuthSessionMeta) (AuthSessionBundle, error) {
	return AuthSessionBundle{}, nil
}
func (f *fakeAuthService) Logout(context.Context, string) error {
	return nil
}
func (f *fakeAuthService) LogoutAll(context.Context, uint) error {
	return nil
}
func (f *fakeAuthService) CreateActivationInvite(_ context.Context, _ *models.User, _ uint, ttl time.Duration) (ActivationInvite, error) {
	return ActivationInvite{Token: "invite-token", ExpiresAt: time.Now().Add(ttl).Unix()}, nil
}
func (f *fakeAuthService) BuildInviteURL(token string) string {
	return "http://localhost:5173/register/activate?token=" + token
}
func (f *fakeAuthService) AccessTokenTTL() time.Duration {
	return 15 * time.Minute
}
func (f *fakeAuthService) RefreshTokenTTL() time.Duration {
	return 14 * 24 * time.Hour
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
		&fakeAuthService{},
		config.Config{ActivationTokenTTL: 72 * time.Hour, AuthBcryptCost: 10},
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
	svc := NewAdminService(userRepo, &fakeCountCourseRepo{}, &fakeCountAssignmentRepo{}, &fakeCountQuizRepo{}, &fakeCountResourceRepo{}, &fakeAuthService{}, config.Config{ActivationTokenTTL: 72 * time.Hour, AuthBcryptCost: 10})

	_, err := svc.CreateUser(context.Background(), &models.User{Username: "alice"}, "password123", AdminCreateUserOptions{SendInvite: false})
	assert.ErrorIs(t, err, ErrUsernameExists)
}

func TestAdminService_UpdateUser_Success(t *testing.T) {
	userRepo := &fakeAdminUserRepo{
		usersByID: map[uint]*models.User{
			1: {Username: "alice", Role: "student", Name: "Alice", PasswordHash: "x"},
		},
	}
	userRepo.usersByID[1].ID = 1

	svc := NewAdminService(userRepo, &fakeCountCourseRepo{}, &fakeCountAssignmentRepo{}, &fakeCountQuizRepo{}, &fakeCountResourceRepo{}, &fakeAuthService{}, config.Config{ActivationTokenTTL: 72 * time.Hour, AuthBcryptCost: 10})
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
