package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/config"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/db"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("Usage: go run seed_users.go <path-to-csv>")
	}
	csvPath := os.Args[1]

	// Load config
	cfg := config.Load()

	// Connect to database
	gormDB, err := db.Open(cfg.DBDsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Auto migrate
	if err := db.AutoMigrate(gormDB); err != nil {
		log.Fatalf("Failed to migrate: %v", err)
	}

	// Open CSV file
	file, err := os.Open(csvPath)
	if err != nil {
		log.Fatalf("Failed to open CSV: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	created := 0
	skipped := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and BOM
		line = strings.TrimPrefix(line, "\ufeff")
		if line == "" {
			continue
		}

		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			log.Printf("Line %d: invalid format (expected: username,role,password)", lineNum)
			continue
		}

		username := strings.TrimSpace(parts[0])
		roleRaw := strings.ToLower(strings.TrimSpace(parts[1]))
		password := strings.TrimSpace(parts[2])

		// Normalize role
		var role string
		switch roleRaw {
		case "teacher", "教师":
			role = "teacher"
		case "student", "学生":
			role = "student"
		case "assistant", "助教":
			role = "assistant"
		case "admin", "管理员":
			role = "admin"
		default:
			log.Printf("Line %d: unknown role '%s', skipping", lineNum, roleRaw)
			continue
		}

		// Check if user exists
		var existing models.User
		if err := gormDB.Where("username = ?", username).First(&existing).Error; err == nil {
			log.Printf("User '%s' already exists, skipping", username)
			skipped++
			continue
		}

		// Hash password
		hash, err := auth.HashPassword(password)
		if err != nil {
			log.Printf("Line %d: failed to hash password: %v", lineNum, err)
			continue
		}

		// Create user
		user := models.User{
			Username:     username,
			PasswordHash: hash,
			Role:         role,
			Name:         username, // Use username as display name
		}

		if err := gormDB.Create(&user).Error; err != nil {
			log.Printf("Line %d: failed to create user: %v", lineNum, err)
			continue
		}

		log.Printf("Created user: %s (%s)", username, role)
		created++
	}

	fmt.Printf("\n=== Import Complete ===\n")
	fmt.Printf("Created: %d users\n", created)
	fmt.Printf("Skipped: %d users (already exist)\n", skipped)
}
