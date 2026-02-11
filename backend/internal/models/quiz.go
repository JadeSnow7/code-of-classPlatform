package models

import (
	"time"

	"gorm.io/gorm"
)

// Quiz represents an online quiz/test for a course
type Quiz struct {
	gorm.Model
	CourseID           uint       `gorm:"not null;index" json:"course_id"`
	ChapterID          *uint      `gorm:"index" json:"chapter_id,omitempty"` // nullable, relates to chapter
	CreatedByID        uint       `gorm:"not null;index" json:"created_by_id"`
	Title              string     `gorm:"size:256;not null" json:"title"`
	Description        string     `gorm:"type:text" json:"description"`
	TimeLimit          int        `gorm:"default:0" json:"time_limit"`               // minutes, 0=unlimited
	StartTime          *time.Time `json:"start_time,omitempty"`                      // nil=immediately available
	EndTime            *time.Time `json:"end_time,omitempty"`                        // nil=no deadline
	MaxAttempts        int        `gorm:"default:1" json:"max_attempts"`             // max retry count (1-3)
	ShowAnswerAfterEnd bool       `gorm:"default:true" json:"show_answer_after_end"` // show answers after EndTime
	IsPublished        bool       `gorm:"default:false" json:"is_published"`         // published = questions locked
	TotalPoints        int        `gorm:"default:0" json:"total_points"`             // sum of question points
}

// Question represents a quiz question
type Question struct {
	gorm.Model
	QuizID    uint   `gorm:"not null;index" json:"quiz_id"`
	Type      string `gorm:"size:32;not null" json:"type"`                   // single_choice, multiple_choice, true_false, fill_blank
	Content   string `gorm:"type:text;not null" json:"content"`              // question text
	Options   string `gorm:"type:text" json:"options,omitempty"`             // JSON array: ["Option A", "Option B", ...]
	Answer    string `gorm:"size:512;not null" json:"-"`                     // correct answer, hidden from students
	MatchRule string `gorm:"size:32;default:'exact_trim'" json:"match_rule"` // exact, exact_trim, contains, regex (for fill_blank)
	Points    int    `gorm:"default:1" json:"points"`                        // points for this question
	OrderNum  int    `gorm:"default:0" json:"order_num"`                     // display order
}

// QuizAttempt represents a student's attempt at a quiz
type QuizAttempt struct {
	gorm.Model
	QuizID         uint       `gorm:"not null;index" json:"quiz_id"`
	StudentID      uint       `gorm:"not null;index" json:"student_id"`
	AttemptNumber  int        `gorm:"not null;default:1" json:"attempt_number"`
	StartedAt      time.Time  `json:"started_at"`
	Deadline       time.Time  `json:"deadline"` // server-calculated deadline
	SubmittedAt    *time.Time `json:"submitted_at,omitempty"`
	AnswerSnapshot string     `gorm:"type:text" json:"-"`                 // questions snapshot at submission
	Answers        string     `gorm:"type:text" json:"answers,omitempty"` // JSON: {"1": "A", "2": ["A","C"], ...}
	Score          *int       `json:"score,omitempty"`                    // nil = not graded
	MaxScore       int        `json:"max_score"`                          // total points at submission time
}
