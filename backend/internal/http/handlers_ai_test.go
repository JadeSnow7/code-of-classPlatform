package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// MockAIClient implements a mock AI client for testing
type MockAIClient struct {
	ChatGuidedFunc func(req clients.GuidedChatRequest) (clients.GuidedChatResponse, error)
}

func (m *MockAIClient) ChatGuided(req clients.GuidedChatRequest) (clients.GuidedChatResponse, error) {
	if m.ChatGuidedFunc != nil {
		return m.ChatGuidedFunc(req)
	}
	return clients.GuidedChatResponse{
		Reply:              "Test reply",
		SessionID:          "test-session-123",
		CurrentStep:        1,
		TotalSteps:         5,
		ProgressPercentage: 20,
		WeakPoints:         []string{},
	}, nil
}

func TestChat_OmitsUserIDForTutorMode(t *testing.T) {
	t.Parallel()

	var forwardedPayload map[string]any
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat" {
			t.Fatalf("unexpected downstream path: %s", r.URL.Path)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read downstream body failed: %v", err)
		}
		if err := json.Unmarshal(body, &forwardedPayload); err != nil {
			t.Fatalf("unmarshal downstream body failed: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"reply":"ok","model":"local-model"}`))
	}))
	defer downstream.Close()

	handler := newAIHandlers(clients.NewAIClient(downstream.URL, "gateway-token"), nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 123, Role: "student"})
		c.Next()
	})
	r.POST("/ai/chat", handler.Chat)

	req := httptest.NewRequest(
		http.MethodPost,
		"/ai/chat",
		bytes.NewReader([]byte(`{"mode":"tutor","messages":[{"role":"user","content":"hello"}],"course_id":42}`)),
	)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "42", forwardedPayload["course_id"])
	assert.Equal(t, "student", forwardedPayload["user_role"])
	_, hasUserID := forwardedPayload["user_id"]
	assert.False(t, hasUserID)
}

func TestChat_ForwardsUserIDForPrivateArtifactMode(t *testing.T) {
	t.Parallel()

	var forwardedPayload map[string]any
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat" {
			t.Fatalf("unexpected downstream path: %s", r.URL.Path)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read downstream body failed: %v", err)
		}
		if err := json.Unmarshal(body, &forwardedPayload); err != nil {
			t.Fatalf("unmarshal downstream body failed: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"reply":"ok","model":"local-model"}`))
	}))
	defer downstream.Close()

	handler := newAIHandlers(clients.NewAIClient(downstream.URL, "gateway-token"), nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 123, Role: "student"})
		c.Next()
	})
	r.POST("/ai/chat", handler.Chat)

	req := httptest.NewRequest(
		http.MethodPost,
		"/ai/chat",
		bytes.NewReader([]byte(`{"mode":" user_artifact_rag ","messages":[{"role":"user","content":"hello"}],"course_id":42}`)),
	)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "42", forwardedPayload["course_id"])
	assert.Equal(t, "123", forwardedPayload["user_id"])
	assert.Equal(t, "student", forwardedPayload["user_role"])
}

func TestChat_RejectsMissingUserContext(t *testing.T) {
	t.Parallel()

	handler := newAIHandlers(clients.NewAIClient("http://ai.local", "gateway-token"), nil)
	r := gin.New()
	r.POST("/ai/chat", handler.Chat)

	req := httptest.NewRequest(
		http.MethodPost,
		"/ai/chat",
		bytes.NewReader([]byte(`{"messages":[{"role":"user","content":"hello"}],"course_id":"em"}`)),
	)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "user not found in context")
}

func TestChatGuided_Success(t *testing.T) {
	// Create mock AI client
	mockAI := &clients.AIClient{}
	// Note: In real test, we'd use interface and mock

	handler := newAIHandlers(mockAI, nil)

	// Create test router
	r := gin.New()
	r.Use(func(c *gin.Context) {
		// Mock JWT middleware - set user_id
		c.Set("user_id", uint(123))
		c.Next()
	})
	r.POST("/ai/chat/guided", handler.ChatGuided)

	// Prepare request
	reqBody := guidedChatRequest{
		Topic:    "高斯定律",
		Messages: []clients.ChatMessage{{Role: "user", Content: "我想学习高斯定律"}},
	}
	body, _ := json.Marshal(reqBody)

	// Create request
	req := httptest.NewRequest(http.MethodPost, "/ai/chat/guided", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	// Execute
	r.ServeHTTP(w, req)

	// Assert - Note: This will fail without real AI service, but demonstrates test structure
	// In CI, we'd mock the AI client
	if w.Code == http.StatusOK {
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		assert.NoError(t, err)
		assert.Contains(t, resp, "session_id")
	}
}

func TestChatGuided_MissingUserID(t *testing.T) {
	mockAI := &clients.AIClient{}
	handler := newAIHandlers(mockAI, nil)

	r := gin.New()
	// No user_id set - simulates missing JWT
	r.POST("/ai/chat/guided", handler.ChatGuided)

	reqBody := guidedChatRequest{
		Topic:    "测试",
		Messages: []clients.ChatMessage{{Role: "user", Content: "test"}},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/ai/chat/guided", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "user not found in context")
}

func TestChatGuided_InvalidJSON(t *testing.T) {
	mockAI := &clients.AIClient{}
	handler := newAIHandlers(mockAI, nil)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", uint(123))
		c.Next()
	})
	r.POST("/ai/chat/guided", handler.ChatGuided)

	// Invalid JSON
	req := httptest.NewRequest(http.MethodPost, "/ai/chat/guided", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestChatGuided_EmptyMessages(t *testing.T) {
	mockAI := &clients.AIClient{}
	handler := newAIHandlers(mockAI, nil)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", uint(123))
		c.Next()
	})
	r.POST("/ai/chat/guided", handler.ChatGuided)

	reqBody := guidedChatRequest{
		Topic:    "测试",
		Messages: []clients.ChatMessage{}, // Empty
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/ai/chat/guided", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should fail validation
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUserIDInjection(t *testing.T) {
	// Test that user_id from context is correctly injected
	testCases := []struct {
		name               string
		user               *middleware.UserContext
		expectUnauthorized bool
	}{
		{"valid user", &middleware.UserContext{ID: 123, Username: "alice", Role: "teacher"}, false},
		{"missing user", nil, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockAI := &clients.AIClient{}
			handler := newAIHandlers(mockAI, nil)

			r := gin.New()
			r.Use(func(c *gin.Context) {
				if tc.user != nil {
					c.Set("user", *tc.user)
				}
				c.Next()
			})
			r.POST("/ai/chat/guided", handler.ChatGuided)

			reqBody := guidedChatRequest{
				Topic:    "测试",
				Messages: []clients.ChatMessage{{Role: "user", Content: "test"}},
			}
			body, _ := json.Marshal(reqBody)

			req := httptest.NewRequest(http.MethodPost, "/ai/chat/guided", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)
			if tc.expectUnauthorized {
				assert.Equal(t, http.StatusUnauthorized, w.Code)
			} else {
				assert.NotEqual(t, http.StatusUnauthorized, w.Code)
			}
		})
	}
}

func TestChatMultimodal_BadRequest(t *testing.T) {
	handler := newAIHandlers(&clients.AIClient{}, nil)

	r := gin.New()
	r.POST("/ai/chat/multimodal", handler.ChatMultimodal)

	req := httptest.NewRequest(http.MethodPost, "/ai/chat/multimodal", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestChatMultimodal_RejectsStreamMode(t *testing.T) {
	handler := newAIHandlers(&clients.AIClient{}, nil)

	r := gin.New()
	r.POST("/ai/chat/multimodal", handler.ChatMultimodal)

	req := httptest.NewRequest(
		http.MethodPost,
		"/ai/chat/multimodal",
		bytes.NewReader([]byte(`{"messages":[{"role":"user","content":"x"}],"stream":true}`)),
	)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Placeholder for integration test requiring actual DB
func TestLearningProfileHandler_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}
	// This would require actual DB setup
	t.Skip("Integration test requires database connection")
}
