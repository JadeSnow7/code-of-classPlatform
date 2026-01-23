#!/bin/bash

# 停止开发环境脚本
# Stop development environment script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.dev.yml"

echo -e "${BLUE}🛑 停止开发环境...${NC}"

# Change to project root
cd "$PROJECT_ROOT"

# Stop services
echo -e "${BLUE}停止服务...${NC}"
docker-compose -f "$COMPOSE_FILE" down

# Ask if user wants to remove volumes
read -p "是否要删除数据卷? 这将清除所有数据 (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}删除数据卷...${NC}"
    docker-compose -f "$COMPOSE_FILE" down -v
    echo -e "${RED}⚠ 所有数据已被清除${NC}"
fi

echo ""
echo -e "${GREEN}✓ 开发环境已停止${NC}"