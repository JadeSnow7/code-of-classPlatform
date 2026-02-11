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

// CourseRepository 课程数据访问接口
type CourseRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Course, error)
	FindAll(ctx context.Context) ([]models.Course, error)
	FindByTeacherID(ctx context.Context, teacherID uint) ([]models.Course, error)
	FindByStudentID(ctx context.Context, studentID uint) ([]models.Course, error)
	Create(ctx context.Context, course *models.Course) error
	Update(ctx context.Context, course *models.Course, updates map[string]interface{}) error
	Delete(ctx context.Context, id uint) error
	HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error)
}

// AssignmentRepository 作业数据访问接口
type AssignmentRepository interface {
	FindCourse(ctx context.Context, courseID uint) (*models.Course, error)
	FindAssignment(ctx context.Context, assignmentID uint) (*models.Assignment, error)
	CreateAssignment(ctx context.Context, assignment *models.Assignment) error
	ListByCourse(ctx context.Context, courseID uint) ([]models.Assignment, error)
	FindSubmission(ctx context.Context, assignmentID uint, studentID uint) (*models.Submission, error)
	FindSubmissionByID(ctx context.Context, submissionID uint) (*models.Submission, error)
	SaveSubmission(ctx context.Context, submission *models.Submission) error
	CreateSubmission(ctx context.Context, submission *models.Submission) error
	ListSubmissionsByAssignment(ctx context.Context, assignmentID uint) ([]models.Submission, error)
	CountAssignmentsByCourse(ctx context.Context, courseID uint) (int64, error)
	CountSubmissionsByCourseAndStudent(ctx context.Context, courseID uint, studentID uint) (int64, error)
	CountPendingGradingByCourse(ctx context.Context, courseID uint) (int64, error)
	AvgGradeByCourseAndStudent(ctx context.Context, courseID uint, studentID uint) (float64, error)
	AvgGradeByCourse(ctx context.Context, courseID uint) (float64, error)
	CountStudentsByCourse(ctx context.Context, courseID uint) (int64, error)
	HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error)
}

// QuizRepository 测验数据访问接口
type QuizRepository interface {
	ListByCourse(ctx context.Context, courseID uint, publishedOnly bool) ([]models.Quiz, error)
	FindByID(ctx context.Context, quizID uint) (*models.Quiz, error)
	Create(ctx context.Context, quiz *models.Quiz) error
	Update(ctx context.Context, quiz *models.Quiz, updates map[string]interface{}) error
	Save(ctx context.Context, quiz *models.Quiz) error
	DeleteByID(ctx context.Context, quizID uint) error
	ListQuestions(ctx context.Context, quizID uint) ([]models.Question, error)
	FindQuestionByID(ctx context.Context, questionID uint) (*models.Question, error)
	CreateQuestion(ctx context.Context, question *models.Question) error
	SaveQuestion(ctx context.Context, question *models.Question) error
	DeleteQuestion(ctx context.Context, questionID uint) error
	DeleteQuestionsByQuiz(ctx context.Context, quizID uint) error
	DeleteAttemptsByQuiz(ctx context.Context, quizID uint) error
	CountAttempts(ctx context.Context, quizID uint) (int64, error)
	CountAttemptsByQuizAndStudent(ctx context.Context, quizID uint, studentID uint) (int64, error)
	FindInProgressAttempt(ctx context.Context, quizID uint, studentID uint) (*models.QuizAttempt, error)
	CreateAttempt(ctx context.Context, attempt *models.QuizAttempt) error
	SaveAttempt(ctx context.Context, attempt *models.QuizAttempt) error
	SumQuestionPoints(ctx context.Context, quizID uint) (int, error)
	ListAttemptsByQuizAndStudent(ctx context.Context, quizID uint, studentID uint) ([]models.QuizAttempt, error)
	ListAttemptsByQuiz(ctx context.Context, quizID uint, order string) ([]models.QuizAttempt, error)
	ListAttemptsByQuizAndStudentOrder(ctx context.Context, quizID uint, studentID uint, order string) ([]models.QuizAttempt, error)
}

// ChapterRepository 章节数据访问接口
type ChapterRepository interface {
	FindCourse(ctx context.Context, courseID uint) (*models.Course, error)
	FindChapter(ctx context.Context, chapterID uint) (*models.Chapter, error)
	ListByCourse(ctx context.Context, courseID uint) ([]models.Chapter, error)
	Create(ctx context.Context, chapter *models.Chapter) error
	Update(ctx context.Context, chapter *models.Chapter, updates map[string]interface{}) error
	Delete(ctx context.Context, chapterID uint) error
	HasEnrollment(ctx context.Context, courseID uint, userID uint) (bool, error)
	ClearChapterReferences(ctx context.Context, chapterID uint) error
	DeleteProgressByChapter(ctx context.Context, chapterID uint) error
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
