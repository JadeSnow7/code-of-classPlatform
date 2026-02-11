package services

import (
	"context"
	"testing"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type fakeAnnouncementRepo struct {
	repositories.AnnouncementRepository
	announcements []*models.Announcement
	reads         []models.AnnouncementRead
	unreadCount   int64
	totalCount    int64
	latest        *models.Announcement
	byID          map[uint]*models.Announcement
	deletedReads  []uint
	deleted       []uint
	updated       *models.Announcement
	markReadCalls [][2]uint
}

func (f *fakeAnnouncementRepo) CountByCourseID(context.Context, uint) (int64, error) {
	return f.totalCount, nil
}

func (f *fakeAnnouncementRepo) GetUnreadCount(context.Context, uint, uint) (int64, error) {
	return f.unreadCount, nil
}

func (f *fakeAnnouncementRepo) FindLatestByCourseID(context.Context, uint) (*models.Announcement, error) {
	if f.latest == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.latest, nil
}

func (f *fakeAnnouncementRepo) FindByCourseID(context.Context, uint) ([]*models.Announcement, error) {
	return f.announcements, nil
}

func (f *fakeAnnouncementRepo) FindReadByAnnouncementIDsAndUser(context.Context, []uint, uint) ([]models.AnnouncementRead, error) {
	return f.reads, nil
}

func (f *fakeAnnouncementRepo) FindByID(_ context.Context, id uint) (*models.Announcement, error) {
	if f.byID == nil || f.byID[id] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.byID[id], nil
}

func (f *fakeAnnouncementRepo) Update(_ context.Context, announcement *models.Announcement) error {
	f.updated = announcement
	if f.byID != nil {
		f.byID[announcement.ID] = announcement
	}
	return nil
}

func (f *fakeAnnouncementRepo) DeleteReadsByAnnouncementID(_ context.Context, id uint) error {
	f.deletedReads = append(f.deletedReads, id)
	return nil
}

func (f *fakeAnnouncementRepo) Delete(_ context.Context, id uint) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func (f *fakeAnnouncementRepo) MarkRead(_ context.Context, announcementID, userID uint) error {
	f.markReadCalls = append(f.markReadCalls, [2]uint{announcementID, userID})
	return nil
}

func TestAnnouncementService_GetSummary_Success(t *testing.T) {
	now := time.Now()
	repo := &fakeAnnouncementRepo{
		totalCount:  8,
		unreadCount: 3,
		latest: &models.Announcement{
			Model: gorm.Model{ID: 99, CreatedAt: now},
			Title: "Latest",
		},
	}
	svc := NewAnnouncementService(repo)

	summary, err := svc.GetSummary(context.Background(), 1, 2)
	assert.NoError(t, err)
	assert.Equal(t, 8, summary.TotalCount)
	assert.Equal(t, 3, summary.UnreadCount)
	assert.NotNil(t, summary.Latest)
	assert.Equal(t, uint(99), summary.Latest.ID)
	assert.Equal(t, "Latest", summary.Latest.Title)
}

func TestAnnouncementService_ListWithReadStatus_MapsReadFlag(t *testing.T) {
	repo := &fakeAnnouncementRepo{
		announcements: []*models.Announcement{
			{Model: gorm.Model{ID: 1}, Title: "A"},
			{Model: gorm.Model{ID: 2}, Title: "B"},
		},
		reads: []models.AnnouncementRead{
			{AnnouncementID: 2, UserID: 10},
		},
	}
	svc := NewAnnouncementService(repo)

	items, err := svc.ListWithReadStatus(context.Background(), 1, 10)
	assert.NoError(t, err)
	assert.Len(t, items, 2)
	assert.False(t, items[0].IsRead)
	assert.True(t, items[1].IsRead)
}

func TestAnnouncementService_UpdateAndGet_Success(t *testing.T) {
	repo := &fakeAnnouncementRepo{
		byID: map[uint]*models.Announcement{
			7: {
				Model:   gorm.Model{ID: 7},
				Title:   "Old",
				Content: "Old content",
			},
		},
	}
	svc := NewAnnouncementService(repo)

	updated, err := svc.UpdateAndGet(context.Background(), 7, map[string]interface{}{
		"title":   "New",
		"content": "New content",
	})
	assert.NoError(t, err)
	assert.NotNil(t, repo.updated)
	assert.Equal(t, "New", repo.updated.Title)
	assert.Equal(t, "New content", repo.updated.Content)
	assert.Equal(t, "New", updated.Title)
	assert.Equal(t, "New content", updated.Content)
}

func TestAnnouncementService_DeleteWithReads_DeletesBoth(t *testing.T) {
	repo := &fakeAnnouncementRepo{}
	svc := NewAnnouncementService(repo)

	err := svc.DeleteWithReads(context.Background(), 5)
	assert.NoError(t, err)
	assert.Equal(t, []uint{5}, repo.deletedReads)
	assert.Equal(t, []uint{5}, repo.deleted)
}

func TestAnnouncementService_MarkRead_NotFound(t *testing.T) {
	repo := &fakeAnnouncementRepo{}
	svc := NewAnnouncementService(repo)

	err := svc.MarkRead(context.Background(), 123, 9)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
