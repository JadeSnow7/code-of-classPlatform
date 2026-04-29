package http

import (
	"context"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type feishuHandlers struct {
	feishu      *clients.FeishuClient
	db          *gorm.DB
	authService services.AuthService
	getUserInfo func(ctx context.Context, code string) (*clients.FeishuUserInfo, error)
	sendBotText func(ctx context.Context, content string) error
}

func NewFeishuHandlers(feishu *clients.FeishuClient, db *gorm.DB, authService services.AuthService) *feishuHandlers {
	return &feishuHandlers{
		feishu:      feishu,
		db:          db,
		authService: authService,
		getUserInfo: feishu.GetUserInfoByCode,
		sendBotText: feishu.SendBotTextMessage,
	}
}

func newFeishuHandlers(feishu *clients.FeishuClient, db *gorm.DB, authService services.AuthService) *feishuHandlers {
	return NewFeishuHandlers(feishu, db, authService)
}

type FeishuLoginRequest struct {
	Code string `json:"code" binding:"required"`
}

type FeishuNotifyRequest struct {
	Content string `json:"content" binding:"required"`
}

type FeishuNotifyResponse struct {
	Sent bool `json:"sent"`
}

// Login handles Feishu OAuth login.
// POST /auth/feishu
func (h *feishuHandlers) Login(c *gin.Context) {
	if !h.feishu.IsConfigured() {
		response.BadRequest(c, "Feishu is not configured")
		return
	}

	var req FeishuLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "code is required")
		return
	}

	userInfo, err := h.getUserInfo(c.Request.Context(), req.Code)
	if err != nil {
		response.BadRequest(c, fmt.Sprintf("feishu auth failed: %v", err))
		return
	}
	if userInfo == nil || strings.TrimSpace(userInfo.OpenID) == "" {
		response.Unauthorized(c, "failed to get open ID from Feishu")
		return
	}

	userName := firstNonEmpty(userInfo.Name, userInfo.Email, userInfo.UserID, userInfo.OpenID)
	username := firstNonEmpty(userInfo.Email, userInfo.UserID, userInfo.OpenID)

	var user models.User
	result := h.db.Where("feishu_open_id = ?", userInfo.OpenID).First(&user)
	if result.Error != nil {
		if result.Error != gorm.ErrRecordNotFound {
			response.BadRequest(c, "database error")
			return
		}

		user = models.User{
			Username:     username,
			PasswordHash: mustHashFeishuPassword(),
			Role:         "student",
			Name:         userName,
			Status:       models.UserStatusActive,
			FeishuOpenID: userInfo.OpenID,
		}
		if err := h.db.Create(&user).Error; err != nil {
			response.BadRequest(c, "failed to create user")
			return
		}
	}

	updates := map[string]any{}
	if userName != "" && user.Name != userName {
		updates["name"] = userName
		user.Name = userName
	}
	if user.FeishuOpenID == "" {
		updates["feishu_open_id"] = userInfo.OpenID
		user.FeishuOpenID = userInfo.OpenID
	}
	if len(updates) > 0 {
		if err := h.db.Model(&user).Updates(updates).Error; err != nil {
			response.BadRequest(c, "failed to update user")
			return
		}
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
		ClientType: "feishu",
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
		Name:             user.Name,
	})
}

// Notify sends a text notification via Feishu bot webhook.
// POST /feishu/notify
func (h *feishuHandlers) Notify(c *gin.Context) {
	if !h.feishu.HasBotWebhook() {
		response.BadRequest(c, "Feishu bot webhook is not configured")
		return
	}

	var req FeishuNotifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "content is required")
		return
	}

	if err := h.sendBotText(c.Request.Context(), req.Content); err != nil {
		response.BadRequest(c, fmt.Sprintf("feishu notify failed: %v", err))
		return
	}

	response.OK(c, FeishuNotifyResponse{Sent: true})
}

func mustHashFeishuPassword() string {
	token, err := auth.GenerateOpaqueToken()
	if err != nil {
		return "feishu-only"
	}
	hash, err := auth.HashPasswordWithCost(token, 4)
	if err != nil {
		return "feishu-only"
	}
	return hash
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
