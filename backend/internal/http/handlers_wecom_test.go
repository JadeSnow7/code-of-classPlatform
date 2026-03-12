package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

func setupWecomRouter(t *testing.T, status string) (*gin.Engine, *gorm.DB) {
	db := setupAuthTestDB(t)
	user := models.User{
		Username:     "wecom-user",
		PasswordHash: mustHashWecomPassword(),
		Role:         "student",
		Name:         "WeCom User",
		Status:       status,
		WecomUserID:  "wecom-user",
	}
	assert.NoError(t, db.Create(&user).Error)

	userRepo := repositories.NewUserRepository(db)
	authService := services.NewAuthService(userRepo, newAuthTestConfig("test-secret"))
	handler := newWecomHandlers(
		clients.NewWecomClient(clients.WecomConfig{CorpID: "corp", AgentID: "agent", Secret: "secret"}),
		db,
		authService,
	)
	handler.getUserInfo = func(context.Context, string) (*clients.UserInfo, error) {
		return &clients.UserInfo{UserID: "wecom-user"}, nil
	}
	handler.getUserDetail = func(context.Context, string) (*clients.UserDetail, error) {
		return &clients.UserDetail{UserID: "wecom-user", Name: "WeCom User"}, nil
	}

	r := gin.New()
	r.POST("/auth/wecom", handler.Login)
	return r, db
}

func TestWecomLogin_RejectsNonActiveUsers(t *testing.T) {
	tests := []struct {
		name    string
		status  string
		message string
	}{
		{name: "disabled", status: models.UserStatusDisabled, message: "Account is disabled"},
		{name: "pending activation", status: models.UserStatusPendingActivation, message: "Complete invitation activation before login"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, db := setupWecomRouter(t, tt.status)

			payload := []byte(`{"code":"test-code"}`)
			req := httptest.NewRequest(http.MethodPost, "/auth/wecom", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusForbidden, w.Code)

			var resp envelope[map[string]any]
			assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
			assert.False(t, resp.Success)
			assert.Equal(t, "ACCESS_DENIED", resp.Error.Code)
			assert.Equal(t, tt.message, resp.Error.Message)

			var count int64
			assert.NoError(t, db.Model(&models.RefreshSession{}).Count(&count).Error)
			assert.Zero(t, count)
		})
	}
}
