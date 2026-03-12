package services

import (
	"context"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
)

// AuthService 认证服务接口
type AuthService interface {
	Login(ctx context.Context, username, password string, meta AuthSessionMeta) (AuthSessionBundle, error)
	IssueSession(ctx context.Context, user *models.User, meta AuthSessionMeta) (AuthSessionBundle, error)
	GetUserByID(ctx context.Context, userID uint) (*models.User, error)
	GetInvitePreview(ctx context.Context, token string) (InvitePreview, error)
	ActivateRegistration(ctx context.Context, token, password, confirmPassword string, meta AuthSessionMeta) (AuthSessionBundle, error)
	Refresh(ctx context.Context, refreshToken string, meta AuthSessionMeta) (AuthSessionBundle, error)
	Logout(ctx context.Context, refreshToken string) error
	LogoutAll(ctx context.Context, userID uint) error
	CreateActivationInvite(ctx context.Context, user *models.User, invitedBy uint, ttl time.Duration) (ActivationInvite, error)
	BuildInviteURL(token string) string
	AccessTokenTTL() time.Duration
	RefreshTokenTTL() time.Duration
}

type AuthSessionMeta struct {
	ClientType  string
	DeviceLabel string
	IP          string
	UserAgent   string
}

type AuthSessionBundle struct {
	User             *models.User `json:"user"`
	AccessToken      string       `json:"access_token"`
	RefreshToken     string       `json:"refresh_token"`
	TokenType        string       `json:"token_type"`
	ExpiresIn        int64        `json:"expires_in"`
	RefreshExpiresIn int64        `json:"refresh_expires_in"`
}

type InvitePreview struct {
	Username  string `json:"username"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	Expired   bool   `json:"expired"`
	Used      bool   `json:"used"`
	ExpiresAt int64  `json:"expires_at"`
}

type ActivationInvite struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expires_at"`
}

// Activity 用户最近活动项
type Activity struct {
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	CourseID  uint      `json:"course_id"`
	Score     *float64  `json:"score,omitempty"`
	MaxScore  *float64  `json:"max_score,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// PendingItem 用户待办任务项
type PendingItem struct {
	Type     string    `json:"type"`
	ID       uint      `json:"id"`
	Title    string    `json:"title"`
	CourseID uint      `json:"course_id"`
	Deadline time.Time `json:"deadline"`
}

// StudentStats 学生端统计数据
type StudentStats struct {
	CoursesCount         int           `json:"courses_count"`
	AssignmentsTotal     int           `json:"assignments_total"`
	AssignmentsSubmitted int           `json:"assignments_submitted"`
	QuizzesTaken         int           `json:"quizzes_taken"`
	QuizzesAvgScore      float64       `json:"quizzes_avg_score"`
	PendingCount         int           `json:"pending_count"`
	Pending              []PendingItem `json:"pending"`
	RecentActivity       []Activity    `json:"recent_activity"`
}

// TeacherStats 教师端统计数据
type TeacherStats struct {
	CoursesCreated     int        `json:"courses_created"`
	AssignmentsCreated int        `json:"assignments_created"`
	QuizzesCreated     int        `json:"quizzes_created"`
	PendingGrades      int        `json:"pending_grades"`
	RecentSubmissions  []Activity `json:"recent_submissions"`
}

// UserService 用户服务接口
type UserService interface {
	GetStats(ctx context.Context, userID uint) (map[string]interface{}, error)
	GetStudentStats(ctx context.Context, userID uint) (StudentStats, error)
	GetTeacherStats(ctx context.Context, userID uint, role string) (TeacherStats, error)
}

// AIConfigProfile response payload for user AI config.
type AIConfigProfile struct {
	DefaultMode   string  `json:"default_mode"`
	Provider      string  `json:"provider"`
	CustomBaseURL string  `json:"custom_base_url"`
	ServerURL     string  `json:"server_url"`
	APIKeyMasked  *string `json:"api_key_masked,omitempty"`
}

// UpdateAIConfigRequest patch payload for user AI config.
type UpdateAIConfigRequest struct {
	DefaultMode   *string `json:"default_mode,omitempty"`
	Provider      *string `json:"provider,omitempty"`
	CustomBaseURL *string `json:"custom_base_url,omitempty"`
	ServerURL     *string `json:"server_url,omitempty"`
	APIKey        *string `json:"api_key,omitempty"`
}

// AIConfigService manages user AI config.
type AIConfigService interface {
	GetProfile(ctx context.Context, userID uint) (AIConfigProfile, error)
	PatchProfile(ctx context.Context, userID uint, req UpdateAIConfigRequest) (AIConfigProfile, error)
}

// KnowledgeExportItem is a canonical export record for AI knowledge sync.
type KnowledgeExportItem struct {
	Kind       string         `json:"kind"`
	ID         string         `json:"id"`
	SourceID   string         `json:"source_id"`
	CourseID   string         `json:"course_id"`
	Visibility string         `json:"visibility"`
	Title      string         `json:"title"`
	Content    string         `json:"content"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	UpdatedAt  time.Time      `json:"updated_at"`
	Deleted    bool           `json:"deleted,omitempty"`
}

// KnowledgeExportBatch is the response envelope for knowledge export endpoints.
type KnowledgeExportBatch struct {
	Cursor string                `json:"cursor"`
	Items  []KnowledgeExportItem `json:"items"`
}

// KnowledgeExportService exports backend canonical content for AI sync.
type KnowledgeExportService interface {
	Bootstrap(ctx context.Context, courseID *uint) (KnowledgeExportBatch, error)
	Changes(ctx context.Context, cursor string, courseID *uint) (KnowledgeExportBatch, error)
	Document(ctx context.Context, kind string, id uint) (*KnowledgeExportItem, error)
}

// AdminSystemStats 系统统计
type AdminSystemStats struct {
	TotalUsers       int64            `json:"total_users"`
	TotalCourses     int64            `json:"total_courses"`
	TotalAssignments int64            `json:"total_assignments"`
	TotalSubmissions int64            `json:"total_submissions"`
	TotalQuizzes     int64            `json:"total_quizzes"`
	TotalResources   int64            `json:"total_resources"`
	UsersByRole      map[string]int64 `json:"users_by_role"`
}

// AdminService 管理员服务接口
type AdminService interface {
	GetSystemStats(ctx context.Context) (AdminSystemStats, error)
	ListUsers(ctx context.Context, roleFilter string) ([]*models.User, error)
	CreateUser(ctx context.Context, user *models.User, password string, opts AdminCreateUserOptions) (AdminCreateUserResult, error)
	UpdateUser(ctx context.Context, id uint, updates map[string]interface{}) (*models.User, error)
	DeleteUser(ctx context.Context, id uint) error
}

type AdminCreateUserOptions struct {
	SendInvite         bool
	ActivationTTLHours int
	InvitedBy          uint
}

type AdminCreateUserResult struct {
	User      *models.User      `json:"user"`
	Invite    *ActivationInvite `json:"invite,omitempty"`
	InviteURL string            `json:"invite_url,omitempty"`
}

// AnnouncementLatestInfo 公告摘要中的最新公告
type AnnouncementLatestInfo struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
}

// AnnouncementSummary 公告摘要
type AnnouncementSummary struct {
	UnreadCount int                     `json:"unread_count"`
	TotalCount  int                     `json:"total_count"`
	Latest      *AnnouncementLatestInfo `json:"latest"`
}

// AnnouncementListItem 公告列表项
type AnnouncementListItem struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	IsRead    bool      `json:"is_read"`
}

// AnnouncementService 公告服务接口
type AnnouncementService interface {
	GetSummary(ctx context.Context, courseID, userID uint) (AnnouncementSummary, error)
	ListWithReadStatus(ctx context.Context, courseID, userID uint) ([]AnnouncementListItem, error)
	List(ctx context.Context, courseID uint) ([]*models.Announcement, error)
	Create(ctx context.Context, announcement *models.Announcement) error
	Update(ctx context.Context, id uint, updates map[string]interface{}) error
	UpdateAndGet(ctx context.Context, id uint, updates map[string]interface{}) (*models.Announcement, error)
	Delete(ctx context.Context, id uint) error
	DeleteWithReads(ctx context.Context, id uint) error
	MarkRead(ctx context.Context, announcementID, userID uint) error
}

// ActiveSessionInfo 当前活跃考勤会话信息
type ActiveSessionInfo struct {
	ID     uint      `json:"id"`
	Code   string    `json:"code"`
	EndsAt time.Time `json:"ends_at"`
}

// AttendanceSummary 考勤摘要
type AttendanceSummary struct {
	AttendanceRate float64            `json:"attendance_rate"`
	SessionsCount  int                `json:"sessions_count"`
	LastSessionAt  *time.Time         `json:"last_session_at"`
	ActiveSession  *ActiveSessionInfo `json:"active_session"`
}

// AttendanceSessionListItem 考勤会话列表项
type AttendanceSessionListItem struct {
	ID            uint      `json:"id"`
	StartAt       time.Time `json:"start_at"`
	EndAt         time.Time `json:"end_at"`
	IsActive      bool      `json:"is_active"`
	AttendeeCount int       `json:"attendee_count"`
}

// AttendanceCheckinResult 签到结果
type AttendanceCheckinResult struct {
	AlreadyCheckedIn bool
	CheckedInAt      time.Time
}

// AttendanceRecordWithStudent 考勤记录（含学生名称）
type AttendanceRecordWithStudent struct {
	StudentID   uint      `json:"student_id"`
	StudentName string    `json:"student_name"`
	CheckedInAt time.Time `json:"checked_in_at"`
	IPAddress   string    `json:"ip_address"`
}

// AttendanceService 考勤服务接口
type AttendanceService interface {
	GetSummary(ctx context.Context, courseID, userID uint, role string) (AttendanceSummary, error)
	ListSessions(ctx context.Context, courseID uint) ([]AttendanceSessionListItem, error)
	StartSession(ctx context.Context, courseID, startedByID uint, timeoutMinutes int) (*models.AttendanceSession, error)
	EndSession(ctx context.Context, sessionID uint) error
	Checkin(ctx context.Context, sessionID, studentID uint, code, location string) (AttendanceCheckinResult, error)
	GetRecords(ctx context.Context, sessionID uint) ([]AttendanceRecordWithStudent, error)
}

// ResourceService 资源服务接口
type ResourceService interface {
	List(ctx context.Context, courseID uint) ([]*models.Resource, error)
	Create(ctx context.Context, resource *models.Resource) error
	CreateWithPermission(ctx context.Context, resource *models.Resource, userID uint, userRole string) error
	Delete(ctx context.Context, id uint) error
	DeleteWithPermission(ctx context.Context, id uint, userID uint, userRole string) error
}

// UploadService 文件上传服务接口
type UploadService interface {
	AuthorizeAssignmentUpload(ctx context.Context, assignmentID, userID uint, userRole string) error
	AuthorizeResourceUpload(ctx context.Context, courseID, userID uint, userRole string) error
	UploadAssignmentFile(ctx context.Context, assignmentID uint, filename string, reader interface{}, size int64, contentType string) (string, error)
	UploadResourceFile(ctx context.Context, courseID uint, filename string, reader interface{}, size int64, contentType string) (string, error)
}

// WritingService 写作服务接口
type WritingService interface {
	Submit(ctx context.Context, submission *models.WritingSubmission, privacy, route string) error
	CreateSubmission(ctx context.Context, submission *models.WritingSubmission) error
	ApplyAIAnalysis(ctx context.Context, submission *models.WritingSubmission, privacy, route string) error
	RecordLearningEvent(ctx context.Context, event *models.LearningEvent) error
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
	GetLearningTimelinePage(ctx context.Context, studentID uint, page, pageSize int, courseID *uint) ([]*models.LearningEvent, int64, error)
	RecordLearningEvent(ctx context.Context, event *models.LearningEvent) error
}
