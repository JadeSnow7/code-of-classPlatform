package services

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/repositories"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var (
	// ErrCourseNotFoundService indicates the course is missing.
	ErrCourseNotFoundService = errors.New("course not found")
	// ErrAccessDeniedService indicates the user is not authorized for the action.
	ErrAccessDeniedService   = errors.New("access denied")
)

// UserInfo represents user context for authorization decisions.
type UserInfo struct {
	ID   uint
	Role string
}

// CourseService handles course management and module configuration.
type CourseService struct {
	repo *repositories.CourseRepository
	db   *gorm.DB
}

// NewCourseService builds a CourseService with its repository.
func NewCourseService(db *gorm.DB) *CourseService {
	return &CourseService{
		repo: repositories.NewCourseRepository(db),
		db:   db,
	}
}

// CreateCourseRequest contains the fields required to create a course.
type CreateCourseRequest struct {
	Name           string
	Code           string
	Semester       string
	EnabledModules []string
	ModuleSettings map[string]interface{}
}

// UpdateModulesRequest updates course modules and module settings.
type UpdateModulesRequest struct {
	EnabledModules []string
	ModuleSettings map[string]interface{}
}

// ListCourses returns courses visible to the given user.
func (s *CourseService) ListCourses(ctx context.Context, user UserInfo) ([]models.Course, error) {
	switch user.Role {
	case "admin":
		return s.repo.FindAll(ctx)
	case "teacher":
		return s.repo.FindByTeacherID(ctx, user.ID)
	default:
		return s.repo.FindByStudentID(ctx, user.ID)
	}
}

// GetCourse fetches a course by ID after access checks.
func (s *CourseService) GetCourse(ctx context.Context, courseID uint, user UserInfo) (*models.Course, error) {
	course, err := s.repo.FindByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCourseNotFoundService
		}
		return nil, err
	}

	if !s.hasCourseAccess(ctx, course, user) {
		return nil, ErrAccessDeniedService
	}

	return course, nil
}

// CreateCourse creates a course for the requesting user.
func (s *CourseService) CreateCourse(ctx context.Context, user UserInfo, req CreateCourseRequest) (*models.Course, error) {
	if user.Role != "admin" && user.Role != "teacher" {
		return nil, ErrAccessDeniedService
	}

	modules := normalizeModules(req.EnabledModules)
	if len(modules) == 0 {
		modules = []string{"core.ai", "core.analytics"}
	}
	modulesJSON, err := json.Marshal(modules)
	if err != nil {
		return nil, err
	}

	settings := req.ModuleSettings
	if settings == nil {
		settings = map[string]interface{}{}
	}
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return nil, err
	}

	course := &models.Course{
		Name:           req.Name,
		Code:           req.Code,
		Semester:       req.Semester,
		TeacherID:      user.ID,
		EnabledModules: datatypes.JSON(modulesJSON),
		ModuleSettings: datatypes.JSON(settingsJSON),
	}

	if err := s.repo.Create(ctx, course); err != nil {
		return nil, err
	}

	return course, nil
}

// GetModules returns the enabled modules and settings for a course.
func (s *CourseService) GetModules(ctx context.Context, courseID uint, user UserInfo) ([]string, map[string]interface{}, error) {
	course, err := s.repo.FindByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrCourseNotFoundService
		}
		return nil, nil, err
	}

	if !s.hasCourseAccess(ctx, course, user) {
		return nil, nil, ErrAccessDeniedService
	}

	modules, err := parseEnabledModules(course.EnabledModules)
	if err != nil {
		return nil, nil, err
	}

	settings, err := parseModuleSettings(course.ModuleSettings)
	if err != nil {
		return nil, nil, err
	}

	return modules, settings, nil
}

// UpdateModules updates the enabled modules and module settings for a course.
func (s *CourseService) UpdateModules(ctx context.Context, courseID uint, user UserInfo, req UpdateModulesRequest) ([]string, map[string]interface{}, error) {
	course, err := s.repo.FindByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrCourseNotFoundService
		}
		return nil, nil, err
	}

	if !s.canManageCourse(course, user) {
		return nil, nil, ErrAccessDeniedService
	}

	modules := normalizeModules(req.EnabledModules)
	modulesJSON, err := json.Marshal(modules)
	if err != nil {
		return nil, nil, err
	}

	settings := req.ModuleSettings
	if settings == nil {
		settings = map[string]interface{}{}
	}
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return nil, nil, err
	}

	updates := map[string]interface{}{
		"enabled_modules": datatypes.JSON(modulesJSON),
		"module_settings": datatypes.JSON(settingsJSON),
	}

	if err := s.repo.Update(ctx, course, updates); err != nil {
		return nil, nil, err
	}

	return modules, settings, nil
}

func (s *CourseService) hasCourseAccess(ctx context.Context, course *models.Course, user UserInfo) bool {
	if user.Role == "admin" {
		return true
	}
	if user.Role == "teacher" && course.TeacherID == user.ID {
		return true
	}
	enrolled, _ := s.repo.HasEnrollment(ctx, course.ID, user.ID)
	return enrolled
}

func (s *CourseService) canManageCourse(course *models.Course, user UserInfo) bool {
	if user.Role == "admin" {
		return true
	}
	return user.Role == "teacher" && course.TeacherID == user.ID
}

// Helper functions - extracted from handlers for reuse

func normalizeModules(modules []string) []string {
	if modules == nil {
		return []string{}
	}
	return modules
}

func parseEnabledModules(data datatypes.JSON) ([]string, error) {
	if len(data) == 0 {
		return []string{}, nil
	}
	var modules []string
	if err := json.Unmarshal(data, &modules); err != nil {
		return nil, err
	}
	return modules, nil
}

func parseModuleSettings(data datatypes.JSON) (map[string]interface{}, error) {
	if len(data) == 0 {
		return map[string]interface{}{}, nil
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}
	return settings, nil
}
