package config

import (
	"os"
	"path/filepath"
	"strings"
)

func loadJWTSecretFromDir(secretsDir string) (string, error) {
	secretPath := filepath.Join(secretsDir, "jwt.key")
	data, err := os.ReadFile(secretPath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}
