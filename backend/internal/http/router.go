package http

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/http/routes"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"golang.org/x/time/rate"
	"gorm.io/gorm"
)

// NewRouter builds the Gin engine with all routes and middleware configured.
func NewRouter(cfg config.Config, gormDB *gorm.DB, aiClient *clients.AIClient, minioClient *clients.MinioClient) *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestID(), middleware.RequestLogger(), gin.Recovery())
	r.Use(newCORS(cfg.CorsOrigins))

	globalLimiter := middleware.NewRateLimiter(rate.Every(100*time.Millisecond), 20, 10*time.Minute)
	authLimiter := middleware.NewRateLimiter(rate.Every(12*time.Second), 5, 30*time.Minute)
	aiLimiter := middleware.NewRateLimiter(rate.Every(3*time.Second), 10, 30*time.Minute)

	r.Use(middleware.RateLimitByIP(globalLimiter))

	r.GET("/healthz", func(c *gin.Context) {
		respondOK(c, gin.H{"status": "ok"})
	})

	// Initialize handlers
	hAuth := newAuthHandlers(gormDB, cfg.JWTSecret)
	hCourse := newCourseHandlers(gormDB)
	hAI := newAIHandlers(aiClient)
	hAssignment := newAssignmentHandlers(gormDB, aiClient)
	hResource := newResourceHandlers(gormDB)
	hUpload := newUploadHandlers(gormDB, minioClient)
	hQuiz := newQuizHandlers(gormDB)
	hUser := newUserHandlers(gormDB)
	hChapter := newChapterHandlers(gormDB)
	hAnnouncement := newAnnouncementHandlers(gormDB)
	hAttendance := newAttendanceHandlers(gormDB)
	hLearningProfile := newLearningProfileHandlers(gormDB)
	hAdmin := newAdminHandlers(gormDB)
	hGlobalProfile := newGlobalProfileHandlers(gormDB)
	hWriting := newWritingHandlers(gormDB, aiClient)

	// WeChat Work client (optional)
	wecomClient := clients.NewWecomClient(clients.WecomConfig{
		CorpID:  cfg.WecomCorpID,
		AgentID: cfg.WecomAgentID,
		Secret:  cfg.WecomSecret,
	})
	hWecom := newWecomHandlers(wecomClient, gormDB, cfg.JWTSecret)

	// Export middleware helper for routes package
	routes.RequireCourseModule = RequireCourseModule

	// Register all routes
	api := r.Group("/api/v1")
	routes.RegisterAuthRoutes(api, cfg.JWTSecret, authLimiter, hAuth)
	routes.RegisterUserRoutes(api, cfg.JWTSecret, hUser)
	routes.RegisterWecomRoutes(api, hWecom)
	routes.RegisterCourseRoutes(api, cfg.JWTSecret, hCourse)
	routes.RegisterChapterRoutes(api, cfg.JWTSecret, hChapter)
	routes.RegisterAssignmentRoutes(api, cfg.JWTSecret, hAssignment)
	routes.RegisterQuizRoutes(api, cfg.JWTSecret, hQuiz)
	routes.RegisterResourceRoutes(api, cfg.JWTSecret, hResource)
	routes.RegisterUploadRoutes(api, cfg.JWTSecret, hUpload)
	routes.RegisterAIRoutes(api, cfg.JWTSecret, aiLimiter, hAI)
	routes.RegisterAnnouncementRoutes(api, cfg.JWTSecret, hAnnouncement)
	routes.RegisterAttendanceRoutes(api, cfg.JWTSecret, hAttendance)
	routes.RegisterWritingRoutes(api, cfg.JWTSecret, gormDB, hWriting)
	routes.RegisterLearningProfileRoutes(api, cfg.JWTSecret, hLearningProfile)
	routes.RegisterGlobalProfileRoutes(api, cfg.JWTSecret, hGlobalProfile)
	routes.RegisterAdminRoutes(api, cfg.JWTSecret, hAdmin)

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
