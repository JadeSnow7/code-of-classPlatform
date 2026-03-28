package http

import (
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

// envelope is used in tests to parse response JSON.
type envelope[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data,omitempty"`
	Error   *struct {
		Code    string      `json:"code,omitempty"`
		Message string      `json:"message"`
		Details interface{} `json:"details,omitempty"`
	} `json:"error,omitempty"`
}

func migrateAuthTables(t assert.TestingT, db *gorm.DB) {
	assert.NoError(t, db.AutoMigrate(&models.User{}, &models.ActivationToken{}, &models.RefreshSession{}, &models.StudentGlobalProfile{}))
}

func newAuthTestConfig(jwtSecret string) config.Config {
	return config.Config{
		JWTSecret:          jwtSecret,
		PublicWebBaseURL:   "http://localhost:5173",
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    14 * 24 * time.Hour,
		ActivationTokenTTL: 72 * time.Hour,
		AuthBcryptCost:     4,
	}
}
