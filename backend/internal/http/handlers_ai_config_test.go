package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAIConfigHandler(t *testing.T) *gin.Engine {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	assert.NoError(t, db.AutoMigrate(&models.UserAIConfig{}))

	repo := repositories.NewAIConfigRepository(db)
	svc := services.NewAIConfigService(repo)
	h := newAIConfigHandlers(svc)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 42, Role: "student"})
		c.Next()
	})
	r.GET("/users/me/ai-config", h.GetMyAIConfig)
	r.PATCH("/users/me/ai-config", h.PatchMyAIConfig)
	return r
}

func TestAIConfigHandlers_GetDefault(t *testing.T) {
	r := setupAIConfigHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/users/me/ai-config", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[services.AIConfigProfile]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "auto", resp.Data.DefaultMode)
	assert.Equal(t, "openai", resp.Data.Provider)
	assert.Equal(t, "http://localhost:8080", resp.Data.ServerURL)
	assert.Nil(t, resp.Data.APIKeyMasked)

	var raw envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &raw))
	_, hasAPIKey := raw.Data["api_key"]
	assert.False(t, hasAPIKey)
}

func TestAIConfigHandlers_PatchAndMaskAPIKey(t *testing.T) {
	r := setupAIConfigHandler(t)

	payload := []byte(`{"default_mode":"server","provider":"custom","custom_base_url":"https://example.ai","server_url":"http://localhost:8080","api_key":"sk-1234567890abcdef"}`)
	req := httptest.NewRequest(http.MethodPatch, "/users/me/ai-config", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var raw envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &raw))
	assert.True(t, raw.Success)
	assert.Equal(t, "server", raw.Data["default_mode"])
	assert.Equal(t, "custom", raw.Data["provider"])

	masked, ok := raw.Data["api_key_masked"].(string)
	assert.True(t, ok)
	assert.NotEmpty(t, masked)

	_, hasAPIKey := raw.Data["api_key"]
	assert.False(t, hasAPIKey)
}

func TestAIConfigHandlers_PatchClearAPIKey(t *testing.T) {
	r := setupAIConfigHandler(t)

	seedReq := httptest.NewRequest(http.MethodPatch, "/users/me/ai-config", bytes.NewBufferString(`{"api_key":"sk-seeded-123456789"}`))
	seedReq.Header.Set("Content-Type", "application/json")
	seedW := httptest.NewRecorder()
	r.ServeHTTP(seedW, seedReq)
	assert.Equal(t, http.StatusOK, seedW.Code)

	clearReq := httptest.NewRequest(http.MethodPatch, "/users/me/ai-config", bytes.NewBufferString(`{"api_key":""}`))
	clearReq.Header.Set("Content-Type", "application/json")
	clearW := httptest.NewRecorder()
	r.ServeHTTP(clearW, clearReq)
	assert.Equal(t, http.StatusOK, clearW.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/users/me/ai-config", nil)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)
	assert.Equal(t, http.StatusOK, getW.Code)

	var raw envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(getW.Body.Bytes(), &raw))
	_, hasMasked := raw.Data["api_key_masked"]
	assert.False(t, hasMasked)
}
