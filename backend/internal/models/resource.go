package models

import "gorm.io/gorm"

// Resource represents a course resource (video, paper, link)
type Resource struct {
	gorm.Model
	CourseID    uint   `gorm:"not null;index" json:"course_id"`
	ChapterID   *uint  `gorm:"index" json:"chapter_id,omitempty"` // nullable, relates to chapter
	CreatedByID uint   `gorm:"not null;index" json:"created_by_id"`
	Title       string `gorm:"size:256;not null" json:"title"`
	Type        string `gorm:"size:32;not null" json:"type"` // video, paper, link
	URL         string `gorm:"size:1024;not null" json:"url"`
	Description string `gorm:"type:text" json:"description,omitempty"`
}
