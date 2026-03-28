package http

import (
	"fmt"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"golang.org/x/sync/errgroup"
	"gorm.io/gorm"
)

type learningHubHandlers struct {
	db    *gorm.DB
	minio clients.MinIOClientInterface
}

type learningHubHeatmapCell struct {
	Date  string  `json:"date"`
	Hours float64 `json:"hours"`
}

type learningHubDashboardResponse struct {
	ActivityHeatmap         []learningHubHeatmapCell `json:"activity_heatmap"`
	KnowledgeBasesCount     int                      `json:"knowledge_bases_count"`
	PendingAssignmentsCount int                      `json:"pending_assignments_count"`
	WritingRadar            map[string]float64       `json:"writing_radar"`
}

func NewLearningHubHandlers(db *gorm.DB, minio clients.MinIOClientInterface) *learningHubHandlers {
	return &learningHubHandlers{db: db, minio: minio}
}

func (h *learningHubHandlers) GetDashboard(c *gin.Context) {
	userID, ok := getContextUint(c, "user_id")
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	if h.db == nil {
		response.OK(c, learningHubDashboardResponse{
			ActivityHeatmap:         []learningHubHeatmapCell{},
			KnowledgeBasesCount:     0,
			PendingAssignmentsCount: 0,
			WritingRadar:            map[string]float64{},
		})
		return
	}
	resp := learningHubDashboardResponse{
		ActivityHeatmap: []learningHubHeatmapCell{},
		WritingRadar:    map[string]float64{},
	}
	group, ctx := errgroup.WithContext(c.Request.Context())
	group.Go(func() error {
		var count int64
		if err := h.db.WithContext(ctx).Model(&models.KnowledgeBase{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
			return err
		}
		resp.KnowledgeBasesCount = int(count)
		return nil
	})
	group.Go(func() error {
		var events []models.LearningEvent
		if err := h.db.WithContext(ctx).Where("student_id = ?", userID).Order("created_at DESC").Limit(14).Find(&events).Error; err != nil {
			return err
		}
		heatmap := make([]learningHubHeatmapCell, 0, len(events))
		for _, event := range events {
			heatmap = append(heatmap, learningHubHeatmapCell{
				Date:  event.CreatedAt.Format("2006-01-02"),
				Hours: 1,
			})
		}
		resp.ActivityHeatmap = heatmap
		return nil
	})
	group.Go(func() error {
		var submissions []models.WritingSubmission
		if err := h.db.WithContext(ctx).Where("student_id = ?", userID).Order("updated_at DESC").Limit(5).Find(&submissions).Error; err != nil {
			return err
		}
		total := 0.0
		for _, submission := range submissions {
			total += float64(submission.WordCount)
		}
		if len(submissions) > 0 {
			resp.WritingRadar["depth"] = total / float64(len(submissions))
		}
		return nil
	})
	group.Go(func() error {
		var count int64
		if err := h.db.WithContext(ctx).Model(&models.Assignment{}).Where("deadline > ?", time.Now()).Count(&count).Error; err != nil {
			return err
		}
		resp.PendingAssignmentsCount = int(count)
		return nil
	})
	if err := group.Wait(); err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, resp)
}

func (h *learningHubHandlers) ListKnowledgeBases(c *gin.Context) {
	userID, ok := getContextUint(c, "user_id")
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	var bases []models.KnowledgeBase
	if err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", userID).Order("updated_at DESC").Find(&bases).Error; err != nil {
		response.Error(c, err)
		return
	}
	items := make([]gin.H, 0, len(bases))
	for _, base := range bases {
		var count int64
		_ = h.db.WithContext(c.Request.Context()).Model(&models.KnowledgeBaseFile{}).Where("knowledge_base_id = ?", base.ID).Count(&count).Error
		items = append(items, gin.H{
			"id":         base.ID,
			"name":       base.Name,
			"file_count": count,
			"updated_at": base.UpdatedAt.Format(time.RFC3339),
		})
	}
	response.OK(c, items)
}

func (h *learningHubHandlers) CreateKnowledgeBase(c *gin.Context) {
	userID, ok := getContextUint(c, "user_id")
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}
	base := models.KnowledgeBase{UserID: userID, Name: strings.TrimSpace(req.Name)}
	if err := h.db.WithContext(c.Request.Context()).Create(&base).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"id": base.ID, "name": base.Name, "file_count": 0})
}

func (h *learningHubHandlers) ListKnowledgeBaseFiles(c *gin.Context) {
	base, ok := h.authorizeKnowledgeBase(c)
	if !ok {
		return
	}
	var files []models.KnowledgeBaseFile
	if err := h.db.WithContext(c.Request.Context()).Where("knowledge_base_id = ?", base.ID).Order("created_at DESC").Find(&files).Error; err != nil {
		response.Error(c, err)
		return
	}
	items := make([]gin.H, 0, len(files))
	for _, file := range files {
		items = append(items, knowledgeBaseFileDTO(file))
	}
	response.OK(c, items)
}

func (h *learningHubHandlers) UploadKnowledgeBaseFile(c *gin.Context) {
	base, ok := h.authorizeKnowledgeBase(c)
	if !ok {
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.BadRequest(c, "file is required")
		return
	}
	defer file.Close()
	objectKey := fmt.Sprintf("knowledge-bases/%d/%d_%s", base.ID, time.Now().Unix(), filepath.Base(header.Filename))
	downloadURL := ""
	status := "uploaded"
	if h.minio != nil {
		if err := h.minio.UploadFile(c.Request.Context(), objectKey, file, header.Size, header.Header.Get("Content-Type")); err == nil {
			downloadURL, _ = h.minio.GetSignedURL(c.Request.Context(), objectKey)
			status = "ready"
		}
	}
	record := models.KnowledgeBaseFile{
		KnowledgeBaseID: base.ID,
		UserID:          base.UserID,
		Name:            header.Filename,
		StoragePath:     objectKey,
		DownloadURL:     downloadURL,
		SizeBytes:       header.Size,
		MimeType:        header.Header.Get("Content-Type"),
		Status:          status,
	}
	if err := h.db.WithContext(c.Request.Context()).Create(&record).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, knowledgeBaseFileDTO(record))
}

func (h *learningHubHandlers) DeleteKnowledgeBaseFile(c *gin.Context) {
	base, ok := h.authorizeKnowledgeBase(c)
	if !ok {
		return
	}
	fileID, err := strconv.ParseUint(c.Param("fileId"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid file id")
		return
	}
	var file models.KnowledgeBaseFile
	if err := h.db.WithContext(c.Request.Context()).Where("id = ? AND knowledge_base_id = ?", uint(fileID), base.ID).First(&file).Error; err != nil {
		response.NotFound(c, "knowledge base file")
		return
	}
	if h.minio != nil && strings.TrimSpace(file.StoragePath) != "" {
		_ = h.minio.DeleteFile(c.Request.Context(), file.StoragePath)
	}
	if err := h.db.WithContext(c.Request.Context()).Delete(&file).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, nil)
}

func (h *learningHubHandlers) ReindexKnowledgeBase(c *gin.Context) {
	base, ok := h.authorizeKnowledgeBase(c)
	if !ok {
		return
	}
	response.OK(c, gin.H{
		"job_id": fmt.Sprintf("kbjob_%d_%d", base.ID, time.Now().Unix()),
		"status": "queued",
	})
}

func (h *learningHubHandlers) authorizeKnowledgeBase(c *gin.Context) (*models.KnowledgeBase, bool) {
	userID, ok := getContextUint(c, "user_id")
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return nil, false
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid knowledge base id")
		return nil, false
	}
	var base models.KnowledgeBase
	if err := h.db.WithContext(c.Request.Context()).Where("id = ? AND user_id = ?", uint(id), userID).First(&base).Error; err != nil {
		response.NotFound(c, "knowledge base")
		return nil, false
	}
	return &base, true
}

func knowledgeBaseFileDTO(file models.KnowledgeBaseFile) gin.H {
	return gin.H{
		"id":                file.ID,
		"knowledge_base_id": file.KnowledgeBaseID,
		"name":              file.Name,
		"size_bytes":        file.SizeBytes,
		"mime_type":         file.MimeType,
		"status":            file.Status,
		"download_url":      file.DownloadURL,
		"created_at":        file.CreatedAt.Format(time.RFC3339),
		"updated_at":        file.UpdatedAt.Format(time.RFC3339),
	}
}

func getContextUint(c *gin.Context, key string) (uint, bool) {
	if key == "user_id" {
		if user, ok := middleware.GetUser(c); ok {
			return user.ID, true
		}
	}
	value, ok := c.Get(key)
	if !ok {
		return 0, false
	}
	switch v := value.(type) {
	case uint:
		return v, true
	case int:
		return uint(v), true
	default:
		return 0, false
	}
}

func totalPages(total int64, pageSize int) int {
	if pageSize <= 0 {
		return 0
	}
	return int(math.Ceil(float64(total) / float64(pageSize)))
}
