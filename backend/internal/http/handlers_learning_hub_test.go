package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/http/routes"
	"github.com/stretchr/testify/assert"
)

func makeLearningHubToken(t *testing.T, userID uint, role string) string {
	t.Helper()
	token, err := auth.SignToken("test-secret", userID, "user", role, time.Hour)
	assert.NoError(t, err)
	return token
}

func setupLearningHubRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api/v1")
	routes.RegisterLearningHubRoutes(api, "test-secret", NewLearningHubHandlers())
	return r
}

func TestLearningHubHandlers_GetDashboard(t *testing.T) {
	r := setupLearningHubRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+makeLearningHubToken(t, 1, "student"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Contains(t, resp.Data, "activity_heatmap")
	assert.Contains(t, resp.Data, "knowledge_bases_count")
	assert.Contains(t, resp.Data, "pending_assignments_count")
	assert.Contains(t, resp.Data, "writing_radar")
}

func TestLearningHubHandlers_ListKnowledgeBases(t *testing.T) {
	r := setupLearningHubRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me/knowledge-bases", nil)
	req.Header.Set("Authorization", "Bearer "+makeLearningHubToken(t, 1, "student"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[[]map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Len(t, resp.Data, 0)
}

func TestLearningHubHandlers_RequiresAuth(t *testing.T) {
	r := setupLearningHubRouter()

	for _, path := range []string{
		"/api/v1/users/me/dashboard",
		"/api/v1/users/me/knowledge-bases",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusUnauthorized, w.Code, path)
	}
}
