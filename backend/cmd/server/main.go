package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/app"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/config"
	"github.com/huaodong/llm-teaching-platform/backend/internal/db"
	"github.com/huaodong/llm-teaching-platform/backend/internal/logger"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
)

func main() {
	logger.Init()
	cfg := config.Load()

	gormDB, err := db.Open(cfg.DBDsn)
	if err != nil {
		logger.Log.Error("db open failed", slog.Any("error", err))
		os.Exit(1)
	}
	if err := db.AutoMigrate(gormDB); err != nil {
		logger.Log.Error("db migrate failed", slog.Any("error", err))
		os.Exit(1)
	}
	if cfg.AllowDemoSeed {
		seeded, err := db.SeedDemoUsers(gormDB)
		if err != nil {
			logger.Log.Error("db seed failed", slog.Any("error", err))
			os.Exit(1)
		}
		if seeded {
			logger.Log.Warn("bootstrap demo users created", slog.String("note", "admin/admin123, teacher/teacher123, student/student123 (please change in production)"))
		}
	} else {
		var userCount int64
		if err := gormDB.Model(&models.User{}).Count(&userCount).Error; err != nil {
			logger.Log.Warn("failed to inspect bootstrap users", slog.Any("error", err))
		} else if userCount == 0 {
			logger.Log.Warn(
				"database has no users and demo seed is disabled",
				slog.String("hint", "set ALLOW_DEMO_SEED=true for local or integration environments to create bootstrap accounts"),
			)
		}
		logger.Log.Info("demo user seed disabled", slog.String("hint", "set ALLOW_DEMO_SEED=true to enable"))
	}

	aiClient := clients.NewAIClient(cfg.AIBaseURL, cfg.AIGatewaySharedToken)

	// Initialize MinIO client
	signedURLExpiry, err := time.ParseDuration(cfg.MinioSignedURLExpiry)
	if err != nil {
		signedURLExpiry = 7 * 24 * time.Hour // default 7 days
	}
	minioClient, err := clients.NewMinioClient(clients.MinioConfig{
		Endpoint:        cfg.MinioEndpoint,
		AccessKey:       cfg.MinioAccessKey,
		SecretKey:       cfg.MinioSecretKey,
		BucketName:      cfg.MinioBucket,
		UseSSL:          cfg.MinioUseSSL,
		SignedURLExpiry: signedURLExpiry,
	})
	if err != nil {
		logger.Log.Warn("minio client init failed (file upload disabled)", slog.Any("error", err))
		minioClient = nil
	}

	// Initialize application with centralized DI
	application := app.New(cfg, gormDB, aiClient, minioClient)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           application.Router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Log.Info("backend listening", slog.String("addr", cfg.HTTPAddr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Log.Error("listen failed", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	logger.Log.Info("backend stopped")
}
