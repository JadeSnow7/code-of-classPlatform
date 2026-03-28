package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAISessionRouter(t *testing.T, ai *clients.AIClient) (*gin.Engine, *gorm.DB) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	assert.NoError(t, db.AutoMigrate(&models.AISession{}, &models.AIMessage{}, &models.AIRun{}))

	handler := NewAIHandlers(ai, db)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		userID := uint(1)
		if rawUserID := c.GetHeader("X-Test-User-ID"); rawUserID != "" {
			if parsedUserID, err := strconv.ParseUint(rawUserID, 10, 64); err == nil {
				userID = uint(parsedUserID)
			}
		}
		c.Set("user", middleware.UserContext{ID: userID, Role: "student"})
		c.Next()
	})
	r.POST("/ai/sessions", handler.CreateSession)
	r.GET("/ai/sessions/:sessionId/messages", handler.ListSessionMessages)
	r.POST("/ai/sessions/:sessionId/runs", handler.RunSession)
	return r, db
}

func setAIUser(req *http.Request, userID uint) {
	req.Header.Set("X-Test-User-ID", strconv.FormatUint(uint64(userID), 10))
}

type aiSSEEvent struct {
	Event string         `json:"event"`
	Data  map[string]any `json:"data"`
}

func parseAIEvents(t *testing.T, body string) []aiSSEEvent {
	t.Helper()
	chunks := strings.Split(strings.TrimSpace(body), "\n\n")
	events := make([]aiSSEEvent, 0, len(chunks))
	for _, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}
		var event aiSSEEvent
		for _, line := range strings.Split(chunk, "\n") {
			if strings.HasPrefix(line, "event: ") {
				event.Event = strings.TrimSpace(strings.TrimPrefix(line, "event: "))
			}
			if strings.HasPrefix(line, "data: ") {
				assert.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data: "))), &event.Data))
			}
		}
		events = append(events, event)
	}
	return events
}

func TestAIHandlers_CreateSessionAndListMessages(t *testing.T) {
	r, db := setupAISessionRouter(t, nil)

	createReq := httptest.NewRequest(http.MethodPost, "/ai/sessions", bytes.NewBufferString(`{"mode":"tutor","overriddenSystemPrompt":"Be concise"}`))
	createReq.Header.Set("Content-Type", "application/json")
	setAIUser(createReq, 1)
	createW := httptest.NewRecorder()
	r.ServeHTTP(createW, createReq)

	assert.Equal(t, http.StatusCreated, createW.Code)

	var created envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(createW.Body.Bytes(), &created))
	sessionID, _ := created.Data["session_id"].(string)
	assert.NotEmpty(t, sessionID)

	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m1", SessionID: sessionID, UserID: 1, Role: "user", Content: "hello"}).Error)
	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m2", SessionID: sessionID, UserID: 1, Role: "assistant", Content: "hi"}).Error)
	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m3", SessionID: sessionID, UserID: 1, Role: "assistant", Content: "follow up"}).Error)

	listReq := httptest.NewRequest(http.MethodGet, "/ai/sessions/"+sessionID+"/messages?page=2&limit=2", nil)
	setAIUser(listReq, 1)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)

	assert.Equal(t, http.StatusOK, listW.Code)

	var listed envelope[struct {
		Items      []map[string]any `json:"items"`
		Total      int64            `json:"total"`
		Page       int              `json:"page"`
		PageSize   int              `json:"page_size"`
		TotalPages int              `json:"total_pages"`
		HasMore    bool             `json:"has_more"`
		Cursor     string           `json:"cursor"`
		NextCursor string           `json:"next_cursor"`
	}]
	assert.NoError(t, json.Unmarshal(listW.Body.Bytes(), &listed))
	assert.Len(t, listed.Data.Items, 1)
	assert.Equal(t, int64(3), listed.Data.Total)
	assert.Equal(t, 2, listed.Data.Page)
	assert.Equal(t, 2, listed.Data.PageSize)
	assert.Equal(t, 2, listed.Data.TotalPages)
	assert.False(t, listed.Data.HasMore)
	assert.Equal(t, "m3", listed.Data.Items[0]["id"])
	assert.NotEmpty(t, listed.Data.Items[0]["created_at"])
	assert.Empty(t, listed.Data.Cursor)
	assert.Equal(t, "m3", listed.Data.NextCursor)
}

func TestAIHandlers_ListSessionMessagesSupportsCursor(t *testing.T) {
	r, db := setupAISessionRouter(t, nil)
	assert.NoError(t, db.Create(&models.AISession{SessionID: "session_cursor", UserID: 1, Mode: "tutor"}).Error)
	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m1", SessionID: "session_cursor", UserID: 1, Role: "user", Content: "hello"}).Error)
	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m2", SessionID: "session_cursor", UserID: 1, Role: "assistant", Content: "hi"}).Error)
	assert.NoError(t, db.Create(&models.AIMessage{MessageID: "m3", SessionID: "session_cursor", UserID: 1, Role: "assistant", Content: "follow up"}).Error)

	req := httptest.NewRequest(http.MethodGet, "/ai/sessions/session_cursor/messages?cursor=m1&limit=1", nil)
	setAIUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var listed envelope[struct {
		Items      []map[string]any `json:"items"`
		Page       int              `json:"page"`
		PageSize   int              `json:"page_size"`
		HasMore    bool             `json:"has_more"`
		Cursor     string           `json:"cursor"`
		NextCursor string           `json:"next_cursor"`
	}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &listed))
	assert.Len(t, listed.Data.Items, 1)
	assert.Equal(t, 1, listed.Data.Page)
	assert.Equal(t, 1, listed.Data.PageSize)
	assert.True(t, listed.Data.HasMore)
	assert.Equal(t, "m1", listed.Data.Cursor)
	assert.Equal(t, "m2", listed.Data.NextCursor)
	assert.Equal(t, "m2", listed.Data.Items[0]["id"])
}

func TestAIHandlers_SessionOwnershipGuardsMessagesAndRuns(t *testing.T) {
	r, db := setupAISessionRouter(t, nil)
	assert.NoError(t, db.Create(&models.AISession{SessionID: "session_owner", UserID: 2, Mode: "tutor"}).Error)

	listReq := httptest.NewRequest(http.MethodGet, "/ai/sessions/session_owner/messages", nil)
	setAIUser(listReq, 1)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	assert.Equal(t, http.StatusNotFound, listW.Code)

	runReq := httptest.NewRequest(http.MethodPost, "/ai/sessions/session_owner/runs", bytes.NewBufferString(`{"input":[{"role":"user","content":"hello"}],"stream":true}`))
	runReq.Header.Set("Content-Type", "application/json")
	setAIUser(runReq, 1)
	runW := httptest.NewRecorder()
	r.ServeHTTP(runW, runReq)
	assert.Equal(t, http.StatusNotFound, runW.Code)
}

func TestAIHandlers_RunSessionSuccessSSEOrder(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/chat", r.URL.Path)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"content\":\"你\"}\n\n")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\n")
	}))
	defer downstream.Close()

	r, db := setupAISessionRouter(t, clients.NewAIClient(downstream.URL, "token"))
	assert.NoError(t, db.Create(&models.AISession{SessionID: "session_success", UserID: 1, Mode: "tutor"}).Error)

	req := httptest.NewRequest(http.MethodPost, "/ai/sessions/session_success/runs", bytes.NewBufferString(`{"input":[{"id":"msg-1","role":"user","content":"你好"}],"stream":true}`))
	req.Header.Set("Content-Type", "application/json")
	setAIUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	events := parseAIEvents(t, w.Body.String())
	assert.Len(t, events, 6)
	assert.Equal(t, "run_status", events[0].Event)
	assert.Equal(t, "queued", events[0].Data["status"])
	assert.Equal(t, "run_status", events[1].Event)
	assert.Equal(t, "running", events[1].Data["status"])
	assert.Equal(t, "token", events[2].Event)
	assert.Equal(t, "你", events[2].Data["text"])
	assert.Equal(t, "token", events[3].Event)
	assert.Equal(t, "好", events[3].Data["text"])
	assert.Equal(t, "message", events[4].Event)
	assert.Equal(t, "done", events[5].Event)

	assert.Contains(t, w.Body.String(), `"message_id":`)
	assert.Contains(t, w.Body.String(), `"run_id":`)

	var run models.AIRun
	assert.NoError(t, db.Where("session_id = ?", "session_success").First(&run).Error)
	assert.Equal(t, "completed", run.Status)

	var assistant models.AIMessage
	assert.NoError(t, db.Where("session_id = ? AND role = ?", "session_success", "assistant").First(&assistant).Error)
	assert.Equal(t, "你好", assistant.Content)
}

func TestAIHandlers_RunSessionFailureEmitsErrorFailedAndDone(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream failed", http.StatusBadGateway)
	}))
	defer downstream.Close()

	r, db := setupAISessionRouter(t, clients.NewAIClient(downstream.URL, "token"))
	assert.NoError(t, db.Create(&models.AISession{SessionID: "session_failure", UserID: 1, Mode: "tutor"}).Error)

	req := httptest.NewRequest(http.MethodPost, "/ai/sessions/session_failure/runs", bytes.NewBufferString(`{"input":[{"role":"user","content":"hello"}],"stream":true}`))
	req.Header.Set("Content-Type", "application/json")
	setAIUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	body := w.Body.String()
	errorIndex := strings.Index(body, "event: error")
	failedIndex := strings.Index(body, "event: run_status\ndata: {\"code\":\"UPSTREAM_ERROR\",\"message\":")
	doneIndex := strings.LastIndex(body, "event: done")
	assert.NotEqual(t, -1, errorIndex)
	assert.NotEqual(t, -1, failedIndex)
	assert.NotEqual(t, -1, doneIndex)
	assert.True(t, errorIndex < failedIndex)
	assert.True(t, failedIndex < doneIndex)
	assert.Contains(t, body, `"status":"failed"`)
	assert.Contains(t, body, `"run_id":`)

	var run models.AIRun
	assert.NoError(t, db.Where("session_id = ?", "session_failure").First(&run).Error)
	assert.Equal(t, "failed", run.Status)
	assert.Equal(t, "UPSTREAM_ERROR", run.ErrorCode)
}
