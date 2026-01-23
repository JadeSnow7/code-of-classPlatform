#!/bin/bash
# 本地开发启动脚本

export DB_DSN='emfield:EmField2024Pass!@tcp(localhost:3306)/emfield?charset=utf8mb4&parseTime=True&loc=Local'
export MINIO_ENDPOINT='localhost:9000'
export MINIO_ACCESS_KEY='minioadmin'
export MINIO_SECRET_KEY='minioadmin123'
export MINIO_BUCKET='emfield-uploads'
export CORS_ORIGINS='http://localhost:5173,http://localhost:5174'

cd "$(dirname "$0")"
go run ./cmd/server
