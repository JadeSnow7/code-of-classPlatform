package clients

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinioConfig holds MinIO connection settings
type MinioConfig struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	BucketName      string
	UseSSL          bool
	SignedURLExpiry time.Duration
}

// MinioClient wraps minio.Client with helper methods
type MinioClient struct {
	client          *minio.Client
	bucketName      string
	signedURLExpiry time.Duration
}

// NewMinioClient creates a new MinIO client and ensures bucket exists
func NewMinioClient(cfg MinioConfig) (*MinioClient, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	ctx := context.Background()

	// Check if bucket exists, create if not
	exists, err := client.BucketExists(ctx, cfg.BucketName)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		err = client.MakeBucket(ctx, cfg.BucketName, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	expiry := cfg.SignedURLExpiry
	if expiry == 0 {
		expiry = 7 * 24 * time.Hour // 7 days default
	}

	return &MinioClient{
		client:          client,
		bucketName:      cfg.BucketName,
		signedURLExpiry: expiry,
	}, nil
}

// UploadFile uploads a file to MinIO and returns the object key
func (m *MinioClient) UploadFile(ctx context.Context, objectKey string, reader interface{}, size int64, contentType string) error {
	_, err := m.client.PutObject(ctx, m.bucketName, objectKey, reader.(interface {
		Read([]byte) (int, error)
	}), size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}

// GetSignedURL generates a pre-signed URL for downloading an object
func (m *MinioClient) GetSignedURL(ctx context.Context, objectKey string) (string, error) {
	reqParams := make(url.Values)
	presignedURL, err := m.client.PresignedGetObject(ctx, m.bucketName, objectKey, m.signedURLExpiry, reqParams)
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}
	return presignedURL.String(), nil
}

// DeleteFile removes a file from MinIO
func (m *MinioClient) DeleteFile(ctx context.Context, objectKey string) error {
	return m.client.RemoveObject(ctx, m.bucketName, objectKey, minio.RemoveObjectOptions{})
}
