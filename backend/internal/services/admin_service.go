package services

import (
	"context"
	"errors"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

var (
	// ErrUsernameExists indicates the username already exists.
	ErrUsernameExists = errors.New("username already exists")
)

type adminService struct {
	userRepo           repositories.UserRepository
	courseRepo         repositories.CourseRepository
	assignmentRepo     repositories.AssignmentRepository
	quizRepo           repositories.QuizRepository
	resourceRepo       repositories.ResourceRepository
	authService        AuthService
	activationTokenTTL time.Duration
	authBcryptCost     int
}

// NewAdminService 创建管理员服务实例
func NewAdminService(
	userRepo repositories.UserRepository,
	courseRepo repositories.CourseRepository,
	assignmentRepo repositories.AssignmentRepository,
	quizRepo repositories.QuizRepository,
	resourceRepo repositories.ResourceRepository,
	authService AuthService,
	cfg config.Config,
) AdminService {
	return &adminService{
		userRepo:           userRepo,
		courseRepo:         courseRepo,
		assignmentRepo:     assignmentRepo,
		quizRepo:           quizRepo,
		resourceRepo:       resourceRepo,
		authService:        authService,
		activationTokenTTL: cfg.ActivationTokenTTL,
		authBcryptCost:     cfg.AuthBcryptCost,
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

func (s *adminService) CreateUser(ctx context.Context, user *models.User, password string, opts AdminCreateUserOptions) (AdminCreateUserResult, error) {
	if user.Username == "" {
		return AdminCreateUserResult{}, errors.New("username is required")
	}

	exists, err := s.userRepo.ExistsByUsername(ctx, user.Username)
	if err != nil {
		return AdminCreateUserResult{}, err
	}
	if exists {
		return AdminCreateUserResult{}, ErrUsernameExists
	}

	sendInvite := opts.SendInvite
	if user.Status == "" {
		if sendInvite {
			user.Status = models.UserStatusPendingActivation
		} else {
			user.Status = models.UserStatusActive
		}
	}

	if sendInvite {
		randomPassword, tokenErr := auth.GenerateOpaqueToken()
		if tokenErr != nil {
			return AdminCreateUserResult{}, tokenErr
		}
		passwordHash, hashErr := auth.HashPasswordWithCost(randomPassword, s.authBcryptCost)
		if hashErr != nil {
			return AdminCreateUserResult{}, hashErr
		}
		user.PasswordHash = passwordHash
	} else {
		if !auth.ValidatePasswordPolicy(password) {
			return AdminCreateUserResult{}, errors.New("password must be at least 8 characters and include letters and numbers")
		}
		hashedPassword, hashErr := auth.HashPasswordWithCost(password, s.authBcryptCost)
		if hashErr != nil {
			return AdminCreateUserResult{}, hashErr
		}
		user.PasswordHash = string(hashedPassword)
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return AdminCreateUserResult{}, err
	}

	result := AdminCreateUserResult{User: user}
	if sendInvite {
		ttl := s.activationTokenTTL
		if opts.ActivationTTLHours > 0 {
			ttl = time.Duration(opts.ActivationTTLHours) * time.Hour
		}
		invite, inviteErr := s.authService.CreateActivationInvite(ctx, user, opts.InvitedBy, ttl)
		if inviteErr != nil {
			return AdminCreateUserResult{}, inviteErr
		}
		result.Invite = &invite
		result.InviteURL = s.authService.BuildInviteURL(invite.Token)
	}
	return result, nil
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
	if status, ok := updates["status"].(string); ok {
		user.Status = status
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
