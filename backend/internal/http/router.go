package http

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/http/routes"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"golang.org/x/time/rate"
)

// NewRouter builds the Gin engine with all routes and middleware configured.
func NewRouter(cfg config.Config, deps RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestID(), middleware.RequestLogger(), gin.Recovery())
	r.Use(newCORS(cfg.CorsOrigins))

	globalLimiter := middleware.NewRateLimiter(rate.Every(100*time.Millisecond), 20, 10*time.Minute)
	r.Use(middleware.RateLimitByIP(globalLimiter))

	authLimiter := deps.AuthLimiter
	if authLimiter == nil {
		authLimiter = middleware.NewRateLimiter(rate.Every(12*time.Second), 5, 30*time.Minute)
	}
	aiLimiter := deps.AiLimiter
	if aiLimiter == nil {
		aiLimiter = middleware.NewRateLimiter(rate.Every(3*time.Second), 10, 30*time.Minute)
	}

	r.GET("/health", func(c *gin.Context) {
		response.OK(c, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	routes.RegisterAuthRoutes(api, cfg.JWTSecret, authLimiter, deps.AuthHandlers)
	routes.RegisterUserRoutes(api, cfg.JWTSecret, deps.UserHandlers)
	routes.RegisterLearningHubRoutes(api, cfg.JWTSecret, deps.LearningHubHandlers)
	routes.RegisterAIConfigRoutes(api, cfg.JWTSecret, deps.AIConfigHandlers)
	routes.RegisterWecomRoutes(api, deps.WecomHandlers)
	routes.RegisterFeishuRoutes(api, cfg.JWTSecret, deps.FeishuHandlers)
	routes.RegisterCourseRoutes(api, cfg.JWTSecret, deps.CourseHandlers)
	routes.RegisterChapterRoutes(api, cfg.JWTSecret, deps.ChapterHandlers)
	routes.RegisterAssignmentRoutes(api, cfg.JWTSecret, deps.AssignmentHandlers)
	routes.RegisterQuizRoutes(api, cfg.JWTSecret, deps.QuizHandlers)
	routes.RegisterResourceRoutes(api, cfg.JWTSecret, deps.ResourceHandlers)
	routes.RegisterUploadRoutes(api, cfg.JWTSecret, deps.UploadHandlers)
	routes.RegisterAIRoutes(api, cfg.JWTSecret, aiLimiter, deps.AIHandlers)
	routes.RegisterAnnouncementRoutes(api, cfg.JWTSecret, deps.AnnouncementHandlers)
	routes.RegisterAttendanceRoutes(api, cfg.JWTSecret, deps.AttendanceHandlers)
	routes.RegisterWritingRoutes(api, cfg.JWTSecret, deps.RequireWritingModule, deps.WritingHandlers)
	routes.RegisterWorkspaceRoutes(api, cfg.JWTSecret, deps.WorkspaceHandlers)
	routes.RegisterLearningProfileRoutes(api, cfg.JWTSecret, deps.LearningProfileHandlers)
	routes.RegisterGlobalProfileRoutes(api, cfg.JWTSecret, deps.GlobalProfileHandlers)
	routes.RegisterAdminRoutes(api, cfg.JWTSecret, deps.AdminHandlers)
	if deps.EventHandlers != nil {
		routes.RegisterEventRoutes(api, cfg.JWTSecret, deps.EventHandlers)
	}

	internal := r.Group("/internal")
	routes.RegisterKnowledgeExportRoutes(internal, cfg.AIGatewaySharedToken, deps.KnowledgeExportHandlers)

	return r
}

func newCORS(origins []string) gin.HandlerFunc {
	for _, o := range origins {
		if strings.TrimSpace(o) == "*" {
			return cors.New(cors.Config{
				AllowAllOrigins: true,
				AllowMethods:    []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
				AllowHeaders:    []string{"Authorization", "Content-Type"},
				MaxAge:          12 * time.Hour,
			})
		}
	}
	return cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
