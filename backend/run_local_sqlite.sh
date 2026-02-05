#!/bin/bash
# 本地开发启动脚本 (SQLite版)

export DB_DSN='sqlite:emfield.db'
export MINIO_ENDPOINT='localhost:9000'
export MINIO_ACCESS_KEY='minioadmin'
export MINIO_SECRET_KEY='minioadmin123'
export MINIO_BUCKET='emfield-uploads'
export CORS_ORIGINS='http://localhost:5173,http://localhost:5174,http://localhost:8081' # Add 8081 for mobile

cd "$(dirname "$0")"
go run ./cmd/server
