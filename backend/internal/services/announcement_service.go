package services

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type announcementService struct {
	repo repositories.AnnouncementRepository
}

// NewAnnouncementService 创建公告服务实例
func NewAnnouncementService(repo repositories.AnnouncementRepository) AnnouncementService {
	return &announcementService{repo: repo}
}

func (s *announcementService) GetSummary(ctx context.Context, courseID, userID uint) (map[string]interface{}, error) {
	unreadCount, err := s.repo.GetUnreadCount(ctx, courseID, userID)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"unread_count": unreadCount,
	}, nil
}

func (s *announcementService) List(ctx context.Context, courseID uint) ([]*models.Announcement, error) {
	return s.repo.FindByCourseID(ctx, courseID)
}

func (s *announcementService) Create(ctx context.Context, announcement *models.Announcement) error {
	return s.repo.Create(ctx, announcement)
}

func (s *announcementService) Update(ctx context.Context, id uint, updates map[string]interface{}) error {
	announcement, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	if title, ok := updates["title"].(string); ok {
		announcement.Title = title
	}
	if content, ok := updates["content"].(string); ok {
		announcement.Content = content
	}

	return s.repo.Update(ctx, announcement)
}

func (s *announcementService) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}

func (s *announcementService) MarkRead(ctx context.Context, announcementID, userID uint) error {
	return s.repo.MarkRead(ctx, announcementID, userID)
}
