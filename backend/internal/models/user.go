package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents an authenticated platform user.
type User struct {
	gorm.Model
	Username     string     `gorm:"uniqueIndex;size:64;not null" json:"username"`
	PasswordHash string     `gorm:"size:255;not null" json:"-"`
	Role         string     `gorm:"size:32;not null;index" json:"role"`
	Name         string     `gorm:"size:64" json:"name"`
	Status       string     `gorm:"size:32;not null;default:'active';index" json:"status"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	WecomUserID  string     `gorm:"size:64;index" json:"wecom_user_id,omitempty"`
	FeishuOpenID string     `gorm:"size:64;index" json:"feishu_open_id,omitempty"`
}

// CourseEnrollment represents a student's enrollment in a course
type CourseEnrollment struct {
	gorm.Model
	CourseID   uint      `gorm:"not null;uniqueIndex:idx_course_user" json:"course_id"`
	UserID     uint      `gorm:"not null;uniqueIndex:idx_course_user" json:"user_id"`
	Role       string    `gorm:"size:32;default:'student'" json:"role"` // student, assistant
	EnrolledAt time.Time `json:"enrolled_at"`
}
