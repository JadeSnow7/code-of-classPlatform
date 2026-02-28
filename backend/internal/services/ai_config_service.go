package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

const (
	defaultAIMode    = "auto"
	defaultProvider  = "openai"
	defaultServerURL = "http://localhost:8080"
)

type aiConfigService struct {
	repo repositories.AIConfigRepository
}

// NewAIConfigService creates a user AI config service.
func NewAIConfigService(repo repositories.AIConfigRepository) AIConfigService {
	return &aiConfigService{repo: repo}
}

func (s *aiConfigService) GetProfile(ctx context.Context, userID uint) (AIConfigProfile, error) {
	cfg, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return defaultAIConfigProfile(), nil
		}
		return AIConfigProfile{}, err
	}
	return toAIConfigProfile(cfg), nil
}

func (s *aiConfigService) PatchProfile(ctx context.Context, userID uint, req UpdateAIConfigRequest) (AIConfigProfile, error) {
	cfg, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return AIConfigProfile{}, err
		}
		cfg = &models.UserAIConfig{
			UserID:        userID,
			DefaultMode:   defaultAIMode,
			Provider:      defaultProvider,
			CustomBaseURL: "",
			ServerURL:     defaultServerURL,
			APIKey:        "",
		}
	}

	if req.DefaultMode != nil {
		mode := strings.TrimSpace(*req.DefaultMode)
		if err := validateAIMode(mode); err != nil {
			return AIConfigProfile{}, err
		}
		cfg.DefaultMode = mode
	}

	if req.Provider != nil {
		provider := strings.TrimSpace(*req.Provider)
		if provider == "" {
			return AIConfigProfile{}, errors.New("provider is required")
		}
		cfg.Provider = provider
	}

	if req.CustomBaseURL != nil {
		cfg.CustomBaseURL = strings.TrimSpace(*req.CustomBaseURL)
	}

	if req.ServerURL != nil {
		serverURL := strings.TrimSpace(*req.ServerURL)
		if serverURL == "" {
			serverURL = defaultServerURL
		}
		cfg.ServerURL = serverURL
	}

	if req.APIKey != nil {
		cfg.APIKey = strings.TrimSpace(*req.APIKey)
	}

	if cfg.DefaultMode == "" {
		cfg.DefaultMode = defaultAIMode
	}
	if cfg.Provider == "" {
		cfg.Provider = defaultProvider
	}
	if cfg.ServerURL == "" {
		cfg.ServerURL = defaultServerURL
	}

	if err := s.repo.UpsertByUserID(ctx, cfg); err != nil {
		return AIConfigProfile{}, err
	}

	return toAIConfigProfile(cfg), nil
}

func validateAIMode(mode string) error {
	switch mode {
	case "local", "server", "auto":
		return nil
	default:
		return fmt.Errorf("invalid default_mode")
	}
}

func defaultAIConfigProfile() AIConfigProfile {
	return AIConfigProfile{
		DefaultMode:   defaultAIMode,
		Provider:      defaultProvider,
		CustomBaseURL: "",
		ServerURL:     defaultServerURL,
	}
}

func toAIConfigProfile(cfg *models.UserAIConfig) AIConfigProfile {
	profile := AIConfigProfile{
		DefaultMode:   cfg.DefaultMode,
		Provider:      cfg.Provider,
		CustomBaseURL: cfg.CustomBaseURL,
		ServerURL:     cfg.ServerURL,
	}
	if masked := maskAPIKey(cfg.APIKey); masked != "" {
		profile.APIKeyMasked = &masked
	}
	return profile
}

func maskAPIKey(apiKey string) string {
	value := strings.TrimSpace(apiKey)
	if value == "" {
		return ""
	}
	if len(value) <= 8 {
		return "********"
	}
	return value[:3] + strings.Repeat("*", len(value)-7) + value[len(value)-4:]
}
