package services

import (
	"context"
	"testing"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
)

type fakeGlobalProfileRepo struct {
	repositories.GlobalProfileRepository
	pageStudentID uint
	pagePage      int
	pageSize      int
	pageCourseID  *uint
	events        []*models.LearningEvent
	total         int64
}

func (f *fakeGlobalProfileRepo) GetTimelinePage(_ context.Context, studentID uint, page, pageSize int, courseID *uint) ([]*models.LearningEvent, int64, error) {
	f.pageStudentID = studentID
	f.pagePage = page
	f.pageSize = pageSize
	f.pageCourseID = courseID
	return f.events, f.total, nil
}

func TestGlobalProfileService_GetLearningTimelinePage_ForwardsArgs(t *testing.T) {
	courseID := uint(66)
	repo := &fakeGlobalProfileRepo{
		events: []*models.LearningEvent{
			{ID: 1, EventType: "quiz_submit"},
		},
		total: 12,
	}
	svc := NewGlobalProfileService(repo)

	items, total, err := svc.GetLearningTimelinePage(context.Background(), 9, 2, 20, &courseID)
	assert.NoError(t, err)
	assert.Equal(t, uint(9), repo.pageStudentID)
	assert.Equal(t, 2, repo.pagePage)
	assert.Equal(t, 20, repo.pageSize)
	assert.NotNil(t, repo.pageCourseID)
	assert.Equal(t, courseID, *repo.pageCourseID)
	assert.Len(t, items, 1)
	assert.Equal(t, int64(12), total)
}
