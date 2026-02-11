package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type attendanceRepository struct {
	db *gorm.DB
}

// NewAttendanceRepository 创建考勤仓库实例
func NewAttendanceRepository(db *gorm.DB) AttendanceRepository {
	return &attendanceRepository{db: db}
}

func (r *attendanceRepository) FindSessionsByCourseID(ctx context.Context, courseID uint) ([]*models.AttendanceSession, error) {
	var sessions []*models.AttendanceSession
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC").Find(&sessions).Error; err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *attendanceRepository) CountSessionsByCourseID(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.AttendanceSession{}).Where("course_id = ?", courseID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *attendanceRepository) FindLatestSessionByCourseID(ctx context.Context, courseID uint) (*models.AttendanceSession, error) {
	var session models.AttendanceSession
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("start_at DESC").First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *attendanceRepository) FindSessionByID(ctx context.Context, id uint) (*models.AttendanceSession, error) {
	var session models.AttendanceSession
	if err := r.db.WithContext(ctx).First(&session, id).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *attendanceRepository) FindActiveSessionByCourseID(ctx context.Context, courseID uint) (*models.AttendanceSession, error) {
	var session models.AttendanceSession
	if err := r.db.WithContext(ctx).Where("course_id = ? AND is_active = ?", courseID, true).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *attendanceRepository) CreateSession(ctx context.Context, session *models.AttendanceSession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *attendanceRepository) UpdateSession(ctx context.Context, session *models.AttendanceSession) error {
	return r.db.WithContext(ctx).Save(session).Error
}

func (r *attendanceRepository) FindActiveSessionByCode(ctx context.Context, code string) (*models.AttendanceSession, error) {
	var session models.AttendanceSession
	if err := r.db.WithContext(ctx).Where("code = ? AND is_active = ?", code, true).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *attendanceRepository) FindRecordBySessionAndStudent(ctx context.Context, sessionID, studentID uint) (*models.AttendanceRecord, error) {
	var record models.AttendanceRecord
	if err := r.db.WithContext(ctx).Where("session_id = ? AND student_id = ?", sessionID, studentID).First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *attendanceRepository) CountRecordsBySessionID(ctx context.Context, sessionID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.AttendanceRecord{}).Where("session_id = ?", sessionID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *attendanceRepository) CountRecordsByCourseAndStudent(ctx context.Context, courseID, studentID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.AttendanceRecord{}).
		Joins("JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id").
		Where("attendance_sessions.course_id = ? AND attendance_records.student_id = ?", courseID, studentID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *attendanceRepository) CountRecordsByCourseID(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.AttendanceRecord{}).
		Joins("JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id").
		Where("attendance_sessions.course_id = ?", courseID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *attendanceRepository) CountEnrollmentsByCourseAndRole(ctx context.Context, courseID uint, role string) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.CourseEnrollment{}).Where("course_id = ? AND role = ?", courseID, role).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *attendanceRepository) Checkin(ctx context.Context, record *models.AttendanceRecord) error {
	return r.db.WithContext(ctx).Create(record).Error
}

func (r *attendanceRepository) GetRecords(ctx context.Context, sessionID uint) ([]*models.AttendanceRecord, error) {
	var records []*models.AttendanceRecord
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *attendanceRepository) GetAttendanceRate(ctx context.Context, courseID, studentID uint) (float64, error) {
	var totalSessions int64
	var attendedSessions int64

	// Count total sessions for the course
	if err := r.db.WithContext(ctx).Model(&models.AttendanceSession{}).Where("course_id = ?", courseID).Count(&totalSessions).Error; err != nil {
		return 0, err
	}

	if totalSessions == 0 {
		return 0, nil
	}

	// Count attended sessions
	if err := r.db.WithContext(ctx).Model(&models.AttendanceRecord{}).
		Joins("JOIN attendance_sessions ON attendance_records.session_id = attendance_sessions.id").
		Where("attendance_sessions.course_id = ? AND attendance_records.student_id = ?", courseID, studentID).
		Count(&attendedSessions).Error; err != nil {
		return 0, err
	}

	return float64(attendedSessions) / float64(totalSessions), nil
}
