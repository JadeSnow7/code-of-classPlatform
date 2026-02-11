package services

import (
	"context"
	"errors"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// ErrUsernameExists indicates the username already exists.
	ErrUsernameExists = errors.New("username already exists")
)

type adminService struct {
	userRepo       repositories.UserRepository
	courseRepo     repositories.CourseRepository
	assignmentRepo repositories.AssignmentRepository
	quizRepo       repositories.QuizRepository
	resourceRepo   repositories.ResourceRepository
}

// NewAdminService 创建管理员服务实例
func NewAdminService(
	userRepo repositories.UserRepository,
	courseRepo repositories.CourseRepository,
	assignmentRepo repositories.AssignmentRepository,
	quizRepo repositories.QuizRepository,
	resourceRepo repositories.ResourceRepository,
) AdminService {
	return &adminService{
		userRepo:       userRepo,
		courseRepo:     courseRepo,
		assignmentRepo: assignmentRepo,
		quizRepo:       quizRepo,
		resourceRepo:   resourceRepo,
	}
}

func (s *adminService) GetSystemStats(ctx context.Context) (AdminSystemStats, error) {
	stats := AdminSystemStats{
		UsersByRole: make(map[string]int64),
	}

	var err error
	if stats.TotalUsers, err = s.userRepo.Count(ctx); err != nil {
		return stats, err
	}
	if stats.TotalCourses, err = s.courseRepo.Count(ctx); err != nil {
		return stats, err
	}
	if stats.TotalAssignments, err = s.assignmentRepo.Count(ctx); err != nil {
		return stats, err
	}
	if stats.TotalSubmissions, err = s.assignmentRepo.CountSubmissions(ctx); err != nil {
		return stats, err
	}
	if stats.TotalQuizzes, err = s.quizRepo.Count(ctx); err != nil {
		return stats, err
	}
	if stats.TotalResources, err = s.resourceRepo.Count(ctx); err != nil {
		return stats, err
	}

	roles := []string{"admin", "teacher", "assistant", "student"}
	for _, role := range roles {
		count, countErr := s.userRepo.CountByRole(ctx, role)
		if countErr != nil {
			return stats, countErr
		}
		stats.UsersByRole[role] = count
	}

	return stats, nil
}

func (s *adminService) ListUsers(ctx context.Context, roleFilter string) ([]*models.User, error) {
	return s.userRepo.FindAll(ctx, roleFilter)
}

func (s *adminService) CreateUser(ctx context.Context, user *models.User, password string) error {
	if user.Username == "" || password == "" {
		return errors.New("username and password are required")
	}

	exists, err := s.userRepo.ExistsByUsername(ctx, user.Username)
	if err != nil {
		return err
	}
	if exists {
		return ErrUsernameExists
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user.PasswordHash = string(hashedPassword)

	return s.userRepo.Create(ctx, user)
}

func (s *adminService) UpdateUser(ctx context.Context, id uint, updates map[string]interface{}) (*models.User, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if passwordHash, ok := updates["password_hash"].(string); ok {
		user.PasswordHash = passwordHash
	}
	if name, ok := updates["name"].(string); ok {
		user.Name = name
	}
	if role, ok := updates["role"].(string); ok {
		user.Role = role
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	updated, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *adminService) DeleteUser(ctx context.Context, id uint) error {
	if _, err := s.userRepo.FindByID(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return err
	}
	return s.userRepo.Delete(ctx, id)
}
