package repositories

import (
	"context"
	"errors"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type aiConfigRepository struct {
	db *gorm.DB
}

// NewAIConfigRepository creates a user AI config repository.
func NewAIConfigRepository(db *gorm.DB) AIConfigRepository {
	return &aiConfigRepository{db: db}
}

func (r *aiConfigRepository) GetByUserID(ctx context.Context, userID uint) (*models.UserAIConfig, error) {
	if userID == 0 {
		return nil, errors.New("invalid user id")
	}

	var cfg models.UserAIConfig
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *aiConfigRepository) UpsertByUserID(ctx context.Context, cfg *models.UserAIConfig) error {
	if cfg == nil {
		return errors.New("config is required")
	}
	if cfg.UserID == 0 {
		return errors.New("invalid user id")
	}

	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"default_mode",
			"provider",
			"custom_base_url",
			"server_url",
			"api_key",
			"updated_at",
		}),
	}).Create(cfg).Error
}
