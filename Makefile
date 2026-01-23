# Makefile for code quality checks and common tasks

.PHONY: help install lint format test build clean dev

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Installation
install: ## Install all dependencies
	@echo "Installing dependencies..."
	cd frontend && npm install
	cd backend && go mod download
	cd ai_service && pip install -r requirements.txt
	cd simulation && pip install -r requirements.txt

# Linting
lint: lint-frontend lint-backend lint-python ## Run all linters

lint-frontend: ## Lint frontend code
	@echo "Linting frontend..."
	cd frontend && npm run lint

lint-backend: ## Lint backend code
	@echo "Linting backend..."
	cd backend && golangci-lint run

lint-python: ## Lint Python code
	@echo "Linting Python code..."
	cd ai_service && flake8 .
	cd simulation && flake8 .

# Formatting
format: format-frontend format-backend format-python ## Format all code

format-frontend: ## Format frontend code
	@echo "Formatting frontend..."
	cd frontend && npm run format

format-backend: ## Format backend code
	@echo "Formatting backend..."
	cd backend && gofmt -w .
	cd backend && goimports -w .

format-python: ## Format Python code
	@echo "Formatting Python code..."
	cd ai_service && black . && isort .
	cd simulation && black . && isort .

# Testing
test: test-frontend test-backend test-python ## Run all tests

test-frontend: ## Run frontend tests
	@echo "Running frontend tests..."
	cd frontend && npm run test

test-backend: ## Run backend tests
	@echo "Running backend tests..."
	cd backend && go test -v ./...

test-python: ## Run Python tests
	@echo "Running Python tests..."
	cd ai_service && pytest
	cd simulation && pytest

# Coverage
coverage: coverage-backend coverage-python ## Generate test coverage reports

coverage-backend: ## Generate backend coverage
	@echo "Generating backend coverage..."
	cd backend && go test -coverprofile=coverage.out ./...
	cd backend && go tool cover -html=coverage.out -o coverage.html

coverage-python: ## Generate Python coverage
	@echo "Generating Python coverage..."
	cd ai_service && pytest --cov=app --cov-report=html
	cd simulation && pytest --cov=app --cov-report=html

# Building
build: build-frontend build-backend ## Build all services

build-frontend: ## Build frontend
	@echo "Building frontend..."
	cd frontend && npm run build

build-backend: ## Build backend
	@echo "Building backend..."
	cd backend && go build -o bin/server ./cmd/server

# Docker
docker-build: ## Build all Docker images
	@echo "Building Docker images..."
	docker-compose build

docker-up: ## Start all services with Docker
	@echo "Starting services..."
	docker-compose up -d

docker-down: ## Stop all services
	@echo "Stopping services..."
	docker-compose down

# Development
dev: ## Start development environment
	@echo "Starting development environment..."
	./scripts/dev-up.sh

dev-stop: ## Stop development environment
	@echo "Stopping development environment..."
	./scripts/dev-down.sh

# Cleaning
clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.cache
	rm -rf backend/bin
	rm -rf backend/coverage.out
	rm -rf backend/coverage.html
	find . -name "__pycache__" -type d -exec rm -rf {} +
	find . -name "*.pyc" -delete
	find . -name ".coverage" -delete
	find . -name "htmlcov" -type d -exec rm -rf {} +

# Quality checks
quality: lint format test ## Run all quality checks

# Pre-commit checks
pre-commit: format lint test ## Run pre-commit checks

# CI/CD
ci: install quality build ## Run CI pipeline

# Database
db-migrate: ## Run database migrations
	@echo "Running database migrations..."
	cd backend && go run ./cmd/migrate

db-seed: ## Seed database with test data
	@echo "Seeding database..."
	cd backend && go run ./cmd/seed

# Documentation
docs: ## Generate documentation
	@echo "Generating documentation..."
	cd backend && godoc -http=:6060 &
	@echo "Documentation server started at http://localhost:6060"

# Security
security: ## Run security checks
	@echo "Running security checks..."
	cd backend && gosec ./...
	cd ai_service && bandit -r .
	cd simulation && bandit -r .