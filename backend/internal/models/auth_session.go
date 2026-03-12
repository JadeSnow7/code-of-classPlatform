package models

import "gorm.io/gorm"

const (
	UserStatusPendingActivation = "pending_activation"
	UserStatusActive            = "active"
	UserStatusDisabled          = "disabled"
)

type ActivationToken struct {
	gorm.Model
	UserID       uint   `gorm:"not null;index" json:"user_id"`
	TokenHash    string `gorm:"size:128;not null;uniqueIndex" json:"-"`
	ExpiresAt    int64  `gorm:"not null;index" json:"expires_at"`
	UsedAt       *int64 `json:"used_at,omitempty"`
	InvitedBy    uint   `gorm:"not null;index" json:"invited_by"`
	RoleSnapshot string `gorm:"size:32;not null" json:"role_snapshot"`
	User         User   `gorm:"foreignKey:UserID" json:"-"`
}

type RefreshSession struct {
	gorm.Model
	UserID      uint   `gorm:"not null;index" json:"user_id"`
	TokenHash   string `gorm:"size:128;not null;uniqueIndex" json:"-"`
	ExpiresAt   int64  `gorm:"not null;index" json:"expires_at"`
	RevokedAt   *int64 `json:"revoked_at,omitempty"`
	LastUsedAt  *int64 `json:"last_used_at,omitempty"`
	ClientType  string `gorm:"size:32;not null;default:'web'" json:"client_type"`
	DeviceLabel string `gorm:"size:128" json:"device_label"`
	IP          string `gorm:"size:64" json:"ip"`
	UserAgent   string `gorm:"size:512" json:"user_agent"`
	User        User   `gorm:"foreignKey:UserID" json:"-"`
}
