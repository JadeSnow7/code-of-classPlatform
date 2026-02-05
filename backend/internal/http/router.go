package http

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/authz"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/config"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"golang.org/x/time/rate"
	"gorm.io/gorm"
)

// NewRouter builds the Gin engine with all routes and middleware configured.
func NewRouter(cfg config.Config, gormDB *gorm.DB, aiClient *clients.AIClient, simClient *clients.SimClient, minioClient *clients.MinioClient) *gin.Engine {
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

	hAuth := newAuthHandlers(gormDB, cfg.JWTSecret)
	hCourse := newCourseHandlers(gormDB)
	hAI := newAIHandlers(aiClient)
	hSim := newSimHandlers(simClient)
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

	api := r.Group("/api/v1")
	{
		api.POST("/auth/login", middleware.RateLimitByIP(authLimiter), hAuth.Login)
		api.GET("/auth/me", middleware.AuthRequired(cfg.JWTSecret), hAuth.Me)

		// User stats route
		api.GET("/user/stats", middleware.AuthRequired(cfg.JWTSecret), middleware.RequirePermission(authz.PermUserStats), hUser.GetStats)
		// Compatibility alias for mobile client
		api.GET("/users/me/stats", middleware.AuthRequired(cfg.JWTSecret), middleware.RequirePermission(authz.PermUserStats), hUser.GetStats)

		// WeChat Work OAuth routes (no auth required)
		api.POST("/auth/wecom", hWecom.Login)
		api.POST("/auth/wecom/jsconfig", hWecom.GetJSConfig)
		api.GET("/auth/wecom/oauth-url", hWecom.GetOAuthURL)

		api.GET(
			"/courses",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hCourse.List,
		)
		api.GET(
			"/courses/:courseId",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hCourse.Get,
		)
		api.GET(
			"/courses/:courseId/modules",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hCourse.GetModules,
		)
		api.POST(
			"/courses",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hCourse.Create,
		)
		api.PUT(
			"/courses/:courseId/modules",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hCourse.UpdateModules,
		)

		// Chapter routes
		api.GET(
			"/courses/:courseId/chapters",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hChapter.ListChapters,
		)
		api.POST(
			"/chapters",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hChapter.CreateChapter,
		)
		api.GET(
			"/chapters/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hChapter.GetChapter,
		)
		api.PUT(
			"/chapters/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hChapter.UpdateChapter,
		)
		api.DELETE(
			"/chapters/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hChapter.DeleteChapter,
		)
		api.POST(
			"/chapters/:id/heartbeat",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hChapter.Heartbeat,
		)
		// Compatibility alias for mobile client
		api.POST(
			"/chapters/:id/study-time",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hChapter.Heartbeat,
		)
		api.GET(
			"/chapters/:id/my-stats",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hChapter.GetMyStats,
		)
		api.GET(
			"/chapters/:id/class-stats",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hChapter.GetClassStats,
		)

		// Assignment routes
		api.GET(
			"/courses/:courseId/assignments/stats",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hAssignment.GetCourseAssignmentStats,
		)
		api.GET(
			"/courses/:courseId/assignments",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hAssignment.ListAssignments,
		)
		api.POST(
			"/courses/:courseId/assignments",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentWrite),
			hAssignment.CreateAssignment,
		)
		// Compatibility alias for web client
		api.POST(
			"/assignments",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentWrite),
			hAssignment.CreateAssignment,
		)
		api.GET(
			"/assignments/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hAssignment.GetAssignment,
		)
		api.GET(
			"/assignments/:id/stats",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hAssignment.GetAssignmentStats,
		)
		api.POST(
			"/assignments/:id/submit",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentSubmit),
			hAssignment.SubmitAssignment,
		)
		api.GET(
			"/assignments/:id/my-submission",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hAssignment.GetMySubmission,
		)
		api.GET(
			"/assignments/:id/submissions",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentGrade),
			hAssignment.ListSubmissions,
		)
		api.POST(
			"/submissions/:submissionId/grade",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentGrade),
			hAssignment.GradeSubmission,
		)

		// Resource routes
		api.GET(
			"/courses/:courseId/resources",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermResourceRead),
			hResource.ListResources,
		)
		api.POST(
			"/resources",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermResourceWrite),
			hResource.CreateResource,
		)
		api.DELETE(
			"/resources/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermResourceWrite),
			hResource.DeleteResource,
		)

		// Upload routes (file handling)
		api.POST(
			"/upload/assignment/:assignmentId",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentSubmit),
			hUpload.UploadAssignmentFile,
		)
		api.POST(
			"/upload/resource/:courseId",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermResourceWrite),
			hUpload.UploadResourceFile,
		)

		// AI grading route
		api.POST(
			"/submissions/:submissionId/ai-grade",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentGrade),
			hAssignment.AIGradeSubmission,
		)

		api.POST(
			"/ai/chat",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAIUse),
			middleware.RateLimitByUserOrIP(aiLimiter),
			hAI.Chat,
		)
		api.POST(
			"/ai/chat_with_tools",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAIUse),
			middleware.RateLimitByUserOrIP(aiLimiter),
			hAI.ChatWithTools,
		)
		api.POST(
			"/ai/chat/guided",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAIUse),
			middleware.RateLimitByUserOrIP(aiLimiter),
			hAI.ChatGuided,
		)

		// Announcement routes
		api.GET(
			"/courses/:courseId/announcements/summary",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementRead),
			hAnnouncement.GetSummary,
		)
		api.GET(
			"/courses/:courseId/announcements",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementRead),
			hAnnouncement.List,
		)
		api.POST(
			"/courses/:courseId/announcements",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementWrite),
			hAnnouncement.Create,
		)
		api.PUT(
			"/announcements/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementWrite),
			hAnnouncement.Update,
		)
		api.DELETE(
			"/announcements/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementWrite),
			hAnnouncement.Delete,
		)
		api.POST(
			"/announcements/:id/read",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAnnouncementRead),
			hAnnouncement.MarkRead,
		)

		// Attendance routes
		api.GET(
			"/courses/:courseId/attendance/summary",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceRead),
			hAttendance.GetSummary,
		)
		api.GET(
			"/courses/:courseId/attendance/sessions",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceRead),
			hAttendance.ListSessions,
		)
		api.POST(
			"/courses/:courseId/attendance/start",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceWrite),
			hAttendance.StartSession,
		)
		api.POST(
			"/attendance/:session_id/end",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceWrite),
			hAttendance.EndSession,
		)
		api.POST(
			"/attendance/:session_id/checkin",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceCheckin),
			hAttendance.Checkin,
		)
		api.GET(
			"/attendance/:session_id/records",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAttendanceRead),
			hAttendance.GetRecords,
		)

		// Learning Profile routes
		api.GET(
			"/learning-profiles/:courseId/:studentId",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hLearningProfile.GetProfile,
		)
		api.POST(
			"/learning-profiles",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hLearningProfile.SaveProfile,
		)
		api.GET(
			"/courses/:courseId/learning-profiles",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseWrite),
			hLearningProfile.ListCourseProfiles,
		)

		// Global Profile routes (student-centric multi-course tracking)
		api.GET(
			"/students/:studentId/global-profile",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hGlobalProfile.GetGlobalProfile,
		)
		api.POST(
			"/students/:studentId/global-profile",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hGlobalProfile.SaveGlobalProfile,
		)
		api.GET(
			"/students/:studentId/learning-timeline",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hGlobalProfile.GetLearningTimeline,
		)
		api.POST(
			"/learning-events",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCourseRead),
			hGlobalProfile.RecordLearningEvent,
		)

		// Writing submission routes
		api.POST(
			"/courses/:courseId/writing",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentSubmit),
			RequireCourseModule(gormDB, "course.writing"),
			hWriting.SubmitWriting,
		)
		api.GET(
			"/courses/:courseId/writing",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			RequireCourseModule(gormDB, "course.writing"),
			hWriting.GetWritingSubmissions,
		)
		api.GET(
			"/courses/:courseId/writing/stats",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentGrade),
			RequireCourseModule(gormDB, "course.writing"),
			hWriting.GetWritingStats,
		)
		api.GET(
			"/writing/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentRead),
			hWriting.GetWritingSubmission,
		)
		api.PUT(
			"/writing/:id/feedback",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermAssignmentGrade),
			hWriting.UpdateWritingFeedback,
		)

		// Quiz routes
		api.GET(
			"/courses/:courseId/quizzes",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizRead),
			hQuiz.ListQuizzes,
		)
		api.POST(
			"/quizzes",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.CreateQuiz,
		)
		api.GET(
			"/quizzes/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizRead),
			hQuiz.GetQuiz,
		)
		api.PUT(
			"/quizzes/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.UpdateQuiz,
		)
		api.DELETE(
			"/quizzes/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.DeleteQuiz,
		)
		api.POST(
			"/quizzes/:id/publish",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.PublishQuiz,
		)
		api.POST(
			"/quizzes/:id/unpublish",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.UnpublishQuiz,
		)
		api.POST(
			"/quizzes/:id/questions",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.AddQuestion,
		)
		api.PUT(
			"/questions/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.UpdateQuestion,
		)
		api.DELETE(
			"/questions/:id",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizWrite),
			hQuiz.DeleteQuestion,
		)
		api.POST(
			"/quizzes/:id/start",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizTake),
			hQuiz.StartQuiz,
		)
		api.POST(
			"/quizzes/:id/submit",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizTake),
			hQuiz.SubmitQuiz,
		)
		api.GET(
			"/quizzes/:id/result",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermQuizRead),
			hQuiz.GetQuizResult,
		)

		// Simulation endpoints (require sim:use permission)
		simMW := []gin.HandlerFunc{
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermSimUse),
			RequireCourseModule(gormDB, "course.simulation"),
		}

		// Legacy Laplace2D endpoint
		api.POST("/sim/laplace2d", append(simMW, hSim.Laplace2D)...)

		// Electrostatics endpoints
		api.POST("/sim/point_charges", append(simMW, hSim.SimProxy("/v1/sim/point_charges"))...)
		api.POST("/sim/gauss_flux", append(simMW, hSim.SimProxy("/v1/sim/gauss_flux"))...)

		// Magnetostatics endpoints
		api.POST("/sim/wire_field", append(simMW, hSim.SimProxy("/v1/sim/wire_field"))...)
		api.POST("/sim/solenoid", append(simMW, hSim.SimProxy("/v1/sim/solenoid"))...)
		api.POST("/sim/ampere_loop", append(simMW, hSim.SimProxy("/v1/sim/ampere_loop"))...)

		// Wave endpoints
		api.POST("/sim/wave_1d", append(simMW, hSim.SimProxy("/v1/sim/wave_1d"))...)
		api.POST("/sim/fresnel", append(simMW, hSim.SimProxy("/v1/sim/fresnel"))...)

		// Numerical computation endpoints
		api.POST("/calc/integrate", append(simMW, hSim.CalcProxy("/v1/calc/integrate"))...)
		api.POST("/calc/differentiate", append(simMW, hSim.CalcProxy("/v1/calc/differentiate"))...)
		api.POST("/calc/evaluate", append(simMW, hSim.CalcProxy("/v1/calc/evaluate"))...)
		api.POST("/calc/vector_op", append(simMW, hSim.CalcProxy("/v1/calc/vector_op"))...)

		// Code execution endpoint (sandboxed)
		api.POST(
			"/sim/run_code",
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermCodeRun),
			hSim.SimProxy("/v1/sim/run_code"),
		)

		// Admin routes (require user:manage permission)
		adminMW := []gin.HandlerFunc{
			middleware.AuthRequired(cfg.JWTSecret),
			middleware.RequirePermission(authz.PermUserManage),
		}
		api.GET("/admin/stats", append(adminMW, hAdmin.GetSystemStats)...)
		api.GET("/admin/users", append(adminMW, hAdmin.ListUsers)...)
		api.POST("/admin/users", append(adminMW, hAdmin.CreateUser)...)
		api.PUT("/admin/users/:id", append(adminMW, hAdmin.UpdateUser)...)
		api.DELETE("/admin/users/:id", append(adminMW, hAdmin.DeleteUser)...)
	}

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
