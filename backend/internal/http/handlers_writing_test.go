package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type writingTestAI struct {
	clients.AIClientInterface
	resp clients.WritingAnalysisResponse
}

func (f *writingTestAI) AnalyzeWriting(_ context.Context, _ clients.WritingAnalysisRequest) (clients.WritingAnalysisResponse, error) {
	return f.resp, nil
}

func setupWritingHandlerRouter(t *testing.T, ai clients.AIClientInterface) (*gin.Engine, *gorm.DB, services.WritingService) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	assert.NoError(t, db.AutoMigrate(&models.WritingSubmission{}, &models.WritingRevision{}, &models.LearningEvent{}))

	repo := repositories.NewWritingRepository(db)
	svc := services.NewWritingService(repo, ai)
	handler := NewWritingHandlers(svc)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		userID := uint(1)
		if rawUserID := c.GetHeader("X-Test-User-ID"); rawUserID != "" {
			if parsedUserID, err := strconv.ParseUint(rawUserID, 10, 64); err == nil {
				userID = uint(parsedUserID)
			}
		}
		role := c.GetHeader("X-Test-Role")
		if role == "" {
			role = "student"
		}
		c.Set("user_id", userID)
		c.Set("role", role)
		c.Next()
	})
	r.POST("/courses/:courseId/writing-submissions", handler.CreateWritingSubmission)
	r.GET("/writing-submissions/:id", handler.GetWritingSubmissionV2)
	r.PATCH("/writing-submissions/:id", handler.UpdateWritingSubmission)
	r.POST("/writing-submissions/:id/ai-feedback", handler.RequestWritingAIFeedback)
	r.GET("/writing-submissions/:id/revisions", handler.ListWritingRevisions)

	return r, db, svc
}

func setWritingUser(req *http.Request, userID uint) {
	req.Header.Set("X-Test-User-ID", strconv.FormatUint(uint64(userID), 10))
}

func seedWritingSubmission(t *testing.T, svc services.WritingService, studentID uint, content string) *models.WritingSubmission {
	t.Helper()
	submission := &models.WritingSubmission{
		StudentID:   studentID,
		CourseID:    9,
		WritingType: "course_paper",
		Title:       "Draft",
		Content:     content,
		WordCount:   len(bytes.Fields([]byte(content))),
	}
	assert.NoError(t, svc.CreateSubmission(context.Background(), submission))
	return submission
}

func TestWritingHandlers_CreateUpdateAndListRevisions(t *testing.T) {
	r, _, _ := setupWritingHandlerRouter(t, nil)

	createReq := httptest.NewRequest(http.MethodPost, "/courses/9/writing-submissions", bytes.NewBufferString(`{"title":"My Essay","writingType":"course_paper","content":"hello world"}`))
	createReq.Header.Set("Content-Type", "application/json")
	setWritingUser(createReq, 1)
	createW := httptest.NewRecorder()
	r.ServeHTTP(createW, createReq)

	assert.Equal(t, http.StatusCreated, createW.Code)

	var created envelope[writingSubmissionDTO]
	assert.NoError(t, json.Unmarshal(createW.Body.Bytes(), &created))
	assert.True(t, created.Success)
	assert.Equal(t, "My Essay", created.Data.Title)
	assert.Equal(t, "course_paper", created.Data.WritingType)
	assert.Equal(t, 2, *created.Data.WordCount)
	assert.Equal(t, uint(1), created.Data.StudentID)

	updateReq := httptest.NewRequest(http.MethodPatch, "/writing-submissions/"+created.Data.ID, bytes.NewBufferString(`{"content":"hello brave new world"}`))
	updateReq.Header.Set("Content-Type", "application/json")
	setWritingUser(updateReq, 1)
	updateW := httptest.NewRecorder()
	r.ServeHTTP(updateW, updateReq)

	assert.Equal(t, http.StatusOK, updateW.Code)

	var updated envelope[writingSubmissionDTO]
	assert.NoError(t, json.Unmarshal(updateW.Body.Bytes(), &updated))
	assert.Equal(t, 4, *updated.Data.WordCount)
	assert.Equal(t, "hello brave new world", updated.Data.Content)

	revisionsReq := httptest.NewRequest(http.MethodGet, "/writing-submissions/"+created.Data.ID+"/revisions?page=1&pageSize=10", nil)
	setWritingUser(revisionsReq, 1)
	revisionsW := httptest.NewRecorder()
	r.ServeHTTP(revisionsW, revisionsReq)

	assert.Equal(t, http.StatusOK, revisionsW.Code)

	var revisions envelope[struct {
		Items      []writingRevisionDTO `json:"items"`
		Total      int64                `json:"total"`
		Page       int                  `json:"page"`
		PageSize   int                  `json:"pageSize"`
		TotalPages int                  `json:"totalPages"`
		HasMore    bool                 `json:"hasMore"`
	}]
	assert.NoError(t, json.Unmarshal(revisionsW.Body.Bytes(), &revisions))
	assert.Len(t, revisions.Data.Items, 2)
	assert.Equal(t, int64(2), revisions.Data.Total)
	assert.Equal(t, "autosave", revisions.Data.Items[0].TriggerType)
	assert.Equal(t, 1, revisions.Data.Page)
	assert.Equal(t, 10, revisions.Data.PageSize)
	assert.Equal(t, 1, revisions.Data.TotalPages)
	assert.False(t, revisions.Data.HasMore)
}

func TestWritingHandlers_GetSubmissionMapsFeedbackDTO(t *testing.T) {
	r, db, svc := setupWritingHandlerRouter(t, nil)
	submission := seedWritingSubmission(t, svc, 1, "alpha beta")

	assert.NoError(t, db.Model(&models.WritingSubmission{}).Where("id = ?", submission.ID).Update("feedback_json", `{
		"overall_score": 8.6,
		"summary": "Strong structure",
		"inline_suggestions": [{"start": 1, "end": 3, "text": "clarify thesis"}],
		"dimensions": [{
			"key": "structure",
			"label": "Structure",
			"score": 9,
			"comment": "Well organized",
			"suggestions": ["Add one more citation"]
		}]
	}`).Error)

	req := httptest.NewRequest(http.MethodGet, "/writing-submissions/"+strconv.FormatUint(uint64(submission.ID), 10), nil)
	setWritingUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[writingSubmissionDTO]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotNil(t, resp.Data.Feedback)
	assert.Equal(t, 8.6, resp.Data.Feedback.OverallScore)
	assert.Equal(t, "Strong structure", resp.Data.Feedback.Summary)
	assert.Len(t, resp.Data.Feedback.Dimensions, 1)
	assert.Equal(t, "structure", resp.Data.Feedback.Dimensions[0].Key)
	assert.Equal(t, "Structure", resp.Data.Feedback.Dimensions[0].Label)
	assert.Equal(t, "Well organized", resp.Data.Feedback.Dimensions[0].Comment)
	assert.Len(t, resp.Data.Feedback.InlineSuggestions, 1)
}

func TestWritingHandlers_RequestAIFeedbackAddsRevision(t *testing.T) {
	ai := &writingTestAI{
		resp: clients.WritingAnalysisResponse{
			OverallScore: 9.1,
			Summary:      "Polished draft",
			Dimensions: []clients.DimensionScore{
				{Name: "clarity", Score: 9, Comment: "Clear argument"},
			},
		},
	}
	r, _, svc := setupWritingHandlerRouter(t, ai)
	submission := seedWritingSubmission(t, svc, 1, "one two three")

	feedbackReq := httptest.NewRequest(http.MethodPost, "/writing-submissions/"+strconv.FormatUint(uint64(submission.ID), 10)+"/ai-feedback", bytes.NewBufferString(`{}`))
	feedbackReq.Header.Set("Content-Type", "application/json")
	setWritingUser(feedbackReq, 1)
	feedbackW := httptest.NewRecorder()
	r.ServeHTTP(feedbackW, feedbackReq)

	assert.Equal(t, http.StatusOK, feedbackW.Code)

	var feedbackResp envelope[writingFeedbackDTO]
	assert.NoError(t, json.Unmarshal(feedbackW.Body.Bytes(), &feedbackResp))
	assert.Equal(t, 9.1, feedbackResp.Data.OverallScore)
	assert.Equal(t, "Polished draft", feedbackResp.Data.Summary)
	assert.Len(t, feedbackResp.Data.Dimensions, 1)
	assert.Equal(t, "clarity", feedbackResp.Data.Dimensions[0].Key)
	assert.Equal(t, "Clear argument", feedbackResp.Data.Dimensions[0].Comment)

	revisionsReq := httptest.NewRequest(http.MethodGet, "/writing-submissions/"+strconv.FormatUint(uint64(submission.ID), 10)+"/revisions", nil)
	setWritingUser(revisionsReq, 1)
	revisionsW := httptest.NewRecorder()
	r.ServeHTTP(revisionsW, revisionsReq)

	var revisions envelope[struct {
		Items []writingRevisionDTO `json:"items"`
	}]
	assert.NoError(t, json.Unmarshal(revisionsW.Body.Bytes(), &revisions))
	assert.Equal(t, "ai_feedback", revisions.Data.Items[0].TriggerType)
}

func TestWritingHandlers_StudentCannotAccessOthersSubmission(t *testing.T) {
	r, _, svc := setupWritingHandlerRouter(t, nil)
	submission := seedWritingSubmission(t, svc, 2, "private draft")
	id := strconv.FormatUint(uint64(submission.ID), 10)

	cases := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodGet, path: "/writing-submissions/" + id},
		{method: http.MethodPatch, path: "/writing-submissions/" + id, body: `{"content":"tamper"}`},
		{method: http.MethodPost, path: "/writing-submissions/" + id + "/ai-feedback", body: `{}`},
		{method: http.MethodGet, path: "/writing-submissions/" + id + "/revisions"},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		setWritingUser(req, 1)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusForbidden, w.Code, tc.path)
	}
}
