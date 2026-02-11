package services

import (
	"context"
	"errors"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"golang.org/x/crypto/bcrypt"
)

type adminService struct {
	userRepo repositories.UserRepository
}

// NewAdminService 创建管理员服务实例
func NewAdminService(userRepo repositories.UserRepository) AdminService {
	return &adminService{userRepo: userRepo}
}

func (s *adminService) GetSystemStats(ctx context.Context) (map[string]interface{}, error) {
	totalUsers, err := s.userRepo.Count(ctx)
	if err != nil {
		return nil, err
	}

	teacherCount, err := s.userRepo.CountByRole(ctx, "teacher")
	if err != nil {
		return nil, err
	}

	studentCount, err := s.userRepo.CountByRole(ctx, "student")
	if err != nil {
		return nil, err
	}

	adminCount, err := s.userRepo.CountByRole(ctx, "admin")
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"total_users":   totalUsers,
		"teacher_count": teacherCount,
		"student_count": studentCount,
		"admin_count":   adminCount,
	}, nil
}

func (s *adminService) ListUsers(ctx context.Context, roleFilter string) ([]*models.User, error) {
	return s.userRepo.FindAll(ctx, roleFilter)
}

func (s *adminService) CreateUser(ctx context.Context, user *models.User, password string) error {
	if user.Username == "" || password == "" {
		return errors.New("username and password are required")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user.PasswordHash = string(hashedPassword)

	return s.userRepo.Create(ctx, user)
}

func (s *adminService) UpdateUser(ctx context.Context, id uint, updates map[string]interface{}) error {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	// Apply updates
	if name, ok := updates["name"].(string); ok {
		user.Name = name
	}
	if role, ok := updates["role"].(string); ok {
		user.Role = role
	}

	return s.userRepo.Update(ctx, user)
}

func (s *adminService) DeleteUser(ctx context.Context, id uint) error {
	return s.userRepo.Delete(ctx, id)
}
