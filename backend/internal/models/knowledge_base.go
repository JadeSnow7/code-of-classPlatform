package models

import "gorm.io/gorm"

// KnowledgeBase is a user-owned container for uploaded files.
type KnowledgeBase struct {
	gorm.Model
	UserID uint   `gorm:"not null;index" json:"user_id"`
	Name   string `gorm:"size:255;not null" json:"name"`
}

// KnowledgeBaseFile stores uploaded file metadata.
type KnowledgeBaseFile struct {
	gorm.Model
	KnowledgeBaseID uint   `gorm:"not null;index" json:"knowledge_base_id"`
	UserID          uint   `gorm:"not null;index" json:"user_id"`
	Name            string `gorm:"size:255;not null" json:"name"`
	StoragePath     string `gorm:"size:512" json:"storage_path"`
	DownloadURL     string `gorm:"size:1024" json:"download_url"`
	SizeBytes       int64  `json:"size_bytes"`
	MimeType        string `gorm:"size:255" json:"mime_type"`
	Status          string `gorm:"size:32;default:'uploaded'" json:"status"`
}
