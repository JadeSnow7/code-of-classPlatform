package services

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
)

// AuthService 认证服务接口
type AuthService interface {
	Login(ctx context.Context, username, password string) (*models.User, string, error)
	GetUserByID(ctx context.Context, userID uint) (*models.User, error)
}

// UserService 用户服务接口
type UserService interface {
	GetStats(ctx context.Context, userID uint) (map[string]interface{}, error)
}

// AdminService 管理员服务接口
type AdminService interface {
	GetSystemStats(ctx context.Context) (map[string]interface{}, error)
	ListUsers(ctx context.Context, roleFilter string) ([]*models.User, error)
	CreateUser(ctx context.Context, user *models.User, password string) error
	UpdateUser(ctx context.Context, id uint, updates map[string]interface{}) error
	DeleteUser(ctx context.Context, id uint) error
}

// AnnouncementService 公告服务接口
type AnnouncementService interface {
	GetSummary(ctx context.Context, courseID, userID uint) (map[string]interface{}, error)
	List(ctx context.Context, courseID uint) ([]*models.Announcement, error)
	Create(ctx context.Context, announcement *models.Announcement) error
	Update(ctx context.Context, id uint, updates map[string]interface{}) error
	Delete(ctx context.Context, id uint) error
	MarkRead(ctx context.Context, announcementID, userID uint) error
}

// AttendanceService 考勤服务接口
type AttendanceService interface {
	GetSummary(ctx context.Context, courseID, userID uint) (map[string]interface{}, error)
	ListSessions(ctx context.Context, courseID uint) ([]*models.AttendanceSession, error)
	StartSession(ctx context.Context, session *models.AttendanceSession) error
	EndSession(ctx context.Context, sessionID uint) error
	Checkin(ctx context.Context, sessionID, studentID uint, location string) error
	GetRecords(ctx context.Context, sessionID uint) ([]*models.AttendanceRecord, error)
}

// ResourceService 资源服务接口
type ResourceService interface {
	List(ctx context.Context, courseID uint) ([]*models.Resource, error)
	Create(ctx context.Context, resource *models.Resource) error
	Delete(ctx context.Context, id uint) error
}

// UploadService 文件上传服务接口
type UploadService interface {
	UploadAssignmentFile(ctx context.Context, assignmentID uint, filename string, reader interface{}, size int64, contentType string) (string, error)
	UploadResourceFile(ctx context.Context, courseID uint, filename string, reader interface{}, size int64, contentType string) (string, error)
}

// WritingService 写作服务接口
type WritingService interface {
	Submit(ctx context.Context, submission *models.WritingSubmission, aiClient clients.AIClientInterface) error
	GetSubmissions(ctx context.Context, courseID uint, studentID *uint) ([]*models.WritingSubmission, error)
	GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error)
	GetSubmission(ctx context.Context, id uint) (*models.WritingSubmission, error)
	UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error
}

// LearningProfileService 学习档案服务接口
type LearningProfileService interface {
	GetProfile(ctx context.Context, courseID, studentID uint) (*models.StudentLearningProfile, error)
	SaveProfile(ctx context.Context, profile *models.StudentLearningProfile) error
	ListCourseProfiles(ctx context.Context, courseID uint) ([]*models.StudentLearningProfile, error)
}

// GlobalProfileService 全局档案服务接口
type GlobalProfileService interface {
	GetGlobalProfile(ctx context.Context, studentID uint) (*models.StudentGlobalProfile, error)
	SaveGlobalProfile(ctx context.Context, profile *models.StudentGlobalProfile) error
	GetLearningTimeline(ctx context.Context, studentID uint, limit int) ([]*models.LearningEvent, error)
	RecordLearningEvent(ctx context.Context, event *models.LearningEvent) error
}
