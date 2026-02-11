package models

import "gorm.io/gorm"

// WritingSubmission stores student writing samples for analysis
type WritingSubmission struct {
	gorm.Model
	StudentID     uint   `gorm:"not null;index" json:"student_id"`
	CourseID      uint   `gorm:"not null;index" json:"course_id"`
	AssignmentID  *uint  `gorm:"index" json:"assignment_id,omitempty"`
	WritingType   string `gorm:"size:32;not null" json:"writing_type"` // literature_review, course_paper, thesis, abstract
	Title         string `gorm:"size:256" json:"title"`
	Content       string `gorm:"type:longtext" json:"content"`
	WordCount     int    `gorm:"default:0" json:"word_count"`
	FeedbackJSON  string `gorm:"type:text" json:"feedback_json,omitempty"`  // AI-generated feedback
	DimensionJSON string `gorm:"type:text" json:"dimension_json,omitempty"` // Multi-dimension scores
}
