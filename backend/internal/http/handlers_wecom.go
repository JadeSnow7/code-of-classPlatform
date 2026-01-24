package http

import (
	"crypto/sha1"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type wecomHandlers struct {
	wecom     *clients.WecomClient
	db        *gorm.DB
	jwtSecret string
}

func newWecomHandlers(wecom *clients.WecomClient, db *gorm.DB, jwtSecret string) *wecomHandlers {
	return &wecomHandlers{
		wecom:     wecom,
		db:        db,
		jwtSecret: jwtSecret,
	}
}

// WecomLoginRequest is the request body for WeChat Work login
type WecomLoginRequest struct {
	Code string `json:"code" binding:"required"`
}

// WecomLoginResponse is the response for WeChat Work login
type WecomLoginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
}

// Login handles WeChat Work OAuth login
// POST /auth/wecom
func (h *wecomHandlers) Login(c *gin.Context) {
	if !h.wecom.IsConfigured() {
		respondError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "WeChat Work is not configured", nil)
		return
	}

	var req WecomLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "code is required", nil)
		return
	}

	ctx := c.Request.Context()

	// Exchange code for user info
	userInfo, err := h.wecom.GetUserInfoByCode(ctx, req.Code)
	if err != nil {
		respondError(c, http.StatusBadGateway, "BAD_GATEWAY", fmt.Sprintf("wecom auth failed: %v", err), nil)
		return
	}

	if userInfo.UserID == "" {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "failed to get user ID from WeChat Work", nil)
		return
	}

	// Get user details (optional, for name and other info)
	var userName string
	userDetail, err := h.wecom.GetUserDetail(ctx, userInfo.UserID)
	if err == nil && userDetail != nil {
		userName = userDetail.Name
	} else {
		userName = userInfo.UserID
	}

	// Find or create user in database by WecomUserID
	var user models.User
	result := h.db.Where("wecom_user_id = ?", userInfo.UserID).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Create new user with student role by default
			user = models.User{
				Username:     userInfo.UserID,
				PasswordHash: "", // No password for WeChat Work users
				Role:         "student",
				Name:         userName,
				WecomUserID:  userInfo.UserID,
			}
			if err := h.db.Create(&user).Error; err != nil {
				respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create user", nil)
				return
			}
		} else {
			respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "database error", nil)
			return
		}
	}

	// Update user name if changed
	if userName != "" && user.Name != userName {
		h.db.Model(&user).Update("name", userName)
	}

	// Generate JWT token
	expiresIn := 86400 // 24 hours
	token, err := auth.SignToken(h.jwtSecret, user.ID, user.Username, user.Role, time.Duration(expiresIn)*time.Second)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate token", nil)
		return
	}

	respondOK(c, WecomLoginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   expiresIn,
		UserID:      userInfo.UserID,
		Name:        userName,
	})
}

// WecomConfigRequest is the request for JS-SDK config
type WecomConfigRequest struct {
	URL string `json:"url" binding:"required"`
}

// WecomConfigResponse is the response for JS-SDK config
type WecomConfigResponse struct {
	CorpID    string `json:"corp_id"`
	AgentID   string `json:"agent_id"`
	Timestamp int64  `json:"timestamp"`
	NonceStr  string `json:"noncestr"`
	Signature string `json:"signature"`
}

// GetJSConfig returns JS-SDK configuration for the frontend
// POST /auth/wecom/jsconfig
func (h *wecomHandlers) GetJSConfig(c *gin.Context) {
	if !h.wecom.IsConfigured() {
		respondError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "WeChat Work is not configured", nil)
		return
	}

	var req WecomConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "url is required", nil)
		return
	}

	ctx := c.Request.Context()

	// Get jsapi_ticket
	ticket, err := h.wecom.GetJSAPITicket(ctx)
	if err != nil {
		respondError(c, http.StatusBadGateway, "BAD_GATEWAY", fmt.Sprintf("failed to get jsapi ticket: %v", err), nil)
		return
	}

	// Generate signature
	timestamp := time.Now().Unix()
	nonceStr := generateNonceStr(16)

	// Signature algorithm: sha1(jsapi_ticket=xxx&noncestr=xxx&timestamp=xxx&url=xxx)
	signStr := fmt.Sprintf("jsapi_ticket=%s&noncestr=%s&timestamp=%d&url=%s",
		ticket, nonceStr, timestamp, req.URL)
	h1 := sha1.New()
	h1.Write([]byte(signStr))
	signature := fmt.Sprintf("%x", h1.Sum(nil))

	respondOK(c, WecomConfigResponse{
		CorpID:    h.wecom.GetCorpID(),
		AgentID:   h.wecom.GetAgentID(),
		Timestamp: timestamp,
		NonceStr:  nonceStr,
		Signature: signature,
	})
}

// WecomOAuthURLResponse is the response for OAuth URL
type WecomOAuthURLResponse struct {
	URL string `json:"url"`
}

// GetOAuthURL returns the OAuth authorization URL
// GET /auth/wecom/oauth-url
func (h *wecomHandlers) GetOAuthURL(c *gin.Context) {
	if !h.wecom.IsConfigured() {
		respondError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "WeChat Work is not configured", nil)
		return
	}

	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "redirect_uri is required", nil)
		return
	}

	state := c.DefaultQuery("state", "STATE")

	// Build OAuth URL
	oauthURL := fmt.Sprintf(
		"https://open.weixin.qq.com/connect/oauth2/authorize?appid=%s&redirect_uri=%s&response_type=code&scope=snsapi_privateinfo&agentid=%s&state=%s#wechat_redirect",
		h.wecom.GetCorpID(),
		redirectURI,
		h.wecom.GetAgentID(),
		state,
	)

	respondOK(c, WecomOAuthURLResponse{URL: oauthURL})
}

// generateNonceStr generates a random string
func generateNonceStr(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}
