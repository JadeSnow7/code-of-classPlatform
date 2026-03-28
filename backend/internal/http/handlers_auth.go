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
	service              services.AuthService
	globalProfileService services.GlobalProfileService
	jwtSecret            string
}

func NewAuthHandlers(service services.AuthService, jwtSecret string, globalProfileService ...services.GlobalProfileService) *authHandlers {
	var profileService services.GlobalProfileService
	if len(globalProfileService) > 0 {
		profileService = globalProfileService[0]
	}
	return &authHandlers{service: service, globalProfileService: profileService, jwtSecret: jwtSecret}
}

func newAuthHandlers(service services.AuthService, jwtSecret string, globalProfileService ...services.GlobalProfileService) *authHandlers {
	return NewAuthHandlers(service, jwtSecret, globalProfileService...)
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type activateRequest struct {
	Token                  string                          `json:"token" binding:"required"`
	Password               string                          `json:"password" binding:"required"`
	ConfirmPassword        string                          `json:"confirm_password" binding:"required"`
	RealName               string                          `json:"real_name" binding:"required"`
	StudentID              string                          `json:"student_id" binding:"required"`
	ConsentPersonalization bool                            `json:"consent_personalization"`
	AnalyticsOptIn         bool                            `json:"analytics_opt_in"`
	OnboardingProfile      services.OnboardingProfileInput `json:"onboarding_profile"`
	LearningStyle          services.LearningStyleInput     `json:"learning_style"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type loginResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token,omitempty"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int64  `json:"expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in,omitempty"`
	UserID           uint   `json:"user_id,omitempty"`
	Username         string `json:"username,omitempty"`
	Role             string `json:"role,omitempty"`
	Name             string `json:"name,omitempty"`
}

func (h *authHandlers) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	session, err := h.service.Login(c.Request.Context(), req.Username, req.Password, requestSessionMeta(c, "web"))
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, toLoginResponse(session))
}

func (h *authHandlers) GetInvite(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		response.BadRequest(c, "token is required")
		return
	}
	invite, err := h.service.GetInvitePreview(c.Request.Context(), token)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, invite)
}

func (h *authHandlers) ActivateRegistration(c *gin.Context) {
	var req activateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}
	if err := services.ValidateActivationQuestionnaire(req.ConsentPersonalization, req.OnboardingProfile, req.LearningStyle); err != nil {
		response.Error(c, err)
		return
	}
	session, err := h.service.ActivateRegistration(
		c.Request.Context(),
		services.ActivateRegistrationInput{
			Token:           req.Token,
			Password:        req.Password,
			ConfirmPassword: req.ConfirmPassword,
			RealName:        req.RealName,
			StudentID:       req.StudentID,
		},
		requestSessionMeta(c, "web"),
	)
	if err != nil {
		response.Error(c, err)
		return
	}
	if h.globalProfileService != nil && session.User != nil {
		profile, err := services.BuildInitialGlobalProfile(session.User.ID, req.OnboardingProfile, req.LearningStyle, req.AnalyticsOptIn)
		if err != nil {
			response.Error(c, err)
			return
		}
		if err := h.globalProfileService.SaveGlobalProfile(c.Request.Context(), profile); err != nil {
			response.Error(c, err)
			return
		}
	}
	response.OK(c, toLoginResponse(session))
}

func (h *authHandlers) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}
	session, err := h.service.Refresh(c.Request.Context(), req.RefreshToken, requestSessionMeta(c, "web"))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, toLoginResponse(session))
}

func (h *authHandlers) Logout(c *gin.Context) {
	var req logoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}
	if err := h.service.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, gin.H{"message": "logged out"})
}

func (h *authHandlers) LogoutAll(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	if err := h.service.LogoutAll(c.Request.Context(), u.ID); err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, gin.H{"message": "logged out from all devices"})
}

// MeResponse is the response for /auth/me endpoint
type MeResponse struct {
	ID          uint       `json:"id"`
	Username    string     `json:"username"`
	Name        string     `json:"name"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	Permissions []string   `json:"permissions"`
}

func (h *authHandlers) Me(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	dbUser, err := h.service.GetUserByID(c.Request.Context(), u.ID)
	if err != nil {
		response.NotFound(c, "User")
		return
	}

	permissions := authz.GetPermissions(dbUser.Role)

	response.OK(c, MeResponse{
		ID:          dbUser.ID,
		Username:    dbUser.Username,
		Name:        dbUser.Name,
		Role:        dbUser.Role,
		Status:      dbUser.Status,
		LastLoginAt: dbUser.LastLoginAt,
		Permissions: permissions,
	})
}

func toLoginResponse(session services.AuthSessionBundle) loginResponse {
	resp := loginResponse{
		AccessToken:      session.AccessToken,
		RefreshToken:     session.RefreshToken,
		TokenType:        session.TokenType,
		ExpiresIn:        session.ExpiresIn,
		RefreshExpiresIn: session.RefreshExpiresIn,
	}
	if session.User != nil {
		resp.UserID = session.User.ID
		resp.Username = session.User.Username
		resp.Role = session.User.Role
		resp.Name = session.User.Name
	}
	return resp
}

func requestSessionMeta(c *gin.Context, fallbackClientType string) services.AuthSessionMeta {
	clientType := c.GetHeader("X-Client-Type")
	if clientType == "" {
		clientType = fallbackClientType
	}
	return services.AuthSessionMeta{
		ClientType:  clientType,
		DeviceLabel: c.GetHeader("X-Device-Label"),
		IP:          c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
	}
}
