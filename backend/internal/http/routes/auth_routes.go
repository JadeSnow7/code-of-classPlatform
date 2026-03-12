package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// AuthHandlers interface for auth handler methods
type AuthHandlers interface {
	Login(c *gin.Context)
	GetInvite(c *gin.Context)
	ActivateRegistration(c *gin.Context)
	Refresh(c *gin.Context)
	Logout(c *gin.Context)
	LogoutAll(c *gin.Context)
	Me(c *gin.Context)
}

// RegisterAuthRoutes registers authentication routes
func RegisterAuthRoutes(api *gin.RouterGroup, jwtSecret string, authLimiter *middleware.RateLimiter, h AuthHandlers) {
	api.POST("/auth/login", middleware.RateLimitByIP(authLimiter), h.Login)
	api.GET("/auth/register/invite/:token", middleware.RateLimitByIP(authLimiter), h.GetInvite)
	api.POST("/auth/register/activate", middleware.RateLimitByIP(authLimiter), h.ActivateRegistration)
	api.POST("/auth/refresh", middleware.RateLimitByIP(authLimiter), h.Refresh)
	api.POST("/auth/logout", middleware.RateLimitByIP(authLimiter), h.Logout)
	api.POST("/auth/logout-all", middleware.AuthRequired(jwtSecret), middleware.RateLimitByIP(authLimiter), h.LogoutAll)
	api.GET("/auth/me", middleware.AuthRequired(jwtSecret), h.Me)
}
