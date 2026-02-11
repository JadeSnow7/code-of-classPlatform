package services

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
)

type uploadService struct {
	minioClient clients.MinIOClientInterface
}

// NewUploadService 创建上传服务实例
func NewUploadService(minioClient clients.MinIOClientInterface) UploadService {
	return &uploadService{minioClient: minioClient}
}

func (s *uploadService) UploadAssignmentFile(ctx context.Context, assignmentID uint, filename string, reader interface{}, size int64, contentType string) (string, error) {
	objectKey := fmt.Sprintf("assignments/%d/%d_%s", assignmentID, time.Now().Unix(), filepath.Base(filename))

	if err := s.minioClient.UploadFile(ctx, objectKey, reader, size, contentType); err != nil {
		return "", err
	}

	return s.minioClient.GetSignedURL(ctx, objectKey)
}

func (s *uploadService) UploadResourceFile(ctx context.Context, courseID uint, filename string, reader interface{}, size int64, contentType string) (string, error) {
	objectKey := fmt.Sprintf("resources/%d/%d_%s", courseID, time.Now().Unix(), filepath.Base(filename))

	if err := s.minioClient.UploadFile(ctx, objectKey, reader, size, contentType); err != nil {
		return "", err
	}

	return s.minioClient.GetSignedURL(ctx, objectKey)
}
