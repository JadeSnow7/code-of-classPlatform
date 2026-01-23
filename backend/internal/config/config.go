package config

import (
	"os"
	"strings"
)

type Config struct {
	HTTPAddr    string
	JWTSecret   string
	CorsOrigins []string

	DBDsn string

	AIBaseURL  string
	SimBaseURL string

	// WeChat Work (企业微信) configuration
	WecomCorpID  string
	WecomAgentID string
	WecomSecret  string

	// MinIO configuration
	MinioEndpoint        string
	MinioAccessKey       string
	MinioSecretKey       string
	MinioBucket          string
	MinioUseSSL          bool
	MinioSignedURLExpiry string
}

func Load() Config {
	httpAddr := getenv("HTTP_ADDR", "0.0.0.0:8080")
	jwtSecret := getenv("JWT_SECRET", "change_me_in_prod")

	corsOriginsRaw := strings.TrimSpace(getenv("CORS_ORIGINS", "http://localhost:5173"))
	corsOrigins := splitComma(corsOriginsRaw)
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"http://localhost:5173"}
	}

	dbDsn := getenv("DB_DSN", "root:root@tcp(127.0.0.1:3306)/emfield?charset=utf8mb4&parseTime=True&loc=Local")

	aiBaseURL := strings.TrimRight(getenv("AI_BASE_URL", "http://127.0.0.1:8001"), "/")
	simBaseURL := strings.TrimRight(getenv("SIM_BASE_URL", "http://127.0.0.1:8002"), "/")

	// WeChat Work config (optional)
	wecomCorpID := getenv("WECOM_CORPID", "")
	wecomAgentID := getenv("WECOM_AGENTID", "")
	wecomSecret := getenv("WECOM_SECRET", "")

	// MinIO config
	minioUseSSL := getenv("MINIO_USE_SSL", "false") == "true"

	return Config{
		HTTPAddr:             httpAddr,
		JWTSecret:            jwtSecret,
		CorsOrigins:          corsOrigins,
		DBDsn:                dbDsn,
		AIBaseURL:            aiBaseURL,
		SimBaseURL:           simBaseURL,
		WecomCorpID:          wecomCorpID,
		WecomAgentID:         wecomAgentID,
		WecomSecret:          wecomSecret,
		MinioEndpoint:        getenv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey:       getenv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey:       getenv("MINIO_SECRET_KEY", "minioadmin123"),
		MinioBucket:          getenv("MINIO_BUCKET", "emfield-uploads"),
		MinioUseSSL:          minioUseSSL,
		MinioSignedURLExpiry: getenv("MINIO_SIGNED_URL_EXPIRY", "168h"),
	}
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func splitComma(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}
