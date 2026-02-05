package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type loginData struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	UserID      uint   `json:"user_id"`
	Username    string `json:"username"`
	Role        string `json:"role"`
}

type envelope[T any] struct {
	Success bool     `json:"success"`
	Data    T        `json:"data,omitempty"`
	Error   *apiError `json:"error,omitempty"`
}

func setupAuthTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(&models.User{})
	assert.NoError(t, err)

	return db
}

func setupAuthRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hAuth := newAuthHandlers(db, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)
	r.GET("/auth/me", middleware.AuthRequired(jwtSecret), hAuth.Me)
	return r
}

func createTestUser(t *testing.T, db *gorm.DB, username string, password string, role string) models.User {
	passwordHash, err := auth.HashPassword(password)
	assert.NoError(t, err)

	user := models.User{
		Username:     username,
		PasswordHash: passwordHash,
		Role:         role,
		Name:         "Test User",
	}
	assert.NoError(t, db.Create(&user).Error)
	return user
}

func TestLogin_Success(t *testing.T) {
	db := setupAuthTestDB(t)
	createTestUser(t, db, "alice", "pass123", "teacher")

	r := setupAuthRouter(db, "test-secret")

	payload := []byte(`{"username":"alice","password":"pass123"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[loginData]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.NotEmpty(t, resp.Data.AccessToken)
	assert.Equal(t, "Bearer", resp.Data.TokenType)
	assert.Equal(t, "alice", resp.Data.Username)
	assert.Equal(t, "teacher", resp.Data.Role)
}

func TestLogin_InvalidPassword(t *testing.T) {
	db := setupAuthTestDB(t)
	createTestUser(t, db, "alice", "pass123", "teacher")

	r := setupAuthRouter(db, "test-secret")

	payload := []byte(`{"username":"alice","password":"wrong"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var resp envelope[loginData]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.NotNil(t, resp.Error)
	assert.Equal(t, "INVALID_CREDENTIALS", resp.Error.Code)
}

func TestLogin_InvalidRequest(t *testing.T) {
	db := setupAuthTestDB(t)
	createTestUser(t, db, "alice", "pass123", "teacher")

	r := setupAuthRouter(db, "test-secret")

	payload := []byte(`{"username":"alice"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp envelope[loginData]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.NotNil(t, resp.Error)
	assert.Equal(t, "INVALID_REQUEST", resp.Error.Code)
}

func TestMe_Success(t *testing.T) {
	db := setupAuthTestDB(t)
	user := createTestUser(t, db, "alice", "pass123", "teacher")

	r := setupAuthRouter(db, "test-secret")

	// 登录获取token
	payload := []byte(`{"username":"alice","password":"pass123"}`)
	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()
	r.ServeHTTP(loginW, loginReq)

	var loginResp envelope[loginData]
	assert.NoError(t, json.Unmarshal(loginW.Body.Bytes(), &loginResp))
	assert.True(t, loginResp.Success)

	// 调用 /auth/me
	meReq := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+loginResp.Data.AccessToken)
	meW := httptest.NewRecorder()
	r.ServeHTTP(meW, meReq)

	assert.Equal(t, http.StatusOK, meW.Code)

	var meResp envelope[MeResponse]
	assert.NoError(t, json.Unmarshal(meW.Body.Bytes(), &meResp))
	assert.True(t, meResp.Success)
	assert.Equal(t, user.ID, meResp.Data.ID)
	assert.Equal(t, user.Username, meResp.Data.Username)
	assert.Equal(t, user.Role, meResp.Data.Role)
	assert.NotEmpty(t, meResp.Data.Permissions)
}
