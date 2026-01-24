package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/authz"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type authHandlers struct {
	db        *gorm.DB
	jwtSecret string
}

func newAuthHandlers(db *gorm.DB, jwtSecret string) *authHandlers {
	return &authHandlers{db: db, jwtSecret: jwtSecret}
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
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
		return
	}

	var u models.User
	if err := h.db.Where("username = ?", req.Username).First(&u).Error; err != nil {
		respondError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password", nil)
		return
	}
	if !auth.VerifyPassword(u.PasswordHash, req.Password) {
		respondError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password", nil)
		return
	}

	ttl := 24 * time.Hour
	token, err := auth.SignToken(h.jwtSecret, u.ID, u.Username, u.Role, ttl)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "TOKEN_SIGN_FAILED", "token sign failed", nil)
		return
	}

	respondOK(c, loginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(ttl.Seconds()),
		UserID:      u.ID,
		Username:    u.Username,
		Role:        u.Role,
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
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	// Fetch fresh user data from database
	var dbUser models.User
	if err := h.db.First(&dbUser, u.ID).Error; err != nil {
		respondError(c, http.StatusNotFound, "USER_NOT_FOUND", "user not found", nil)
		return
	}

	// Get permissions from RBAC
	permissions := authz.GetPermissions(dbUser.Role)

	respondOK(c, MeResponse{
		ID:          dbUser.ID,
		Username:    dbUser.Username,
		Name:        dbUser.Name,
		Role:        dbUser.Role,
		Permissions: permissions,
	})
}
