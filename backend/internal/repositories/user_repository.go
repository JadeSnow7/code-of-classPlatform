package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type userRepository struct {
	db *gorm.DB
}

// NewUserRepository 创建用户仓库实例
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) FindByID(ctx context.Context, id uint) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindByIDs(ctx context.Context, ids []uint) ([]*models.User, error) {
	if len(ids) == 0 {
		return []*models.User{}, nil
	}
	var users []*models.User
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (r *userRepository) FindByUsername(ctx context.Context, username string) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *userRepository) FindAll(ctx context.Context, roleFilter string) ([]*models.User, error) {
	var users []*models.User
	query := r.db.WithContext(ctx).Model(&models.User{})
	if roleFilter != "" {
		query = query.Where("role = ?", roleFilter)
	}
	if err := query.Order("id ASC").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *userRepository) Update(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *userRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.User{}, id).Error
}

func (r *userRepository) Count(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.User{}).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *userRepository) CountByRole(ctx context.Context, role string) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.User{}).Where("role = ?", role).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *userRepository) CreateActivationToken(ctx context.Context, token *models.ActivationToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *userRepository) FindActivationTokenByHash(ctx context.Context, tokenHash string) (*models.ActivationToken, error) {
	var token models.ActivationToken
	if err := r.db.WithContext(ctx).Preload("User").Where("token_hash = ?", tokenHash).First(&token).Error; err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *userRepository) MarkActivationTokenUsed(ctx context.Context, id uint, usedAt int64) error {
	return r.db.WithContext(ctx).Model(&models.ActivationToken{}).Where("id = ?", id).Update("used_at", usedAt).Error
}

func (r *userRepository) ConsumeActivationTokenByHash(ctx context.Context, tokenHash string, usedAt int64) (bool, error) {
	result := r.db.WithContext(ctx).
		Model(&models.ActivationToken{}).
		Where("token_hash = ? AND used_at IS NULL AND expires_at >= ?", tokenHash, usedAt).
		Update("used_at", usedAt)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

func (r *userRepository) RevokeActivationTokensByUser(ctx context.Context, userID uint, usedAt int64) error {
	return r.db.WithContext(ctx).
		Model(&models.ActivationToken{}).
		Where("user_id = ? AND used_at IS NULL", userID).
		Update("used_at", usedAt).Error
}

func (r *userRepository) CreateRefreshSession(ctx context.Context, session *models.RefreshSession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *userRepository) FindRefreshSessionByHash(ctx context.Context, tokenHash string) (*models.RefreshSession, error) {
	var session models.RefreshSession
	if err := r.db.WithContext(ctx).Preload("User").Where("token_hash = ?", tokenHash).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *userRepository) RevokeRefreshSessionByHash(ctx context.Context, tokenHash string, revokedAt int64) error {
	return r.db.WithContext(ctx).
		Model(&models.RefreshSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", revokedAt).Error
}

func (r *userRepository) ConsumeRefreshSessionByHash(ctx context.Context, tokenHash string, consumedAt int64) (bool, error) {
	result := r.db.WithContext(ctx).
		Model(&models.RefreshSession{}).
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at >= ?", tokenHash, consumedAt).
		Updates(map[string]any{
			"revoked_at":   consumedAt,
			"last_used_at": consumedAt,
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

func (r *userRepository) RevokeRefreshSessionsByUser(ctx context.Context, userID uint, revokedAt int64) error {
	return r.db.WithContext(ctx).
		Model(&models.RefreshSession{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", revokedAt).Error
}

func (r *userRepository) TouchRefreshSession(ctx context.Context, id uint, lastUsedAt int64) error {
	return r.db.WithContext(ctx).Model(&models.RefreshSession{}).Where("id = ?", id).Update("last_used_at", lastUsedAt).Error
}
