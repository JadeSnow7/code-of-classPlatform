package services

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type uploadService struct {
	minioClient   clients.MinIOClientInterface
	assignmentRepo repositories.AssignmentRepository
	courseRepo     repositories.CourseRepository
}

// NewUploadService 创建上传服务实例
func NewUploadService(
	minioClient clients.MinIOClientInterface,
	assignmentRepo repositories.AssignmentRepository,
	courseRepo repositories.CourseRepository,
) UploadService {
	return &uploadService{
		minioClient:   minioClient,
		assignmentRepo: assignmentRepo,
		courseRepo:     courseRepo,
	}
}

func (s *uploadService) AuthorizeAssignmentUpload(ctx context.Context, assignmentID, _ uint, userRole string) error {
	if _, err := s.assignmentRepo.FindAssignment(ctx, assignmentID); err != nil {
		return err
	}
	if userRole != "student" && userRole != "admin" {
		return ErrAccessDeniedService
	}
	return nil
}

func (s *uploadService) AuthorizeResourceUpload(ctx context.Context, courseID, userID uint, userRole string) error {
	course, err := s.courseRepo.FindByID(ctx, courseID)
	if err != nil {
		return err
	}
	if course.TeacherID != userID && userRole != "admin" {
		return ErrAccessDeniedService
	}
	return nil
}

func (s *uploadService) UploadAssignmentFile(ctx context.Context, assignmentID uint, filename string, reader interface{}, size int64, contentType string) (string, error) {
	objectKey := fmt.Sprintf("assignments/%d/%d_%s", assignmentID, time.Now().Unix(), filepath.Base(filename))
	if s.minioClient == nil {
		return "", errors.New("file upload is currently disabled (storage not configured)")
	}
	if err := s.minioClient.UploadFile(ctx, objectKey, reader, size, contentType); err != nil {
		return "", err
	}
	return s.minioClient.GetSignedURL(ctx, objectKey)
}

func (s *uploadService) UploadResourceFile(ctx context.Context, courseID uint, filename string, reader interface{}, size int64, contentType string) (string, error) {
	objectKey := fmt.Sprintf("resources/%d/%d_%s", courseID, time.Now().Unix(), filepath.Base(filename))
	if s.minioClient == nil {
		return "", errors.New("file upload is currently disabled (storage not configured)")
	}
	if err := s.minioClient.UploadFile(ctx, objectKey, reader, size, contentType); err != nil {
		return "", err
	}
	return s.minioClient.GetSignedURL(ctx, objectKey)
}
