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
	Status        string `gorm:"size:32;default:'draft'" json:"status"`
	FeedbackJSON  string `gorm:"type:text" json:"feedback_json,omitempty"`  // AI-generated feedback
	DimensionJSON string `gorm:"type:text" json:"dimension_json,omitempty"` // Multi-dimension scores
}

// WritingRevision stores point-in-time snapshots for a writing submission.
type WritingRevision struct {
	gorm.Model
	SubmissionID uint   `gorm:"not null;index" json:"submission_id"`
	Title        string `gorm:"size:256" json:"title"`
	Content      string `gorm:"type:longtext" json:"content"`
	WordCount    int    `gorm:"default:0" json:"word_count"`
	Summary      string `gorm:"size:512" json:"summary"`
	TriggerType  string `gorm:"size:32;not null;index" json:"trigger_type"`
}
