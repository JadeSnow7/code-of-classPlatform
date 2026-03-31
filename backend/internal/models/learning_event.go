package models

import "time"

// StudentLearningProfile tracks a student's learning analytics and weak points
type StudentLearningProfile struct {
	ID                uint       `gorm:"primaryKey" json:"id"`
	StudentID         uint       `gorm:"not null;uniqueIndex:idx_student_course" json:"student_id"`
	CourseID          uint       `gorm:"not null;uniqueIndex:idx_student_course" json:"course_id"`
	WeakPoints        string     `gorm:"type:text" json:"weak_points"`      // JSON: {"学术语气": 3, "引用规范": 1}
	CompletedTopics   string     `gorm:"type:text" json:"completed_topics"` // JSON array of completed topic names
	TotalSessions     int        `gorm:"default:0" json:"total_sessions"`
	TotalStudyMinutes int        `gorm:"default:0" json:"total_study_minutes"`
	LastSessionAt     *time.Time `json:"last_session_at,omitempty"`
	RecommendedTopics string     `gorm:"type:text" json:"recommended_topics,omitempty"` // AI-generated recommendations
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	DeletedAt         *time.Time `gorm:"index" json:"deleted_at,omitempty"`
}

// StudentGlobalProfile aggregates learning data across all courses for a student
type StudentGlobalProfile struct {
	StudentID          uint       `gorm:"primaryKey" json:"student_id"`
	OnboardingProfile  string     `gorm:"type:text" json:"onboarding_profile"`  // JSON: cold-start onboarding questionnaire
	GlobalCompetencies string     `gorm:"type:text" json:"global_competencies"` // JSON: {"academic_writing": 0.7, "citation": 0.5}
	TotalStudyHours    int        `gorm:"default:0" json:"total_study_hours"`
	LearningStyle      string     `gorm:"type:text" json:"learning_style"` // JSON: {"preferred_time": "evening", "pace": "moderate"}
	UpdatedAt          *time.Time `json:"updated_at,omitempty"`
}

// LearningEvent records individual learning actions for event sourcing
type LearningEvent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StudentID uint      `gorm:"not null;index:idx_learning_event_student_time" json:"student_id"`
	CourseID  *uint     `gorm:"index:idx_learning_event_course_time" json:"course_id,omitempty"`
	EventType string    `gorm:"size:32;not null" json:"event_type"` // chat, quiz_submit, assignment_submit, heartbeat, writing_submit
	Payload   string    `gorm:"type:text" json:"payload"`           // JSON: event-specific data
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
