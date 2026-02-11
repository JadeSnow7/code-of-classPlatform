package http

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type authHandlers struct {
	service   services.AuthService
	jwtSecret string
}

func NewAuthHandlers(service services.AuthService, jwtSecret string) *authHandlers {
	return &authHandlers{service: service, jwtSecret: jwtSecret}
}

func newAuthHandlers(service services.AuthService, jwtSecret string) *authHandlers {
	return NewAuthHandlers(service, jwtSecret)
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type loginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	UserID      uint   `json:"user_id,omitempty"`
	Username    string `json:"username,omitempty"`
	Role        string `json:"role,omitempty"`
}

func (h *authHandlers) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	// Use service to login (validates credentials and generates token)
	user, token, err := h.service.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		response.Unauthorized(c, "Invalid username or password")
		return
	}

	// Note: Service token has 7 days TTL, but we report 24h for backward compatibility
	ttl := 24 * time.Hour

	response.OK(c, loginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(ttl.Seconds()),
		UserID:      user.ID,
		Username:    user.Username,
		Role:        user.Role,
	})
}

// MeResponse is the response for /auth/me endpoint
type MeResponse struct {
	ID          uint     `json:"id"`
	Username    string   `json:"username"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

func (h *authHandlers) Me(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	// Fetch fresh user data from service
	dbUser, err := h.service.GetUserByID(c.Request.Context(), u.ID)
	if err != nil {
		response.NotFound(c, "User")
		return
	}

	// Get permissions from RBAC
	permissions := authz.GetPermissions(dbUser.Role)

	response.OK(c, MeResponse{
		ID:          dbUser.ID,
		Username:    dbUser.Username,
		Name:        dbUser.Name,
		Role:        dbUser.Role,
		Permissions: permissions,
	})
}
