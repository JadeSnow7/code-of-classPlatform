package db

import (
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open opens a database connection.
// DSN format:
//   - MySQL: "user:pass@tcp(host:port)/dbname?charset=utf8mb4&parseTime=True"
//   - SQLite: "sqlite:path/to/db.sqlite" or "file:path/to/db.sqlite"
func Open(dsn string) (*gorm.DB, error) {
	var dialector gorm.Dialector

	// Check if DSN is for SQLite
	if strings.HasPrefix(dsn, "sqlite:") || strings.HasPrefix(dsn, "file:") {
		// Extract path from DSN
		path := strings.TrimPrefix(dsn, "sqlite:")
		path = strings.TrimPrefix(path, "file:")
		dialector = sqlite.Open(path)
	} else {
		// Default to MySQL
		dialector = mysql.Open(dsn)
	}

	gormDB, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, err
	}

	// Connection pool settings (only applicable for MySQL, SQLite is single-connection)
	if !strings.HasPrefix(dsn, "sqlite:") && !strings.HasPrefix(dsn, "file:") {
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
		sqlDB.SetMaxOpenConns(20)
		sqlDB.SetMaxIdleConns(10)
	}

	return gormDB, nil
}

func AutoMigrate(gormDB *gorm.DB) error {
	return gormDB.AutoMigrate(
		&models.User{},
		&models.Course{},
		&models.CourseEnrollment{},
		&models.Chapter{},
		&models.ChapterProgress{},
		&models.Assignment{},
		&models.Submission{},
		&models.Resource{},
		&models.Quiz{},
		&models.Question{},
		&models.QuizAttempt{},
		// New models for announcements and attendance
		&models.Announcement{},
		&models.AnnouncementRead{},
		&models.AttendanceSession{},
		&models.AttendanceRecord{},
		// Student learning profile for AI tutoring
		&models.StudentLearningProfile{},
		// Student-centric models for multi-course tracking
		&models.StudentGlobalProfile{},
		&models.LearningEvent{},
		&models.WritingSubmission{},
	)
}
