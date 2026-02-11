package http

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
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
	service services.UploadService
}

func NewUploadHandlers(service services.UploadService) *uploadHandlers {
	return &uploadHandlers{service: service}
}

func newUploadHandlers(service services.UploadService) *uploadHandlers {
	return NewUploadHandlers(service)
}

// UploadAssignmentFile handles file upload for assignment submissions
// Route: POST /upload/assignment/:assignmentId
func (h *uploadHandlers) UploadAssignmentFile(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	assignmentID, err := strconv.ParseUint(c.Param("assignmentId"), 10, 64)
	if err != nil || assignmentID == 0 {
		response.BadRequest(c, "Assignment ID is required")
		return
	}

	if err := h.service.AuthorizeAssignmentUpload(c.Request.Context(), uint(assignmentID), user.ID, user.Role); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Assignment")
		case errors.Is(err, services.ErrAccessDeniedService):
			response.Forbidden(c, "Only students can submit assignments")
		default:
			response.Error(c, err)
		}
		return
	}

	signedURL, filename, err := h.processUpload(c, assignmentAllowedExts, assignmentMaxSize, func(file multipart.File, header *multipart.FileHeader, contentType string) (string, error) {
		return h.service.UploadAssignmentFile(c.Request.Context(), uint(assignmentID), header.Filename, file, header.Size, contentType)
	})
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

	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil || courseID == 0 {
		response.BadRequest(c, "Course ID is required")
		return
	}

	if err := h.service.AuthorizeResourceUpload(c.Request.Context(), uint(courseID), user.ID, user.Role); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Course")
		case errors.Is(err, services.ErrAccessDeniedService):
			response.Forbidden(c, "Only the course teacher or admin can upload resources")
		default:
			response.Error(c, err)
		}
		return
	}

	signedURL, filename, err := h.processUpload(c, resourceAllowedExts, resourceMaxSize, func(file multipart.File, header *multipart.FileHeader, contentType string) (string, error) {
		return h.service.UploadResourceFile(c.Request.Context(), uint(courseID), header.Filename, file, header.Size, contentType)
	})
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"signed_url": signedURL,
		"filename":   filename,
	})
}

func (h *uploadHandlers) processUpload(
	c *gin.Context,
	allowedExts map[string]bool,
	maxSize int64,
	uploadFn func(file multipart.File, header *multipart.FileHeader, contentType string) (string, error),
) (string, string, error) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		return "", "", fmt.Errorf("file is required")
	}
	defer file.Close()

	if header.Size > maxSize {
		return "", "", fmt.Errorf("file size exceeds limit of %dMB", maxSize/(1<<20))
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExts[ext] {
		return "", "", fmt.Errorf("file type %s is not allowed", ext)
	}

	if err := h.validateMIME(file, ext); err != nil {
		return "", "", err
	}
	_, _ = file.Seek(0, io.SeekStart)

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	signedURL, err := uploadFn(file, header, contentType)
	if err != nil {
		return "", "", fmt.Errorf("failed to upload file: %w", err)
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
