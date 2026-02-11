package models

import (
	"time"

	"gorm.io/gorm"
)

// Announcement represents a course announcement
type Announcement struct {
	gorm.Model
	CourseID    uint   `gorm:"not null;index:idx_announcement_course_created" json:"course_id"`
	Title       string `gorm:"size:200;not null" json:"title"`
	Content     string `gorm:"type:text;not null" json:"content"`
	CreatedByID uint   `gorm:"not null" json:"created_by_id"`
}

// AnnouncementRead tracks which users have read which announcements
type AnnouncementRead struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AnnouncementID uint      `gorm:"not null;uniqueIndex:idx_announcement_user" json:"announcement_id"`
	UserID         uint      `gorm:"not null;uniqueIndex:idx_announcement_user" json:"user_id"`
	ReadAt         time.Time `json:"read_at"`
}
