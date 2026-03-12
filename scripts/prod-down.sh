#!/bin/bash

# 停止生产环境脚本
# Stop production environment script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.prod.yml"
DATA_ROOT="$PROJECT_ROOT/deployment/docker/data"

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    COMPOSE_CMD=(docker compose)
fi

echo -e "${BLUE}🛑 停止生产环境...${NC}"

# Warning for production
echo -e "${YELLOW}⚠ 您即将停止生产环境${NC}"
echo -e "${YELLOW}这将影响正在运行的服务${NC}"
echo ""
read -p "确认停止生产环境? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}已取消停止操作${NC}"
    exit 0
fi

# Change to project root
cd "$PROJECT_ROOT"

# Ask if user wants to create backup before stopping
read -p "是否要在停止前创建数据备份? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo -e "${BLUE}创建备份...${NC}"
    if [ -f "$PROJECT_ROOT/scripts/backup.sh" ]; then
        "$PROJECT_ROOT/scripts/backup.sh"
    else
        echo -e "${YELLOW}⚠ 备份脚本不存在，跳过备份${NC}"
    fi
fi

# Stop services gracefully
echo -e "${BLUE}优雅停止服务...${NC}"
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" stop

# Remove containers
echo -e "${BLUE}移除容器...${NC}"
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" down

# Ask if user wants to remove persistent data
read -p "是否要删除持久化数据目录? 这将清除 MySQL/MinIO/AI 数据 (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}删除持久化数据目录...${NC}"
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" down -v
    find "$DATA_ROOT/mysql" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    find "$DATA_ROOT/minio" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    find "$DATA_ROOT/ai-service" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    echo -e "${RED}⚠ 所有数据已被清除${NC}"
fi

echo ""
echo -e "${GREEN}✓ 生产环境已停止${NC}"
