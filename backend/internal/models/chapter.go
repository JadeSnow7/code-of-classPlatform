package models

import (
	"time"

	"gorm.io/gorm"
)

// Chapter represents a chapter within a course
type Chapter struct {
	gorm.Model
	CourseID        uint   `gorm:"not null;index" json:"course_id"`
	Title           string `gorm:"size:256;not null" json:"title"`
	OrderNum        int    `gorm:"index" json:"order_num"`                      // sort by (order_num, id)
	Summary         string `gorm:"type:text" json:"summary,omitempty"`          // chapter summary
	KnowledgePoints string `gorm:"type:text" json:"knowledge_points,omitempty"` // JSON array: ["知识点1", "知识点2"]
}

// ChapterProgress tracks student's study time in a chapter
type ChapterProgress struct {
	gorm.Model
	ChapterID            uint       `gorm:"not null;uniqueIndex:idx_chapter_student" json:"chapter_id"`
	StudentID            uint       `gorm:"not null;uniqueIndex:idx_chapter_student" json:"student_id"`
	StudyDurationSeconds int        `gorm:"default:0" json:"study_duration_seconds"`
	LastActiveAt         *time.Time `json:"last_active_at,omitempty"`
}
