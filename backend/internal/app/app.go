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
	AnnouncementRepo    repositories.AnnouncementRepository
	AttendanceRepo      repositories.AttendanceRepository
	ResourceRepo        repositories.ResourceRepository
	WritingRepo         repositories.WritingRepository
	LearningProfileRepo repositories.LearningProfileRepository
	GlobalProfileRepo   repositories.GlobalProfileRepository

	// Services
	AuthService            services.AuthService
	UserService            services.UserService
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

	// Initialize repositories
	app.UserRepo = repositories.NewUserRepository(db)
	app.AnnouncementRepo = repositories.NewAnnouncementRepository(db)
	app.AttendanceRepo = repositories.NewAttendanceRepository(db)
	app.ResourceRepo = repositories.NewResourceRepository(db)
	app.WritingRepo = repositories.NewWritingRepository(db)
	app.LearningProfileRepo = repositories.NewLearningProfileRepository(db)
	app.GlobalProfileRepo = repositories.NewGlobalProfileRepository(db)

	// Initialize services
	app.AuthService = services.NewAuthService(app.UserRepo, cfg.JWTSecret)
	app.UserService = services.NewUserService(db)             // actual signature: (db *gorm.DB)
	app.AdminService = services.NewAdminService(app.UserRepo) // actual signature: (userRepo)
	app.AnnouncementService = services.NewAnnouncementService(app.AnnouncementRepo)
	app.AttendanceService = services.NewAttendanceService(app.AttendanceRepo)
	app.ResourceService = services.NewResourceService(app.ResourceRepo)
	app.WritingService = services.NewWritingService(app.WritingRepo)
	app.LearningProfileService = services.NewLearningProfileService(app.LearningProfileRepo)
	app.GlobalProfileService = services.NewGlobalProfileService(app.GlobalProfileRepo)

	if app.MinIOClient != nil {
		app.UploadService = services.NewUploadService(app.MinIOClient)
	}

	// Initialize router with all dependencies
	// For now, router.go still creates handlers internally
	// Future: move handler construction here and pass handlers to router
	app.Router = httpapi.NewRouter(cfg, db, aiClient, minioClient)

	return app
}
