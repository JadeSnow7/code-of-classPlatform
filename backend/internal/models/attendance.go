package models

import (
	"time"

	"gorm.io/gorm"
)

// AttendanceSession represents a check-in session created by a teacher
type AttendanceSession struct {
	gorm.Model
	CourseID       uint      `gorm:"not null;index:idx_attendance_session_course" json:"course_id"`
	StartedByID    uint      `gorm:"not null" json:"started_by_id"`
	StartAt        time.Time `json:"start_at"`
	EndAt          time.Time `json:"end_at"`
	TimeoutMinutes int       `gorm:"default:15" json:"timeout_minutes"`
	Code           string    `gorm:"size:6;not null" json:"code"`
	IsActive       bool      `gorm:"default:true;index" json:"is_active"`
}

// AttendanceRecord represents a student's check-in for a session
type AttendanceRecord struct {
	gorm.Model
	SessionID   uint      `gorm:"not null;index:idx_attendance_record_session" json:"session_id"`
	StudentID   uint      `gorm:"not null;uniqueIndex:idx_session_student" json:"student_id"`
	CheckedInAt time.Time `json:"checked_in_at"`
	IPAddress   string    `gorm:"size:45" json:"ip_address"`
}
