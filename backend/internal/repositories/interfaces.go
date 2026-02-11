package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
)

// UserRepository 用户数据访问接口
type UserRepository interface {
	FindByID(ctx context.Context, id uint) (*models.User, error)
	FindByUsername(ctx context.Context, username string) (*models.User, error)
	FindAll(ctx context.Context, roleFilter string) ([]*models.User, error)
	Create(ctx context.Context, user *models.User) error
	Update(ctx context.Context, user *models.User) error
	Delete(ctx context.Context, id uint) error
	Count(ctx context.Context) (int64, error)
	CountByRole(ctx context.Context, role string) (int64, error)
}

// AnnouncementRepository 公告数据访问接口
type AnnouncementRepository interface {
	FindByCourseID(ctx context.Context, courseID uint) ([]*models.Announcement, error)
	FindByID(ctx context.Context, id uint) (*models.Announcement, error)
	Create(ctx context.Context, announcement *models.Announcement) error
	Update(ctx context.Context, announcement *models.Announcement) error
	Delete(ctx context.Context, id uint) error
	MarkRead(ctx context.Context, announcementID, userID uint) error
	GetUnreadCount(ctx context.Context, courseID, userID uint) (int64, error)
}

// AttendanceRepository 考勤数据访问接口
type AttendanceRepository interface {
	FindSessionsByCourseID(ctx context.Context, courseID uint) ([]*models.AttendanceSession, error)
	FindSessionByID(ctx context.Context, id uint) (*models.AttendanceSession, error)
	CreateSession(ctx context.Context, session *models.AttendanceSession) error
	UpdateSession(ctx context.Context, session *models.AttendanceSession) error
	FindActiveSessionByCode(ctx context.Context, code string) (*models.AttendanceSession, error)
	Checkin(ctx context.Context, record *models.AttendanceRecord) error
	GetRecords(ctx context.Context, sessionID uint) ([]*models.AttendanceRecord, error)
	GetAttendanceRate(ctx context.Context, courseID, studentID uint) (float64, error)
}

// ResourceRepository 资源数据访问接口
type ResourceRepository interface {
	FindByCourseID(ctx context.Context, courseID uint) ([]*models.Resource, error)
	FindByID(ctx context.Context, id uint) (*models.Resource, error)
	Create(ctx context.Context, resource *models.Resource) error
	Delete(ctx context.Context, id uint) error
}

// WritingRepository 写作提交数据访问接口
type WritingRepository interface {
	FindByCourseID(ctx context.Context, courseID uint, studentID *uint) ([]*models.WritingSubmission, error)
	FindByID(ctx context.Context, id uint) (*models.WritingSubmission, error)
	Create(ctx context.Context, submission *models.WritingSubmission) error
	UpdateFeedback(ctx context.Context, id uint, feedbackJSON, dimensionJSON string) error
	GetStats(ctx context.Context, courseID uint) (map[string]interface{}, error)
}

// LearningProfileRepository 学习档案数据访问接口
type LearningProfileRepository interface {
	FindByCourseAndStudent(ctx context.Context, courseID, studentID uint) (*models.StudentLearningProfile, error)
	Save(ctx context.Context, profile *models.StudentLearningProfile) error
	ListByCourse(ctx context.Context, courseID uint) ([]*models.StudentLearningProfile, error)
}

// GlobalProfileRepository 全局学习档案数据访问接口
type GlobalProfileRepository interface {
	FindByStudentID(ctx context.Context, studentID uint) (*models.StudentGlobalProfile, error)
	Save(ctx context.Context, profile *models.StudentGlobalProfile) error
	RecordEvent(ctx context.Context, event *models.LearningEvent) error
	GetTimeline(ctx context.Context, studentID uint, limit int) ([]*models.LearningEvent, error)
}
