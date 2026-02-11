package http

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

// File validation constants
var (
	// Assignment submissions
	assignmentAllowedExts = map[string]bool{
		".pdf": true, ".doc": true, ".docx": true, ".txt": true, ".zip": true,
	}
	assignmentMaxSize = int64(20 << 20) // 20MB

	// Course resources
	resourceAllowedExts = map[string]bool{
		".pdf": true, ".mp4": true, ".pptx": true, ".zip": true, ".doc": true, ".docx": true,
	}
	resourceMaxSize = int64(100 << 20) // 100MB
)

type uploadHandlers struct {
	db          *gorm.DB
	minioClient *clients.MinioClient
}

func newUploadHandlers(db *gorm.DB, minioClient *clients.MinioClient) *uploadHandlers {
	return &uploadHandlers{
		db:          db,
		minioClient: minioClient,
	}
}

// UploadAssignmentFile handles file upload for assignment submissions
// Route: POST /upload/assignment/:assignmentId
func (h *uploadHandlers) UploadAssignmentFile(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	assignmentID := c.Param("assignmentId")
	if assignmentID == "" {
		response.BadRequest(c, "Assignment ID is required")
		return
	}

	// Verify assignment exists and user can submit
	var assignment models.Assignment
	if err := h.db.First(&assignment, assignmentID).Error; err != nil {
		response.NotFound(c, "Assignment")
		return
	}

	// Check if user is a student (for now, any authenticated user can submit)
	if user.Role != "student" && user.Role != "admin" {
		response.Forbidden(c, "Only students can submit assignments")
		return
	}

	// Process file upload
	signedURL, filename, err := h.processUpload(c, "assignments", assignmentAllowedExts, assignmentMaxSize)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"signed_url": signedURL,
		"filename":   filename,
	})
}

// UploadResourceFile handles file upload for course resources
// Route: POST /upload/resource/:courseId
func (h *uploadHandlers) UploadResourceFile(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	courseID := c.Param("courseId")
	if courseID == "" {
		response.BadRequest(c, "Course ID is required")
		return
	}

	// Verify course exists
	var course models.Course
	if err := h.db.First(&course, courseID).Error; err != nil {
		response.NotFound(c, "Course")
		return
	}

	// Only course teacher or admin can upload resources
	if course.TeacherID != user.ID && user.Role != "admin" {
		response.Forbidden(c, "Only the course teacher or admin can upload resources")
		return
	}

	// Process file upload
	signedURL, filename, err := h.processUpload(c, "resources", resourceAllowedExts, resourceMaxSize)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"signed_url": signedURL,
		"filename":   filename,
	})
}

// processUpload handles the common upload logic (keep in handler - file processing complex)
func (h *uploadHandlers) processUpload(c *gin.Context, prefix string, allowedExts map[string]bool, maxSize int64) (string, string, error) {
	// Check if MinIO is available
	if h.minioClient == nil {
		return "", "", fmt.Errorf("file upload is currently disabled (storage not configured)")
	}

	// Get the file from form
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		return "", "", fmt.Errorf("file is required")
	}
	defer file.Close()

	// Validate file size
	if header.Size > maxSize {
		return "", "", fmt.Errorf("file size exceeds limit of %dMB", maxSize/(1<<20))
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExts[ext] {
		return "", "", fmt.Errorf("file type %s is not allowed", ext)
	}

	// Validate MIME type (double check)
	if err := h.validateMIME(file, ext); err != nil {
		return "", "", err
	}
	file.Seek(0, io.SeekStart) // Reset reader position

	// Generate unique object key
	objectKey := fmt.Sprintf("%s/%s/%s%s",
		prefix,
		time.Now().Format("2006-01-02"),
		uuid.New().String(),
		ext,
	)

	// Upload to MinIO
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := h.minioClient.UploadFile(c.Request.Context(), objectKey, file, header.Size, contentType); err != nil {
		return "", "", fmt.Errorf("failed to upload file: %w", err)
	}

	// Generate signed URL
	signedURL, err := h.minioClient.GetSignedURL(c.Request.Context(), objectKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate URL: %w", err)
	}

	return signedURL, header.Filename, nil
}

// validateMIME checks the file's actual content type
func (h *uploadHandlers) validateMIME(file multipart.File, expectedExt string) error {
	// Read first 512 bytes for MIME detection
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return fmt.Errorf("failed to read file")
	}

	mimeType := http.DetectContentType(buffer[:n])

	// Basic MIME validation
	switch expectedExt {
	case ".pdf":
		if !strings.HasPrefix(mimeType, "application/pdf") && !strings.HasPrefix(mimeType, "application/octet-stream") {
			return fmt.Errorf("file content does not match PDF format")
		}
	case ".mp4":
		if !strings.HasPrefix(mimeType, "video/") && !strings.HasPrefix(mimeType, "application/octet-stream") {
			return fmt.Errorf("file content does not match video format")
		}
	case ".zip":
		if !strings.HasPrefix(mimeType, "application/zip") && !strings.HasPrefix(mimeType, "application/octet-stream") {
			return fmt.Errorf("file content does not match ZIP format")
		}
		// Allow doc/docx/txt/pptx with relaxed validation
	}

	return nil
}
