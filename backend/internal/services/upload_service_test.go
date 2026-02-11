package services

import (
	"context"
	"strings"
	"testing"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

func TestUploadService_AuthorizeAssignmentUpload_DeniedForTeacher(t *testing.T) {
	assignmentRepo := &fakeAssignmentRepoForUpload{}
	courseRepo := &fakeCourseRepoForUpload{}
	svc := NewUploadService(nil, assignmentRepo, courseRepo)

	err := svc.AuthorizeAssignmentUpload(context.Background(), 1, 1, "teacher")
	assert.ErrorIs(t, err, ErrAccessDeniedService)
}

func TestUploadService_AuthorizeAssignmentUpload_NotFound(t *testing.T) {
	assignmentRepo := &fakeAssignmentRepoForUpload{findErr: gorm.ErrRecordNotFound}
	courseRepo := &fakeCourseRepoForUpload{}
	svc := NewUploadService(nil, assignmentRepo, courseRepo)

	err := svc.AuthorizeAssignmentUpload(context.Background(), 1, 1, "student")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestUploadService_AuthorizeResourceUpload_TeacherAllowed(t *testing.T) {
	assignmentRepo := &fakeAssignmentRepoForUpload{}
	courseRepo := &fakeCourseRepoForUpload{courseTeacherID: 10}
	svc := NewUploadService(nil, assignmentRepo, courseRepo)

	err := svc.AuthorizeResourceUpload(context.Background(), 2, 10, "teacher")
	assert.NoError(t, err)
}

func TestUploadService_UploadAssignmentFile_NoStorageConfigured(t *testing.T) {
	assignmentRepo := &fakeAssignmentRepoForUpload{}
	courseRepo := &fakeCourseRepoForUpload{}
	svc := NewUploadService(nil, assignmentRepo, courseRepo)

	_, err := svc.UploadAssignmentFile(context.Background(), 1, "a.pdf", strings.NewReader("x"), 1, "application/pdf")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "storage not configured")
}

func TestUploadService_UploadAssignmentFile_Success(t *testing.T) {
	minio := &fakeMinioForUpload{signedURL: "https://example.com/signed"}
	assignmentRepo := &fakeAssignmentRepoForUpload{}
	courseRepo := &fakeCourseRepoForUpload{}
	svc := NewUploadService(minio, assignmentRepo, courseRepo)

	url, err := svc.UploadAssignmentFile(context.Background(), 3, "essay.docx", strings.NewReader("x"), 1, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	assert.NoError(t, err)
	assert.Equal(t, "https://example.com/signed", url)
	assert.True(t, strings.HasPrefix(minio.objectKey, "assignments/3/"))
	assert.True(t, strings.HasSuffix(minio.objectKey, "_essay.docx"))
}

type fakeAssignmentRepoForUpload struct {
	repositories.AssignmentRepository
	findErr error
}

func (f *fakeAssignmentRepoForUpload) FindAssignment(context.Context, uint) (*models.Assignment, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	return &models.Assignment{}, nil
}

type fakeCourseRepoForUpload struct {
	repositories.CourseRepository
	findErr         error
	courseTeacherID uint
}

func (f *fakeCourseRepoForUpload) FindByID(context.Context, uint) (*models.Course, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	return &models.Course{TeacherID: f.courseTeacherID}, nil
}

type fakeMinioForUpload struct {
	signedURL string
	objectKey string
}

func (f *fakeMinioForUpload) UploadFile(context.Context, string, interface{}, int64, string) error {
	return nil
}

func (f *fakeMinioForUpload) GetSignedURL(_ context.Context, objectKey string) (string, error) {
	f.objectKey = objectKey
	return f.signedURL, nil
}

func (f *fakeMinioForUpload) DeleteFile(context.Context, string) error { return nil }
