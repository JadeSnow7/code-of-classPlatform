package services

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

	// Generate JWT token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(), // 7 days
	})

	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return nil, "", err
	}

	return user, tokenString, nil
}

func (s *authService) GetUserByID(ctx context.Context, userID uint) (*models.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}
