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

func (s *announcementService) GetSummary(ctx context.Context, courseID, userID uint) (AnnouncementSummary, error) {
	summary := AnnouncementSummary{}

	totalCount, err := s.repo.CountByCourseID(ctx, courseID)
	if err != nil {
		return summary, err
	}
	unreadCount, err := s.repo.GetUnreadCount(ctx, courseID, userID)
	if err != nil {
		return summary, err
	}

	latest, err := s.repo.FindLatestByCourseID(ctx, courseID)
	if err == nil {
		summary.Latest = &AnnouncementLatestInfo{
			ID:        latest.ID,
			Title:     latest.Title,
			CreatedAt: latest.CreatedAt,
		}
	}

	summary.TotalCount = int(totalCount)
	summary.UnreadCount = int(unreadCount)
	return summary, nil
}

func (s *announcementService) ListWithReadStatus(ctx context.Context, courseID, userID uint) ([]AnnouncementListItem, error) {
	announcements, err := s.repo.FindByCourseID(ctx, courseID)
	if err != nil {
		return nil, err
	}

	announcementIDs := make([]uint, len(announcements))
	for i, announcement := range announcements {
		announcementIDs[i] = announcement.ID
	}
	reads, err := s.repo.FindReadByAnnouncementIDsAndUser(ctx, announcementIDs, userID)
	if err != nil {
		return nil, err
	}

	readMap := make(map[uint]bool, len(reads))
	for _, read := range reads {
		readMap[read.AnnouncementID] = true
	}

	result := make([]AnnouncementListItem, len(announcements))
	for i, announcement := range announcements {
		result[i] = AnnouncementListItem{
			ID:        announcement.ID,
			Title:     announcement.Title,
			Content:   announcement.Content,
			CreatedAt: announcement.CreatedAt,
			IsRead:    readMap[announcement.ID],
		}
	}
	return result, nil
}

func (s *announcementService) List(ctx context.Context, courseID uint) ([]*models.Announcement, error) {
	return s.repo.FindByCourseID(ctx, courseID)
}

func (s *announcementService) Create(ctx context.Context, announcement *models.Announcement) error {
	return s.repo.Create(ctx, announcement)
}

func (s *announcementService) Update(ctx context.Context, id uint, updates map[string]interface{}) error {
	_, err := s.UpdateAndGet(ctx, id, updates)
	return err
}

func (s *announcementService) UpdateAndGet(ctx context.Context, id uint, updates map[string]interface{}) (*models.Announcement, error) {
	announcement, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if title, ok := updates["title"].(string); ok {
		announcement.Title = title
	}
	if content, ok := updates["content"].(string); ok {
		announcement.Content = content
	}

	if err := s.repo.Update(ctx, announcement); err != nil {
		return nil, err
	}

	return s.repo.FindByID(ctx, id)
}

func (s *announcementService) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}

func (s *announcementService) DeleteWithReads(ctx context.Context, id uint) error {
	if err := s.repo.DeleteReadsByAnnouncementID(ctx, id); err != nil {
		return err
	}
	return s.repo.Delete(ctx, id)
}

func (s *announcementService) MarkRead(ctx context.Context, announcementID, userID uint) error {
	if _, err := s.repo.FindByID(ctx, announcementID); err != nil {
		return err
	}
	return s.repo.MarkRead(ctx, announcementID, userID)
}
