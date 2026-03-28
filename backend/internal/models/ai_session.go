package models

import "gorm.io/gorm"

// AISession represents a user-visible AI conversation session.
type AISession struct {
	gorm.Model
	SessionID              string `gorm:"size:64;not null;uniqueIndex" json:"session_id"`
	UserID                 uint   `gorm:"not null;index" json:"user_id"`
	Mode                   string `gorm:"size:64;not null" json:"mode"`
	OverriddenSystemPrompt string `gorm:"type:text" json:"overridden_system_prompt"`
}

// AIMessage stores persisted messages for an AI session.
type AIMessage struct {
	gorm.Model
	MessageID string `gorm:"size:64;not null;uniqueIndex" json:"message_id"`
	SessionID string `gorm:"size:64;not null;index" json:"session_id"`
	UserID    uint   `gorm:"not null;index" json:"user_id"`
	Role      string `gorm:"size:16;not null" json:"role"`
	Content   string `gorm:"type:longtext" json:"content"`
}

// AIRun stores execution metadata for a session run.
type AIRun struct {
	gorm.Model
	RunID        string `gorm:"size:64;not null;uniqueIndex" json:"run_id"`
	SessionID    string `gorm:"size:64;not null;index" json:"session_id"`
	UserID       uint   `gorm:"not null;index" json:"user_id"`
	Status       string `gorm:"size:32;not null;index" json:"status"`
	ErrorCode    string `gorm:"size:64" json:"error_code"`
	ErrorMessage string `gorm:"size:512" json:"error_message"`
}
