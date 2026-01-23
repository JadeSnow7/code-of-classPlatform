#!/bin/bash

# 停止监控服务脚本
# Stop monitoring services script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/monitoring/docker-compose.monitoring.yml"

echo -e "${BLUE}📊 停止监控服务...${NC}"

# Change to project root
cd "$PROJECT_ROOT"

# Stop monitoring services
echo -e "${BLUE}停止监控服务...${NC}"
docker-compose -f "$COMPOSE_FILE" down

echo ""
echo -e "${GREEN}✓ 监控服务已停止${NC}"