package models

import (
	"time"

	"gorm.io/gorm"
)

// Assignment represents a course assignment created by a teacher
type Assignment struct {
	gorm.Model
	CourseID    uint       `gorm:"not null;index" json:"course_id"`
	ChapterID   *uint      `gorm:"index" json:"chapter_id,omitempty"` // nullable, relates to chapter
	TeacherID   uint       `gorm:"not null;index" json:"teacher_id"`
	Title       string     `gorm:"size:256;not null" json:"title"`
	Description string     `gorm:"type:text" json:"description"`
	Deadline    *time.Time `json:"deadline,omitempty"`
	AllowFile   bool       `gorm:"default:true" json:"allow_file"`
	MaxFileSize int64      `gorm:"default:10485760" json:"max_file_size"` // 10MB default
}

// Submission represents a student's submission for an assignment
type Submission struct {
	gorm.Model
	AssignmentID uint   `gorm:"not null;index;uniqueIndex:idx_assignment_student" json:"assignment_id"`
	StudentID    uint   `gorm:"not null;index;uniqueIndex:idx_assignment_student" json:"student_id"`
	Content      string `gorm:"type:text" json:"content"`
	FileURL      string `gorm:"size:512" json:"file_url,omitempty"`
	Grade        *int   `json:"grade,omitempty"` // nil = not graded
	Feedback     string `gorm:"type:text" json:"feedback,omitempty"`
	GradedBy     *uint  `json:"graded_by,omitempty"`
}
