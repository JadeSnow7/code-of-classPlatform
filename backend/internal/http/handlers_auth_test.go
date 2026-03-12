package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type loginData struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int64  `json:"expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in"`
	UserID           uint   `json:"user_id"`
	Username         string `json:"username"`
	Role             string `json:"role"`
}

type inviteData struct {
	Username  string `json:"username"`
	Role      string `json:"role"`
	Expired   bool   `json:"expired"`
	Used      bool   `json:"used"`
	ExpiresAt int64  `json:"expires_at"`
}

func setupAuthTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	migrateAuthTables(t, db)

	return db
}

func setupAuthRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	userRepo := repositories.NewUserRepository(db)
	cfg := newAuthTestConfig(jwtSecret)
	authService := services.NewAuthService(userRepo, cfg)
	hAuth := newAuthHandlers(authService, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)
	r.GET("/auth/register/invite/:token", hAuth.GetInvite)
	r.POST("/auth/register/activate", hAuth.ActivateRegistration)
	r.POST("/auth/refresh", hAuth.Refresh)
	r.POST("/auth/logout", hAuth.Logout)
	r.POST("/auth/logout-all", middleware.AuthRequired(jwtSecret), hAuth.LogoutAll)
	r.GET("/auth/me", middleware.AuthRequired(jwtSecret), hAuth.Me)
	return r
}

func createTestUser(t *testing.T, db *gorm.DB, username string, password string, role string, status string) models.User {
	passwordHash, err := auth.HashPasswordWithCost(password, 4)
	assert.NoError(t, err)

	user := models.User{
		Username:     username,
		PasswordHash: passwordHash,
		Role:         role,
		Name:         "Test User",
		Status:       status,
	}
	assert.NoError(t, db.Create(&user).Error)
	return user
}

func createActivationToken(t *testing.T, db *gorm.DB, user models.User) string {
	rawToken, err := auth.GenerateOpaqueToken()
	assert.NoError(t, err)
	token := models.ActivationToken{
		UserID:       user.ID,
		TokenHash:    auth.HashOpaqueToken(rawToken),
		ExpiresAt:    time.Now().Add(24 * time.Hour).Unix(),
		InvitedBy:    1,
		RoleSnapshot: user.Role,
	}
	assert.NoError(t, db.Create(&token).Error)
	return rawToken
}

func TestLogin_Success(t *testing.T) {
	db := setupAuthTestDB(t)
	createTestUser(t, db, "alice", "pass1234", "teacher", models.UserStatusActive)

	r := setupAuthRouter(db, "test-secret")

	payload := []byte(`{"username":"alice","password":"pass1234"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[loginData]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.NotEmpty(t, resp.Data.AccessToken)
	assert.NotEmpty(t, resp.Data.RefreshToken)
	assert.Equal(t, "Bearer", resp.Data.TokenType)
	assert.Equal(t, int64(15*60), resp.Data.ExpiresIn)
	assert.Equal(t, "alice", resp.Data.Username)
	assert.Equal(t, "teacher", resp.Data.Role)
}

func TestLogin_PendingActivationBlocked(t *testing.T) {
	db := setupAuthTestDB(t)
	createTestUser(t, db, "alice", "pass1234", "teacher", models.UserStatusPendingActivation)

	r := setupAuthRouter(db, "test-secret")

	payload := []byte(`{"username":"alice","password":"pass1234"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestActivateRefreshAndMe_FullFlow(t *testing.T) {
	db := setupAuthTestDB(t)
	user := createTestUser(t, db, "alice", "temp1234", "teacher", models.UserStatusPendingActivation)
	token := createActivationToken(t, db, user)
	r := setupAuthRouter(db, "test-secret")

	inviteReq := httptest.NewRequest(http.MethodGet, "/auth/register/invite/"+token, nil)
	inviteW := httptest.NewRecorder()
	r.ServeHTTP(inviteW, inviteReq)
	assert.Equal(t, http.StatusOK, inviteW.Code)

	var inviteResp envelope[inviteData]
	assert.NoError(t, json.Unmarshal(inviteW.Body.Bytes(), &inviteResp))
	assert.Equal(t, "alice", inviteResp.Data.Username)
	assert.False(t, inviteResp.Data.Expired)
	assert.False(t, inviteResp.Data.Used)

	activatePayload := []byte(`{"token":"` + token + `","password":"newpass123","confirm_password":"newpass123"}`)
	activateReq := httptest.NewRequest(http.MethodPost, "/auth/register/activate", bytes.NewReader(activatePayload))
	activateReq.Header.Set("Content-Type", "application/json")
	activateW := httptest.NewRecorder()
	r.ServeHTTP(activateW, activateReq)
	assert.Equal(t, http.StatusOK, activateW.Code)

	var activateResp envelope[loginData]
	assert.NoError(t, json.Unmarshal(activateW.Body.Bytes(), &activateResp))
	assert.NotEmpty(t, activateResp.Data.AccessToken)
	assert.NotEmpty(t, activateResp.Data.RefreshToken)

	meReq := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+activateResp.Data.AccessToken)
	meW := httptest.NewRecorder()
	r.ServeHTTP(meW, meReq)
	assert.Equal(t, http.StatusOK, meW.Code)

	var meResp envelope[MeResponse]
	assert.NoError(t, json.Unmarshal(meW.Body.Bytes(), &meResp))
	assert.Equal(t, models.UserStatusActive, meResp.Data.Status)

	refreshPayload := []byte(`{"refresh_token":"` + activateResp.Data.RefreshToken + `"}`)
	refreshReq := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader(refreshPayload))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshW := httptest.NewRecorder()
	r.ServeHTTP(refreshW, refreshReq)
	assert.Equal(t, http.StatusOK, refreshW.Code)

	var refreshResp envelope[loginData]
	assert.NoError(t, json.Unmarshal(refreshW.Body.Bytes(), &refreshResp))
	assert.NotEqual(t, activateResp.Data.RefreshToken, refreshResp.Data.RefreshToken)

	staleReq := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader(refreshPayload))
	staleReq.Header.Set("Content-Type", "application/json")
	staleW := httptest.NewRecorder()
	r.ServeHTTP(staleW, staleReq)
	assert.Equal(t, http.StatusUnauthorized, staleW.Code)
}
