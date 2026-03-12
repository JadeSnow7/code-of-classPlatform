package http

import (
	"context"
	"crypto/sha1"
	"fmt"
	"math/rand"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type wecomHandlers struct {
	wecom         *clients.WecomClient
	db            *gorm.DB
	authService   services.AuthService
	getUserInfo   func(ctx context.Context, code string) (*clients.UserInfo, error)
	getUserDetail func(ctx context.Context, userID string) (*clients.UserDetail, error)
}

func NewWecomHandlers(wecom *clients.WecomClient, db *gorm.DB, authService services.AuthService) *wecomHandlers {
	return &wecomHandlers{
		wecom:         wecom,
		db:            db,
		authService:   authService,
		getUserInfo:   wecom.GetUserInfoByCode,
		getUserDetail: wecom.GetUserDetail,
	}
}

func newWecomHandlers(wecom *clients.WecomClient, db *gorm.DB, authService services.AuthService) *wecomHandlers {
	return NewWecomHandlers(wecom, db, authService)
}

// WecomLoginRequest is the request body for WeChat Work login
type WecomLoginRequest struct {
	Code string `json:"code" binding:"required"`
}

// WecomLoginResponse is the response for WeChat Work login
type WecomLoginResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token,omitempty"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int64  `json:"expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in,omitempty"`
	UserID           uint   `json:"user_id"`
	Username         string `json:"username"`
	Role             string `json:"role"`
	Name             string `json:"name"`
}

// Login handles WeChat Work OAuth login
// POST /auth/wecom
func (h *wecomHandlers) Login(c *gin.Context) {
	if !h.wecom.IsConfigured() {
		response.BadRequest(c, "WeChat Work is not configured")
		return
	}

	var req WecomLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "code is required")
		return
	}

	ctx := c.Request.Context()

	// Exchange code for user info
	userInfo, err := h.getUserInfo(ctx, req.Code)
	if err != nil {
		response.BadRequest(c, fmt.Sprintf("wecom auth failed: %v", err))
		return
	}

	if userInfo.UserID == "" {
		response.Unauthorized(c, "failed to get user ID from WeChat Work")
		return
	}

	// Get user details (optional, for name and other info)
	var userName string
	userDetail, err := h.getUserDetail(ctx, userInfo.UserID)
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
				PasswordHash: mustHashWecomPassword(),
				Role:         "student",
				Name:         userName,
				Status:       models.UserStatusActive,
				WecomUserID:  userInfo.UserID,
			}
			if err := h.db.Create(&user).Error; err != nil {
				response.BadRequest(c, "failed to create user")
				return
			}
		} else {
			response.BadRequest(c, "database error")
			return
		}
	}

	// Update user name if changed
	if userName != "" && user.Name != userName {
		h.db.Model(&user).Update("name", userName)
	}
	if user.Status == models.UserStatusPendingActivation {
		response.Forbidden(c, "Complete invitation activation before login")
		return
	}
	if user.Status == models.UserStatusDisabled {
		response.Forbidden(c, "Account is disabled")
		return
	}

	session, err := h.authService.IssueSession(c.Request.Context(), &user, services.AuthSessionMeta{
		ClientType: "wecom",
		IP:         c.ClientIP(),
		UserAgent:  c.GetHeader("User-Agent"),
	})
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, WecomLoginResponse{
		AccessToken:      session.AccessToken,
		RefreshToken:     session.RefreshToken,
		TokenType:        session.TokenType,
		ExpiresIn:        session.ExpiresIn,
		RefreshExpiresIn: session.RefreshExpiresIn,
		UserID:           user.ID,
		Username:         user.Username,
		Role:             user.Role,
		Name:             userName,
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
		response.BadRequest(c, "WeChat Work is not configured")
		return
	}

	var req WecomConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "url is required")
		return
	}

	ctx := c.Request.Context()

	// Get jsapi_ticket
	ticket, err := h.wecom.GetJSAPITicket(ctx)
	if err != nil {
		response.BadRequest(c, fmt.Sprintf("failed to get jsapi ticket: %v", err))
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

	response.OK(c, WecomConfigResponse{
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
		response.BadRequest(c, "WeChat Work is not configured")
		return
	}

	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		response.BadRequest(c, "redirect_uri is required")
		return
	}

	state := c.DefaultQuery("state", "STATE")
	scope := c.DefaultQuery("scope", "snsapi_base")

	// Build OAuth URL
	oauthURL := fmt.Sprintf(
		"https://open.weixin.qq.com/connect/oauth2/authorize?appid=%s&redirect_uri=%s&response_type=code&scope=%s&agentid=%s&state=%s#wechat_redirect",
		h.wecom.GetCorpID(),
		url.QueryEscape(redirectURI),
		url.QueryEscape(scope),
		h.wecom.GetAgentID(),
		url.QueryEscape(state),
	)

	response.OK(c, WecomOAuthURLResponse{URL: oauthURL})
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

func mustHashWecomPassword() string {
	token, err := auth.GenerateOpaqueToken()
	if err != nil {
		return "wecom-only"
	}
	hash, err := auth.HashPassword(token)
	if err != nil {
		return "wecom-only"
	}
	return hash
}
