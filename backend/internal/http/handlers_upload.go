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
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
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
// Requires: authenticated student who belongs to the assignment's course
func (h *uploadHandlers) UploadAssignmentFile(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	assignmentID := c.Param("assignmentId")
	if assignmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assignment ID is required"})
		return
	}

	// Verify assignment exists and user can submit
	var assignment models.Assignment
	if err := h.db.First(&assignment, assignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "assignment not found"})
		return
	}

	// Check if user is a student (for now, any authenticated user can submit)
	// In production, you'd check course enrollment
	if user.Role != "student" && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only students can submit assignments"})
		return
	}

	// Process file upload
	signedURL, filename, err := h.processUpload(c, "assignments", assignmentAllowedExts, assignmentMaxSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"signed_url": signedURL,
		"filename":   filename,
	})
}

// UploadResourceFile handles file upload for course resources
// Route: POST /upload/resource/:courseId
// Requires: authenticated teacher or admin of the course
func (h *uploadHandlers) UploadResourceFile(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	courseID := c.Param("courseId")
	if courseID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course ID is required"})
		return
	}

	// Verify course exists
	var course models.Course
	if err := h.db.First(&course, courseID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}

	// Only course teacher or admin can upload resources
	if course.TeacherID != user.ID && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the course teacher or admin can upload resources"})
		return
	}

	// Process file upload
	signedURL, filename, err := h.processUpload(c, "resources", resourceAllowedExts, resourceMaxSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"signed_url": signedURL,
		"filename":   filename,
	})
}

// processUpload handles the common upload logic
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
