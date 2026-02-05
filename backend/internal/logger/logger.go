package logger

import (
	"log/slog"
	"os"
	"strings"
)

var Log = slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "backend")

// Init configures the global structured logger.
func Init() {
	level := parseLevel(getenv("LOG_LEVEL", "info"))
	format := strings.ToLower(getenv("LOG_FORMAT", "json"))

	opts := &slog.HandlerOptions{
		Level: level,
	}

	var handler slog.Handler
	if format == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	Log = slog.New(handler).With("service", "backend")
	slog.SetDefault(Log)
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(raw) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
