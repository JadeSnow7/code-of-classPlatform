package services

import (
	"context"
	"errors"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"golang.org/x/crypto/bcrypt"
)

type authService struct {
	userRepo  repositories.UserRepository
	jwtSecret string
}

// NewAuthService 创建认证服务实例
func NewAuthService(userRepo repositories.UserRepository, jwtSecret string) AuthService {
	return &authService{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
	}
}

func (s *authService) Login(ctx context.Context, username, password string) (*models.User, string, error) {
	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	// Generate JWT token using auth.SignToken to ensure consistent claim structure
	tokenString, err := auth.SignToken(s.jwtSecret, user.ID, user.Username, user.Role, 7*24*time.Hour)
	if err != nil {
		return nil, "", err
	}

	return user, tokenString, nil
}

func (s *authService) GetUserByID(ctx context.Context, userID uint) (*models.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}
