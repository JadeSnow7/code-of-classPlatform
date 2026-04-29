package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

func setupFeishuRouter(t *testing.T, status string) (*gin.Engine, *gorm.DB) {
	db := setupAuthTestDB(t)
	user := models.User{
		Username:     "feishu-user@example.com",
		PasswordHash: mustHashFeishuPassword(),
		Role:         "student",
		Name:         "Feishu User",
		Status:       status,
		FeishuOpenID: "ou_feishu_existing",
	}
	assert.NoError(t, db.Create(&user).Error)

	userRepo := repositories.NewUserRepository(db)
	authService := services.NewAuthService(userRepo, newAuthTestConfig("test-secret"))
	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{
			AppID:      "cli_test",
			AppSecret:  "secret_test",
			BotWebhook: "https://example.com/webhook",
		}),
		db,
		authService,
	)

	r := gin.New()
	r.POST("/auth/feishu", handler.Login)
	r.POST("/feishu/notify", handler.Notify)
	return r, db
}

func TestFeishuLogin_SuccessForExistingUser(t *testing.T) {
	r, db := setupFeishuRouter(t, models.UserStatusActive)

	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{AppID: "cli_test", AppSecret: "secret_test"}),
		db,
		services.NewAuthService(repositories.NewUserRepository(db), newAuthTestConfig("test-secret")),
	)
	handler.getUserInfo = func(context.Context, string) (*clients.FeishuUserInfo, error) {
		return &clients.FeishuUserInfo{
			OpenID: "ou_feishu_existing",
			Name:   "Updated Feishu User",
			Email:  "feishu-user@example.com",
			UserID: "user_1",
		}, nil
	}

	r = gin.New()
	r.POST("/auth/feishu", handler.Login)

	req := httptest.NewRequest(http.MethodPost, "/auth/feishu", bytes.NewReader([]byte(`{"code":"auth-code"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[WecomLoginResponse]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "feishu-user@example.com", resp.Data.Username)
	assert.Equal(t, "Updated Feishu User", resp.Data.Name)

	var user models.User
	assert.NoError(t, db.Where("feishu_open_id = ?", "ou_feishu_existing").First(&user).Error)
	assert.Equal(t, "Updated Feishu User", user.Name)
}

func TestFeishuLogin_CreatesUserByOpenID(t *testing.T) {
	db := setupAuthTestDB(t)
	userRepo := repositories.NewUserRepository(db)
	authService := services.NewAuthService(userRepo, newAuthTestConfig("test-secret"))
	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{AppID: "cli_test", AppSecret: "secret_test"}),
		db,
		authService,
	)
	handler.getUserInfo = func(context.Context, string) (*clients.FeishuUserInfo, error) {
		return &clients.FeishuUserInfo{
			OpenID: "ou_new_user",
			Name:   "New Feishu User",
			Email:  "new-user@example.com",
			UserID: "user_2",
		}, nil
	}

	r := gin.New()
	r.POST("/auth/feishu", handler.Login)

	req := httptest.NewRequest(http.MethodPost, "/auth/feishu", bytes.NewReader([]byte(`{"code":"auth-code"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var user models.User
	assert.NoError(t, db.Where("feishu_open_id = ?", "ou_new_user").First(&user).Error)
	assert.Equal(t, "new-user@example.com", user.Username)
	assert.Equal(t, "student", user.Role)
}

func TestFeishuLogin_RejectsNonActiveUsers(t *testing.T) {
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
			r, db := setupFeishuRouter(t, tt.status)
			handler := newFeishuHandlers(
				clients.NewFeishuClient(clients.FeishuConfig{AppID: "cli_test", AppSecret: "secret_test"}),
				db,
				services.NewAuthService(repositories.NewUserRepository(db), newAuthTestConfig("test-secret")),
			)
			handler.getUserInfo = func(context.Context, string) (*clients.FeishuUserInfo, error) {
				return &clients.FeishuUserInfo{
					OpenID: "ou_feishu_existing",
					Name:   "Feishu User",
					Email:  "feishu-user@example.com",
				}, nil
			}

			r = gin.New()
			r.POST("/auth/feishu", handler.Login)

			req := httptest.NewRequest(http.MethodPost, "/auth/feishu", bytes.NewReader([]byte(`{"code":"auth-code"}`)))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusForbidden, w.Code)

			var resp envelope[map[string]any]
			assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
			assert.False(t, resp.Success)
			assert.Equal(t, "ACCESS_DENIED", resp.Error.Code)
			assert.Equal(t, tt.message, resp.Error.Message)
		})
	}
}

func TestFeishuNotify_Success(t *testing.T) {
	db := setupAuthTestDB(t)
	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{
			AppID:      "cli_test",
			AppSecret:  "secret_test",
			BotWebhook: "https://example.com/webhook",
		}),
		db,
		services.NewAuthService(repositories.NewUserRepository(db), newAuthTestConfig("test-secret")),
	)
	handler.sendBotText = func(context.Context, string) error { return nil }

	r := gin.New()
	r.POST("/feishu/notify", handler.Notify)

	req := httptest.NewRequest(http.MethodPost, "/feishu/notify", bytes.NewReader([]byte(`{"content":"hello"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[FeishuNotifyResponse]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.True(t, resp.Data.Sent)
}

func TestFeishuNotify_RequiresConfiguredWebhook(t *testing.T) {
	db := setupAuthTestDB(t)
	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{AppID: "cli_test", AppSecret: "secret_test"}),
		db,
		services.NewAuthService(repositories.NewUserRepository(db), newAuthTestConfig("test-secret")),
	)

	r := gin.New()
	r.POST("/feishu/notify", handler.Notify)

	req := httptest.NewRequest(http.MethodPost, "/feishu/notify", bytes.NewReader([]byte(`{"content":"hello"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestFeishuNotify_PropagatesClientErrors(t *testing.T) {
	db := setupAuthTestDB(t)
	handler := newFeishuHandlers(
		clients.NewFeishuClient(clients.FeishuConfig{
			AppID:      "cli_test",
			AppSecret:  "secret_test",
			BotWebhook: "https://example.com/webhook",
		}),
		db,
		services.NewAuthService(repositories.NewUserRepository(db), newAuthTestConfig("test-secret")),
	)
	handler.sendBotText = func(context.Context, string) error { return errors.New("webhook rejected") }

	r := gin.New()
	r.POST("/feishu/notify", handler.Notify)

	req := httptest.NewRequest(http.MethodPost, "/feishu/notify", bytes.NewReader([]byte(`{"content":"hello"}`)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
