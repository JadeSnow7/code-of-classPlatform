package models

import "gorm.io/gorm"

// UserAIConfig stores per-user AI integration preferences.
type UserAIConfig struct {
	gorm.Model
	UserID        uint   `gorm:"uniqueIndex;not null" json:"user_id"`
	DefaultMode   string `gorm:"size:16;not null;default:auto" json:"default_mode"`
	Provider      string `gorm:"size:32;not null;default:openai" json:"provider"`
	CustomBaseURL string `gorm:"size:255" json:"custom_base_url"`
	ServerURL     string `gorm:"size:255;not null;default:http://localhost:8080" json:"server_url"`
	APIKey        string `gorm:"size:512" json:"-"`
}
