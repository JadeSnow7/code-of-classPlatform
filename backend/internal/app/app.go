package app

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	httpapi "github.com/huaodong/llm-teaching-platform/backend/internal/http"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"gorm.io/gorm"
)

// App holds all application dependencies and provides a clean initialization API
type App struct {
	Config config.Config
	DB     *gorm.DB
	Router *gin.Engine

	// External Clients
	AIClient    clients.AIClientInterface
	MinIOClient clients.MinIOClientInterface

	// Repositories
	UserRepo            repositories.UserRepository
	AIConfigRepo        repositories.AIConfigRepository
	CourseRepo          repositories.CourseRepository
	AssignmentRepo      repositories.AssignmentRepository
	QuizRepo            repositories.QuizRepository
	AnnouncementRepo    repositories.AnnouncementRepository
	AttendanceRepo      repositories.AttendanceRepository
	ResourceRepo        repositories.ResourceRepository
	WritingRepo         repositories.WritingRepository
	LearningProfileRepo repositories.LearningProfileRepository
	GlobalProfileRepo   repositories.GlobalProfileRepository

	// Services
	AuthService            services.AuthService
	UserService            services.UserService
	AIConfigService        services.AIConfigService
	AdminService           services.AdminService
	AnnouncementService    services.AnnouncementService
	AttendanceService      services.AttendanceService
	ResourceService        services.ResourceService
	UploadService          services.UploadService
	WritingService         services.WritingService
	LearningProfileService services.LearningProfileService
	GlobalProfileService   services.GlobalProfileService
}

// New creates and wires all dependencies following the pattern:
// DB → Repositories → Services → Handlers → Router
func New(cfg config.Config, db *gorm.DB, aiClient *clients.AIClient, minioClient *clients.MinioClient) *App {
	app := &App{
		Config: cfg,
		DB:     db,
	}

	// Wrap external clients with interfaces
	if aiClient != nil {
		app.AIClient = aiClient
	}
	if minioClient != nil {
		app.MinIOClient = minioClient
	}

	// Repositories
	app.UserRepo = repositories.NewUserRepository(db)
	app.AIConfigRepo = repositories.NewAIConfigRepository(db)
	app.CourseRepo = repositories.NewCourseRepository(db)
	app.AssignmentRepo = repositories.NewAssignmentRepository(db)
	app.QuizRepo = repositories.NewQuizRepository(db)
	app.AnnouncementRepo = repositories.NewAnnouncementRepository(db)
	app.AttendanceRepo = repositories.NewAttendanceRepository(db)
	app.ResourceRepo = repositories.NewResourceRepository(db)
	app.WritingRepo = repositories.NewWritingRepository(db)
	app.LearningProfileRepo = repositories.NewLearningProfileRepository(db)
	app.GlobalProfileRepo = repositories.NewGlobalProfileRepository(db)

	// Services
	app.AuthService = services.NewAuthService(app.UserRepo, cfg.JWTSecret)
	app.UserService = services.NewUserService(app.UserRepo, app.CourseRepo, app.AssignmentRepo, app.QuizRepo)
	app.AIConfigService = services.NewAIConfigService(app.AIConfigRepo)
	app.AdminService = services.NewAdminService(app.UserRepo, app.CourseRepo, app.AssignmentRepo, app.QuizRepo, app.ResourceRepo)
	app.AnnouncementService = services.NewAnnouncementService(app.AnnouncementRepo)
	app.AttendanceService = services.NewAttendanceService(app.AttendanceRepo, app.UserRepo)
	app.ResourceService = services.NewResourceService(app.ResourceRepo)
	app.WritingService = services.NewWritingService(app.WritingRepo, app.AIClient)
	app.LearningProfileService = services.NewLearningProfileService(app.LearningProfileRepo)
	app.GlobalProfileService = services.NewGlobalProfileService(app.GlobalProfileRepo)
	app.UploadService = services.NewUploadService(app.MinIOClient, app.AssignmentRepo, app.CourseRepo)

	// Additional service-backed handlers still using existing service constructors.
	courseHandlers := httpapi.NewCourseHandlers(db)
	assignmentHandlers := httpapi.NewAssignmentHandlers(db, aiClient)
	quizHandlers := httpapi.NewQuizHandlers(db)
	chapterHandlers := httpapi.NewChapterHandlers(db)
	aiHandlers := httpapi.NewAIHandlers(aiClient)

	// Optional WeCom client
	wecomClient := clients.NewWecomClient(clients.WecomConfig{
		CorpID:  cfg.WecomCorpID,
		AgentID: cfg.WecomAgentID,
		Secret:  cfg.WecomSecret,
	})

	routerDeps := httpapi.RouterDeps{
		AuthHandlers:            httpapi.NewAuthHandlers(app.AuthService, cfg.JWTSecret),
		UserHandlers:            httpapi.NewUserHandlers(app.UserService),
		AIConfigHandlers:        httpapi.NewAIConfigHandlers(app.AIConfigService),
		WecomHandlers:           httpapi.NewWecomHandlers(wecomClient, db, cfg.JWTSecret),
		CourseHandlers:          courseHandlers,
		ChapterHandlers:         chapterHandlers,
		AssignmentHandlers:      assignmentHandlers,
		QuizHandlers:            quizHandlers,
		ResourceHandlers:        httpapi.NewResourceHandlers(app.ResourceService),
		UploadHandlers:          httpapi.NewUploadHandlers(app.UploadService),
		AIHandlers:              aiHandlers,
		AnnouncementHandlers:    httpapi.NewAnnouncementHandlers(app.AnnouncementService),
		AttendanceHandlers:      httpapi.NewAttendanceHandlers(app.AttendanceService),
		WritingHandlers:         httpapi.NewWritingHandlers(app.WritingService),
		WorkspaceHandlers:       httpapi.NewWorkspaceHandlers(),
		LearningProfileHandlers: httpapi.NewLearningProfileHandlers(app.LearningProfileService),
		GlobalProfileHandlers:   httpapi.NewGlobalProfileHandlers(app.GlobalProfileService),
		AdminHandlers:           httpapi.NewAdminHandlers(app.AdminService),
		RequireWritingModule:    httpapi.RequireCourseModule(db, "course.writing"),
	}

	app.Router = httpapi.NewRouter(cfg, routerDeps)
	return app
}
