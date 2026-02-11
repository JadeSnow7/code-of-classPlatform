package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type announcementRepository struct {
	db *gorm.DB
}

// NewAnnouncementRepository 创建公告仓库实例
func NewAnnouncementRepository(db *gorm.DB) AnnouncementRepository {
	return &announcementRepository{db: db}
}

func (r *announcementRepository) FindByCourseID(ctx context.Context, courseID uint) ([]*models.Announcement, error) {
	var announcements []*models.Announcement
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC").Find(&announcements).Error; err != nil {
		return nil, err
	}
	return announcements, nil
}

func (r *announcementRepository) FindByID(ctx context.Context, id uint) (*models.Announcement, error) {
	var announcement models.Announcement
	if err := r.db.WithContext(ctx).First(&announcement, id).Error; err != nil {
		return nil, err
	}
	return &announcement, nil
}

func (r *announcementRepository) CountByCourseID(ctx context.Context, courseID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.Announcement{}).Where("course_id = ?", courseID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *announcementRepository) FindLatestByCourseID(ctx context.Context, courseID uint) (*models.Announcement, error) {
	var latest models.Announcement
	if err := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC").First(&latest).Error; err != nil {
		return nil, err
	}
	return &latest, nil
}

func (r *announcementRepository) FindReadByAnnouncementIDsAndUser(ctx context.Context, announcementIDs []uint, userID uint) ([]models.AnnouncementRead, error) {
	if len(announcementIDs) == 0 {
		return []models.AnnouncementRead{}, nil
	}
	var reads []models.AnnouncementRead
	if err := r.db.WithContext(ctx).Where("announcement_id IN ? AND user_id = ?", announcementIDs, userID).Find(&reads).Error; err != nil {
		return nil, err
	}
	return reads, nil
}

func (r *announcementRepository) Create(ctx context.Context, announcement *models.Announcement) error {
	return r.db.WithContext(ctx).Create(announcement).Error
}

func (r *announcementRepository) Update(ctx context.Context, announcement *models.Announcement) error {
	return r.db.WithContext(ctx).Save(announcement).Error
}

func (r *announcementRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Announcement{}, id).Error
}

func (r *announcementRepository) DeleteReadsByAnnouncementID(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Where("announcement_id = ?", id).Delete(&models.AnnouncementRead{}).Error
}

func (r *announcementRepository) MarkRead(ctx context.Context, announcementID, userID uint) error {
	read := &models.AnnouncementRead{
		AnnouncementID: announcementID,
		UserID:         userID,
	}
	return r.db.WithContext(ctx).Create(read).Error
}

func (r *announcementRepository) GetUnreadCount(ctx context.Context, courseID, userID uint) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.Announcement{}).
		Where("course_id = ? AND id NOT IN (?)",
			courseID,
			r.db.Model(&models.AnnouncementRead{}).Select("announcement_id").Where("user_id = ?", userID),
		).Count(&count).Error
	return count, err
}
