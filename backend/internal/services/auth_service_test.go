package services

import (
	"context"
	"testing"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	apperrors "github.com/huaodong/llm-teaching-platform/backend/pkg/errors"
	"github.com/stretchr/testify/assert"
)

type fakeAuthUserRepo struct {
	findByUsernameResult      *models.User
	findByUsernameErr         error
	findRefreshSessionResult  *models.RefreshSession
	findRefreshSessionErr     error
	findActivationTokenResult *models.ActivationToken
	findActivationTokenErr    error
	consumeRefreshOK          bool
	consumeRefreshErr         error
	consumeActivationOK       bool
	consumeActivationErr      error
	updateCount               int
	createRefreshSessionCount int
	revokeActivationCount     int
	lastCreatedRefreshSession *models.RefreshSession
	lastUpdatedUser           *models.User
}

func (f *fakeAuthUserRepo) FindByID(context.Context, uint) (*models.User, error) { return nil, nil }
func (f *fakeAuthUserRepo) FindByIDs(context.Context, []uint) ([]*models.User, error) {
	return nil, nil
}
func (f *fakeAuthUserRepo) FindByUsername(context.Context, string) (*models.User, error) {
	return f.findByUsernameResult, f.findByUsernameErr
}
func (f *fakeAuthUserRepo) ExistsByUsername(context.Context, string) (bool, error)  { return false, nil }
func (f *fakeAuthUserRepo) FindAll(context.Context, string) ([]*models.User, error) { return nil, nil }
func (f *fakeAuthUserRepo) Create(context.Context, *models.User) error              { return nil }
func (f *fakeAuthUserRepo) Update(_ context.Context, user *models.User) error {
	f.updateCount++
	copy := *user
	f.lastUpdatedUser = &copy
	return nil
}
func (f *fakeAuthUserRepo) Delete(context.Context, uint) error                 { return nil }
func (f *fakeAuthUserRepo) Count(context.Context) (int64, error)               { return 0, nil }
func (f *fakeAuthUserRepo) CountByRole(context.Context, string) (int64, error) { return 0, nil }
func (f *fakeAuthUserRepo) CreateActivationToken(context.Context, *models.ActivationToken) error {
	return nil
}
func (f *fakeAuthUserRepo) FindActivationTokenByHash(context.Context, string) (*models.ActivationToken, error) {
	return f.findActivationTokenResult, f.findActivationTokenErr
}
func (f *fakeAuthUserRepo) MarkActivationTokenUsed(context.Context, uint, int64) error { return nil }
func (f *fakeAuthUserRepo) ConsumeActivationTokenByHash(context.Context, string, int64) (bool, error) {
	return f.consumeActivationOK, f.consumeActivationErr
}
func (f *fakeAuthUserRepo) RevokeActivationTokensByUser(context.Context, uint, int64) error {
	f.revokeActivationCount++
	return nil
}
func (f *fakeAuthUserRepo) CreateRefreshSession(_ context.Context, session *models.RefreshSession) error {
	f.createRefreshSessionCount++
	copy := *session
	f.lastCreatedRefreshSession = &copy
	return nil
}
func (f *fakeAuthUserRepo) FindRefreshSessionByHash(context.Context, string) (*models.RefreshSession, error) {
	return f.findRefreshSessionResult, f.findRefreshSessionErr
}
func (f *fakeAuthUserRepo) RevokeRefreshSessionByHash(context.Context, string, int64) error {
	return nil
}
func (f *fakeAuthUserRepo) ConsumeRefreshSessionByHash(context.Context, string, int64) (bool, error) {
	return f.consumeRefreshOK, f.consumeRefreshErr
}
func (f *fakeAuthUserRepo) RevokeRefreshSessionsByUser(context.Context, uint, int64) error {
	return nil
}
func (f *fakeAuthUserRepo) TouchRefreshSession(context.Context, uint, int64) error { return nil }

func newAuthServiceForTest(repo *fakeAuthUserRepo) AuthService {
	return NewAuthService(repo, config.Config{
		JWTSecret:          "test-secret",
		PublicWebBaseURL:   "http://localhost:5173",
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    14 * 24 * time.Hour,
		ActivationTokenTTL: 72 * time.Hour,
		AuthBcryptCost:     4,
	})
}

func TestAuthServiceRefresh_StopsWhenAtomicConsumeFails(t *testing.T) {
	user := models.User{
		Username: "alice",
		Role:     "teacher",
		Status:   models.UserStatusActive,
	}
	user.ID = 7
	repo := &fakeAuthUserRepo{
		findRefreshSessionResult: &models.RefreshSession{
			UserID:    user.ID,
			TokenHash: auth.HashOpaqueToken("refresh-token"),
			ExpiresAt: time.Now().Add(time.Hour).Unix(),
			User:      user,
		},
		consumeRefreshOK: false,
	}

	svc := newAuthServiceForTest(repo)
	session, err := svc.Refresh(context.Background(), "refresh-token", AuthSessionMeta{ClientType: "web"})

	assert.Equal(t, AuthSessionBundle{}, session)
	var appErr *apperrors.AppError
	assert.ErrorAs(t, err, &appErr)
	assert.Equal(t, "UNAUTHORIZED", appErr.Code)
	assert.Equal(t, 0, repo.updateCount)
	assert.Equal(t, 0, repo.createRefreshSessionCount)
}

func TestAuthServiceActivateRegistration_StopsWhenAtomicConsumeFails(t *testing.T) {
	user := models.User{
		Username:     "alice",
		PasswordHash: "old-hash",
		Role:         "teacher",
		Status:       models.UserStatusPendingActivation,
	}
	user.ID = 9
	repo := &fakeAuthUserRepo{
		findActivationTokenResult: &models.ActivationToken{
			UserID:       user.ID,
			TokenHash:    auth.HashOpaqueToken("invite-token"),
			ExpiresAt:    time.Now().Add(time.Hour).Unix(),
			RoleSnapshot: user.Role,
			User:         user,
		},
		consumeActivationOK: false,
	}

	svc := newAuthServiceForTest(repo)
	session, err := svc.ActivateRegistration(context.Background(), "invite-token", "newpass123", "newpass123", AuthSessionMeta{ClientType: "web"})

	assert.Equal(t, AuthSessionBundle{}, session)
	var appErr *apperrors.AppError
	assert.ErrorAs(t, err, &appErr)
	assert.Equal(t, "INVALID_INPUT", appErr.Code)
	assert.Equal(t, 0, repo.updateCount)
	assert.Equal(t, 0, repo.revokeActivationCount)
	assert.Equal(t, 0, repo.createRefreshSessionCount)
}
