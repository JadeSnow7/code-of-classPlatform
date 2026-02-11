package services

import (
	"context"
	"testing"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type fakeResourceRepo struct {
	repositories.ResourceRepository
	courseByID map[uint]*models.Course
	byID       map[uint]*models.Resource
	created    *models.Resource
	deletedIDs []uint
}

func (f *fakeResourceRepo) FindCourseByID(_ context.Context, courseID uint) (*models.Course, error) {
	if f.courseByID == nil || f.courseByID[courseID] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.courseByID[courseID], nil
}

func (f *fakeResourceRepo) Create(_ context.Context, resource *models.Resource) error {
	f.created = resource
	return nil
}

func (f *fakeResourceRepo) FindByID(_ context.Context, id uint) (*models.Resource, error) {
	if f.byID == nil || f.byID[id] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.byID[id], nil
}

func (f *fakeResourceRepo) Delete(_ context.Context, id uint) error {
	f.deletedIDs = append(f.deletedIDs, id)
	return nil
}

func TestResourceService_CreateWithPermission_Denied(t *testing.T) {
	repo := &fakeResourceRepo{
		courseByID: map[uint]*models.Course{
			10: {Model: gorm.Model{ID: 10}, TeacherID: 99},
		},
	}
	svc := NewResourceService(repo)

	err := svc.CreateWithPermission(context.Background(), &models.Resource{CourseID: 10}, 1, "teacher")
	assert.ErrorIs(t, err, ErrAccessDeniedService)
}

func TestResourceService_CreateWithPermission_AdminAllowed(t *testing.T) {
	repo := &fakeResourceRepo{
		courseByID: map[uint]*models.Course{
			10: {Model: gorm.Model{ID: 10}, TeacherID: 99},
		},
	}
	svc := NewResourceService(repo)

	resource := &models.Resource{CourseID: 10, Title: "R"}
	err := svc.CreateWithPermission(context.Background(), resource, 1, "admin")
	assert.NoError(t, err)
	assert.Equal(t, resource, repo.created)
}

func TestResourceService_DeleteWithPermission_Denied(t *testing.T) {
	repo := &fakeResourceRepo{
		byID: map[uint]*models.Resource{
			5: {Model: gorm.Model{ID: 5}, CreatedByID: 100},
		},
	}
	svc := NewResourceService(repo)

	err := svc.DeleteWithPermission(context.Background(), 5, 101, "teacher")
	assert.ErrorIs(t, err, ErrAccessDeniedService)
	assert.Empty(t, repo.deletedIDs)
}

func TestResourceService_DeleteWithPermission_OwnerAllowed(t *testing.T) {
	repo := &fakeResourceRepo{
		byID: map[uint]*models.Resource{
			6: {Model: gorm.Model{ID: 6}, CreatedByID: 101},
		},
	}
	svc := NewResourceService(repo)

	err := svc.DeleteWithPermission(context.Background(), 6, 101, "teacher")
	assert.NoError(t, err)
	assert.Equal(t, []uint{6}, repo.deletedIDs)
}
