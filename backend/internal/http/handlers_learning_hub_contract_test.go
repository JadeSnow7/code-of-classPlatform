package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/http/routes"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupLearningHubContractRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dsn := fmt.Sprintf("file:%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	assert.NoError(t, err)
	sqlDB, err := db.DB()
	assert.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	assert.NoError(t, db.AutoMigrate(&models.KnowledgeBase{}, &models.KnowledgeBaseFile{}, &models.LearningEvent{}, &models.Assignment{}, &models.WritingSubmission{}))
	r := gin.New()
	api := r.Group("/api/v1")
	routes.RegisterLearningHubRoutes(api, "test-secret", NewLearningHubHandlers(db, nil))
	return r, db
}

func authLearningHubReq(t *testing.T, req *http.Request, userID uint) {
	t.Helper()
	token, err := auth.SignToken("test-secret", userID, "user", "student", time.Hour)
	assert.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
}

func TestLearningHubDashboard_UsesSnakeCaseContract(t *testing.T) {
	r, db := setupLearningHubContractRouter(t)

	assert.NoError(t, db.Create(&models.KnowledgeBase{UserID: 1, Name: "KB 1"}).Error)
	assert.NoError(t, db.Create(&models.KnowledgeBase{UserID: 1, Name: "KB 2"}).Error)
	assert.NoError(t, db.Create(&models.KnowledgeBase{UserID: 2, Name: "Other"}).Error)
	assert.NoError(t, db.Create(&models.LearningEvent{StudentID: 1, EventType: "reading"}).Error)
	assert.NoError(t, db.Create(&models.WritingSubmission{StudentID: 1, CourseID: 1, WritingType: "course_paper", Title: "A", WordCount: 120}).Error)
	assert.NoError(t, db.Create(&models.WritingSubmission{StudentID: 1, CourseID: 1, WritingType: "course_paper", Title: "B", WordCount: 180}).Error)
	deadline := time.Now().Add(24 * time.Hour)
	assert.NoError(t, db.Create(&models.Assignment{Title: "Future", Deadline: &deadline}).Error)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/dashboard", nil)
	authLearningHubReq(t, req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp.Data, "activity_heatmap")
	assert.Contains(t, resp.Data, "knowledge_bases_count")
	assert.Contains(t, resp.Data, "pending_assignments_count")
	assert.Contains(t, resp.Data, "writing_radar")
	assert.NotContains(t, resp.Data, "activityHeatmap")
	assert.Equal(t, float64(2), resp.Data["knowledge_bases_count"])
	assert.Equal(t, float64(1), resp.Data["pending_assignments_count"])
}

func TestLearningHubKnowledgeBaseCRUDAndOwnership(t *testing.T) {
	r, _ := setupLearningHubContractRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/users/me/knowledge-bases", bytes.NewBufferString(`{"name":"Physics Notes"}`))
	createReq.Header.Set("Content-Type", "application/json")
	authLearningHubReq(t, createReq, 1)
	createW := httptest.NewRecorder()
	r.ServeHTTP(createW, createReq)
	assert.Equal(t, http.StatusCreated, createW.Code)

	var created envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(createW.Body.Bytes(), &created))
	baseID := int(created.Data["id"].(float64))

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/knowledge-bases", nil)
	authLearningHubReq(t, listReq, 1)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	assert.Equal(t, http.StatusOK, listW.Code)

	var listed envelope[[]map[string]any]
	assert.NoError(t, json.Unmarshal(listW.Body.Bytes(), &listed))
	assert.Len(t, listed.Data, 1)
	assert.Equal(t, "Physics Notes", listed.Data[0]["name"])
	assert.Equal(t, float64(0), listed.Data[0]["file_count"])

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "notes.txt")
	assert.NoError(t, err)
	_, err = part.Write([]byte("hello knowledge base"))
	assert.NoError(t, err)
	assert.NoError(t, writer.Close())

	uploadReq := httptest.NewRequest(http.MethodPost, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/files", body)
	uploadReq.Header.Set("Content-Type", writer.FormDataContentType())
	authLearningHubReq(t, uploadReq, 1)
	uploadW := httptest.NewRecorder()
	r.ServeHTTP(uploadW, uploadReq)
	assert.Equal(t, http.StatusCreated, uploadW.Code)

	var uploaded envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(uploadW.Body.Bytes(), &uploaded))
	fileID := int(uploaded.Data["id"].(float64))
	assert.Equal(t, float64(baseID), uploaded.Data["knowledge_base_id"])
	assert.Equal(t, "notes.txt", uploaded.Data["name"])
	assert.Equal(t, "uploaded", uploaded.Data["status"])
	assert.Contains(t, uploaded.Data, "size_bytes")
	assert.Contains(t, uploaded.Data, "created_at")

	filesReq := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/files", nil)
	authLearningHubReq(t, filesReq, 1)
	filesW := httptest.NewRecorder()
	r.ServeHTTP(filesW, filesReq)
	assert.Equal(t, http.StatusOK, filesW.Code)

	var files envelope[[]map[string]any]
	assert.NoError(t, json.Unmarshal(filesW.Body.Bytes(), &files))
	assert.Len(t, files.Data, 1)

	otherFilesReq := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/files", nil)
	authLearningHubReq(t, otherFilesReq, 2)
	otherFilesW := httptest.NewRecorder()
	r.ServeHTTP(otherFilesW, otherFilesReq)
	assert.Equal(t, http.StatusNotFound, otherFilesW.Code)

	reindexReq := httptest.NewRequest(http.MethodPost, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/reindex", bytes.NewBufferString(`{}`))
	reindexReq.Header.Set("Content-Type", "application/json")
	authLearningHubReq(t, reindexReq, 1)
	reindexW := httptest.NewRecorder()
	r.ServeHTTP(reindexW, reindexReq)
	assert.Equal(t, http.StatusOK, reindexW.Code)

	var reindex envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(reindexW.Body.Bytes(), &reindex))
	assert.Equal(t, "queued", reindex.Data["status"])
	assert.Contains(t, reindex.Data, "job_id")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/files/"+strconv.Itoa(fileID), nil)
	authLearningHubReq(t, deleteReq, 1)
	deleteW := httptest.NewRecorder()
	r.ServeHTTP(deleteW, deleteReq)
	assert.Equal(t, http.StatusOK, deleteW.Code)

	filesAfterReq := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/knowledge-bases/"+strconv.Itoa(baseID)+"/files", nil)
	authLearningHubReq(t, filesAfterReq, 1)
	filesAfterW := httptest.NewRecorder()
	r.ServeHTTP(filesAfterW, filesAfterReq)

	var filesAfter envelope[[]map[string]any]
	assert.NoError(t, json.Unmarshal(filesAfterW.Body.Bytes(), &filesAfter))
	assert.Len(t, filesAfter.Data, 0)
}
