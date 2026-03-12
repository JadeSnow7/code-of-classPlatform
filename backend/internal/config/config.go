package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr         string
	JWTSecret        string
	SecretsDir       string
	CorsOrigins      []string
	PublicWebBaseURL string

	AccessTokenTTL     time.Duration
	RefreshTokenTTL    time.Duration
	ActivationTokenTTL time.Duration
	AuthBcryptCost     int

	DBDsn         string
	AllowDemoSeed bool

	AIBaseURL             string
	MultiAgentBaseURL     string
	AIOrchestratedEnabled bool
	SimBaseURL            string
	AIGatewaySharedToken  string

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
	secretsDir := strings.TrimSpace(getenv("SECRETS_DIR", ""))
	jwtSecret := getenv("JWT_SECRET", "change_me_in_prod")
	if secretsDir != "" {
		if secretFromFile, err := loadJWTSecretFromDir(secretsDir); err == nil && strings.TrimSpace(secretFromFile) != "" {
			jwtSecret = secretFromFile
		}
	}

	corsOriginsRaw := strings.TrimSpace(getenv("CORS_ORIGINS", "http://localhost:5173"))
	corsOrigins := splitComma(corsOriginsRaw)
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"http://localhost:5173"}
	}

	dbDsn := getenv("DB_DSN", "root:root@tcp(127.0.0.1:3306)/emfield?charset=utf8mb4&parseTime=True&loc=Local")
	publicWebBaseURL := strings.TrimRight(getenv("PUBLIC_WEB_BASE_URL", "http://localhost:5173"), "/")
	accessTokenTTL := parseDurationEnv("ACCESS_TOKEN_TTL", 15*time.Minute)
	refreshTokenTTL := parseDurationEnv("REFRESH_TOKEN_TTL", 14*24*time.Hour)
	activationTokenTTL := parseDurationEnv("ACTIVATION_TOKEN_TTL", 72*time.Hour)
	authBcryptCost := parseIntEnv("AUTH_BCRYPT_COST", 10)
	if authBcryptCost < 4 {
		authBcryptCost = 10
	}

	aiBaseURL := strings.TrimRight(getenv("AI_BASE_URL", "http://127.0.0.1:8001"), "/")
	multiAgentBaseURL := strings.TrimRight(getenv("MULTI_AGENT_BASE_URL", "http://127.0.0.1:8003"), "/")
	simBaseURL := strings.TrimRight(getenv("SIM_BASE_URL", "http://127.0.0.1:8002"), "/")

	// WeChat Work config (optional)
	wecomCorpID := getenv("WECOM_CORPID", "")
	wecomAgentID := getenv("WECOM_AGENTID", "")
	wecomSecret := getenv("WECOM_SECRET", "")

	// MinIO config
	minioUseSSL := getenv("MINIO_USE_SSL", "false") == "true"
	allowDemoSeed := strings.EqualFold(strings.TrimSpace(getenv("ALLOW_DEMO_SEED", "false")), "true")

	return Config{
		HTTPAddr:              httpAddr,
		JWTSecret:             jwtSecret,
		SecretsDir:            secretsDir,
		CorsOrigins:           corsOrigins,
		PublicWebBaseURL:      publicWebBaseURL,
		AccessTokenTTL:        accessTokenTTL,
		RefreshTokenTTL:       refreshTokenTTL,
		ActivationTokenTTL:    activationTokenTTL,
		AuthBcryptCost:        authBcryptCost,
		DBDsn:                 dbDsn,
		AllowDemoSeed:         allowDemoSeed,
		AIBaseURL:             aiBaseURL,
		MultiAgentBaseURL:     multiAgentBaseURL,
		AIOrchestratedEnabled: strings.EqualFold(strings.TrimSpace(getenv("AI_ORCHESTRATED_ENABLED", "false")), "true"),
		SimBaseURL:            simBaseURL,
		AIGatewaySharedToken:  getenv("AI_GATEWAY_SHARED_TOKEN", ""),
		WecomCorpID:           wecomCorpID,
		WecomAgentID:          wecomAgentID,
		WecomSecret:           wecomSecret,
		MinioEndpoint:         getenv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey:        getenv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey:        getenv("MINIO_SECRET_KEY", "minioadmin123"),
		MinioBucket:           getenv("MINIO_BUCKET", "emfield-uploads"),
		MinioUseSSL:           minioUseSSL,
		MinioSignedURLExpiry:  getenv("MINIO_SIGNED_URL_EXPIRY", "168h"),
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

func parseDurationEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(getenv(key, ""))
	if raw == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseIntEnv(key string, fallback int) int {
	raw := strings.TrimSpace(getenv(key, ""))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return parsed
}
