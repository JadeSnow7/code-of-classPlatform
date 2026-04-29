package services

import (
	"context"
	"strings"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	apperrors "github.com/huaodong/llm-teaching-platform/backend/pkg/errors"
	"gorm.io/gorm"
)

type authService struct {
	userRepo           repositories.UserRepository
	jwtSecret          string
	publicWebBaseURL   string
	accessTokenTTL     time.Duration
	refreshTokenTTL    time.Duration
	activationTokenTTL time.Duration
	authBcryptCost     int
}

// NewAuthService 创建认证服务实例
func NewAuthService(userRepo repositories.UserRepository, cfg config.Config) AuthService {
	return &authService{
		userRepo:           userRepo,
		jwtSecret:          cfg.JWTSecret,
		publicWebBaseURL:   cfg.PublicWebBaseURL,
		accessTokenTTL:     cfg.AccessTokenTTL,
		refreshTokenTTL:    cfg.RefreshTokenTTL,
		activationTokenTTL: cfg.ActivationTokenTTL,
		authBcryptCost:     cfg.AuthBcryptCost,
	}
}

func (s *authService) AccessTokenTTL() time.Duration {
	return s.accessTokenTTL
}

func (s *authService) RefreshTokenTTL() time.Duration {
	return s.refreshTokenTTL
}

func (s *authService) BuildInviteURL(token string) string {
	return s.publicWebBaseURL + "/register/activate?token=" + token
}

func (s *authService) Login(ctx context.Context, username, password string, meta AuthSessionMeta) (AuthSessionBundle, error) {
	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		return AuthSessionBundle{}, apperrors.Unauthorized("Invalid username or password")
	}

	if user.Status == models.UserStatusPendingActivation {
		return AuthSessionBundle{}, apperrors.Forbidden("complete invitation activation before login")
	}
	if user.Status == models.UserStatusDisabled {
		return AuthSessionBundle{}, apperrors.Forbidden("account is disabled")
	}
	if !auth.VerifyPassword(user.PasswordHash, password) {
		return AuthSessionBundle{}, apperrors.Unauthorized("Invalid username or password")
	}

	return s.IssueSession(ctx, user, meta)
}

func (s *authService) IssueSession(ctx context.Context, user *models.User, meta AuthSessionMeta) (AuthSessionBundle, error) {
	if user == nil {
		return AuthSessionBundle{}, apperrors.BadRequest("user is required")
	}
	accessToken, err := auth.SignToken(s.jwtSecret, user.ID, user.Username, user.Role, s.accessTokenTTL)
	if err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	refreshToken, err := auth.GenerateOpaqueToken()
	if err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}

	now := time.Now()
	expiresAt := now.Add(s.refreshTokenTTL).Unix()
	lastLoginAt := now
	user.LastLoginAt = &lastLoginAt
	if user.Status == "" {
		user.Status = models.UserStatusActive
	}
	if err := s.userRepo.Update(ctx, user); err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	if err := s.userRepo.CreateRefreshSession(ctx, &models.RefreshSession{
		UserID:      user.ID,
		TokenHash:   auth.HashOpaqueToken(refreshToken),
		ExpiresAt:   expiresAt,
		LastUsedAt:  ptrInt64(now.Unix()),
		ClientType:  normalizeClientType(meta.ClientType),
		DeviceLabel: meta.DeviceLabel,
		IP:          meta.IP,
		UserAgent:   meta.UserAgent,
	}); err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}

	return AuthSessionBundle{
		User:             user,
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		TokenType:        "Bearer",
		ExpiresIn:        int64(s.accessTokenTTL.Seconds()),
		RefreshExpiresIn: int64(s.refreshTokenTTL.Seconds()),
	}, nil
}

func (s *authService) GetUserByID(ctx context.Context, userID uint) (*models.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

func (s *authService) CreateActivationInvite(ctx context.Context, user *models.User, invitedBy uint, ttl time.Duration) (ActivationInvite, error) {
	if user == nil {
		return ActivationInvite{}, apperrors.BadRequest("user is required")
	}
	if ttl <= 0 {
		ttl = s.activationTokenTTL
	}
	rawToken, err := auth.GenerateOpaqueToken()
	if err != nil {
		return ActivationInvite{}, apperrors.Internal(err)
	}
	expiresAt := time.Now().Add(ttl).Unix()
	if err := s.userRepo.CreateActivationToken(ctx, &models.ActivationToken{
		UserID:       user.ID,
		TokenHash:    auth.HashOpaqueToken(rawToken),
		ExpiresAt:    expiresAt,
		InvitedBy:    invitedBy,
		RoleSnapshot: user.Role,
	}); err != nil {
		return ActivationInvite{}, apperrors.Internal(err)
	}
	return ActivationInvite{
		Token:     rawToken,
		ExpiresAt: expiresAt,
	}, nil
}

func (s *authService) GetInvitePreview(ctx context.Context, token string) (InvitePreview, error) {
	tokenHash := auth.HashOpaqueToken(token)
	record, err := s.userRepo.FindActivationTokenByHash(ctx, tokenHash)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return InvitePreview{}, apperrors.NotFound("invite")
		}
		return InvitePreview{}, apperrors.Internal(err)
	}
	now := time.Now().Unix()
	return InvitePreview{
		Username:  record.User.Username,
		Name:      record.User.Name,
		Role:      record.RoleSnapshot,
		Status:    record.User.Status,
		Expired:   record.ExpiresAt < now,
		Used:      record.UsedAt != nil,
		ExpiresAt: record.ExpiresAt,
	}, nil
}

func (s *authService) ActivateRegistration(ctx context.Context, input ActivateRegistrationInput, meta AuthSessionMeta) (AuthSessionBundle, error) {
	password := input.Password
	confirmPassword := input.ConfirmPassword
	realName := strings.TrimSpace(input.RealName)
	studentID := strings.ToUpper(strings.TrimSpace(input.StudentID))
	if input.Token == "" {
		return AuthSessionBundle{}, apperrors.BadRequest("invite token is required")
	}
	if realName == "" {
		return AuthSessionBundle{}, apperrors.BadRequest("real name is required")
	}
	if studentID == "" {
		return AuthSessionBundle{}, apperrors.BadRequest("student id is required")
	}
	if password != confirmPassword {
		return AuthSessionBundle{}, apperrors.BadRequest("password confirmation does not match")
	}
	if !auth.ValidatePasswordPolicy(password) {
		return AuthSessionBundle{}, apperrors.BadRequest("password must be at least 8 characters and include letters and numbers")
	}

	tokenHash := auth.HashOpaqueToken(input.Token)
	record, err := s.userRepo.FindActivationTokenByHash(ctx, tokenHash)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return AuthSessionBundle{}, apperrors.NotFound("invite")
		}
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	now := time.Now()
	nowUnix := now.Unix()
	if record.ExpiresAt < nowUnix {
		return AuthSessionBundle{}, apperrors.BadRequest("invite has expired")
	}
	user := &record.User
	if user.ID == 0 {
		return AuthSessionBundle{}, apperrors.NotFound("user")
	}
	if studentID != user.Username {
		exists, err := s.userRepo.ExistsByUsername(ctx, studentID)
		if err != nil {
			return AuthSessionBundle{}, apperrors.Internal(err)
		}
		if exists {
			return AuthSessionBundle{}, apperrors.BadRequest("student id is already in use")
		}
	}
	consumed, err := s.userRepo.ConsumeActivationTokenByHash(ctx, tokenHash, nowUnix)
	if err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	if !consumed {
		return AuthSessionBundle{}, apperrors.BadRequest("invite is invalid or has already been used")
	}
	passwordHash, err := auth.HashPasswordWithCost(password, s.authBcryptCost)
	if err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	user.Username = studentID
	user.Name = realName
	user.PasswordHash = passwordHash
	user.Status = models.UserStatusActive
	if err := s.userRepo.Update(ctx, user); err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	if err := s.userRepo.RevokeActivationTokensByUser(ctx, user.ID, nowUnix); err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	return s.IssueSession(ctx, user, meta)
}

func (s *authService) Refresh(ctx context.Context, refreshToken string, meta AuthSessionMeta) (AuthSessionBundle, error) {
	if refreshToken == "" {
		return AuthSessionBundle{}, apperrors.Unauthorized("refresh token is required")
	}
	tokenHash := auth.HashOpaqueToken(refreshToken)
	session, err := s.userRepo.FindRefreshSessionByHash(ctx, tokenHash)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return AuthSessionBundle{}, apperrors.Unauthorized("refresh session is invalid")
		}
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	now := time.Now()
	nowUnix := now.Unix()
	if session.ExpiresAt < nowUnix {
		return AuthSessionBundle{}, apperrors.Unauthorized("refresh session expired")
	}
	user := &session.User
	if user.Status != models.UserStatusActive {
		return AuthSessionBundle{}, apperrors.Forbidden("account is not active")
	}
	consumed, err := s.userRepo.ConsumeRefreshSessionByHash(ctx, tokenHash, nowUnix)
	if err != nil {
		return AuthSessionBundle{}, apperrors.Internal(err)
	}
	if !consumed {
		return AuthSessionBundle{}, apperrors.Unauthorized("refresh session is invalid or already used")
	}
	return s.IssueSession(ctx, user, meta)
}

func (s *authService) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return apperrors.BadRequest("refresh token is required")
	}
	if err := s.userRepo.RevokeRefreshSessionByHash(ctx, auth.HashOpaqueToken(refreshToken), time.Now().Unix()); err != nil {
		return apperrors.Internal(err)
	}
	return nil
}

func (s *authService) LogoutAll(ctx context.Context, userID uint) error {
	if err := s.userRepo.RevokeRefreshSessionsByUser(ctx, userID, time.Now().Unix()); err != nil {
		return apperrors.Internal(err)
	}
	return nil
}

func normalizeClientType(clientType string) string {
	switch clientType {
	case "mobile", "web", "wecom", "feishu":
		return clientType
	default:
		return "web"
	}
}

func ptrInt64(v int64) *int64 {
	return &v
}
