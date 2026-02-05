package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/config"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/db"
	httpapi "github.com/huaodong/emfield-teaching-platform/backend/internal/http"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/logger"
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
	seeded, err := db.SeedDemoUsers(gormDB)
	if err != nil {
		logger.Log.Error("db seed failed", slog.Any("error", err))
		os.Exit(1)
	}
	if seeded {
		logger.Log.Warn("bootstrap demo users created", slog.String("note", "admin/admin123, teacher/teacher123, student/student123 (please change in production)"))
	}

	aiClient := clients.NewAIClient(cfg.AIBaseURL)
	simClient := clients.NewSimClient(cfg.SimBaseURL)

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

	router := httpapi.NewRouter(cfg, gormDB, aiClient, simClient, minioClient)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
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
