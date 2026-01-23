package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/config"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/db"
	httpapi "github.com/huaodong/emfield-teaching-platform/backend/internal/http"
)

func main() {
	cfg := config.Load()

	gormDB, err := db.Open(cfg.DBDsn)
	if err != nil {
		log.Fatalf("db open failed: %v", err)
	}
	if err := db.AutoMigrate(gormDB); err != nil {
		log.Fatalf("db migrate failed: %v", err)
	}
	seeded, err := db.SeedDemoUsers(gormDB)
	if err != nil {
		log.Fatalf("db seed failed: %v", err)
	}
	if seeded {
		log.Printf("bootstrap demo users created: admin/admin123, teacher/teacher123, student/student123 (please change in production)")
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
		log.Printf("Warning: MinIO client initialization failed: %v (file upload will be disabled)", err)
		minioClient = nil
	}

	router := httpapi.NewRouter(cfg, gormDB, aiClient, simClient, minioClient)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("backend listening on %s", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen failed: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	log.Printf("backend stopped")
}
