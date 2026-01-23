#!/bin/bash

# 启动开发环境脚本
# Start development environment script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.dev.yml"

echo -e "${BLUE}🚀 启动开发环境...${NC}"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠ 未找到 .env 文件，正在从模板创建...${NC}"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo -e "${YELLOW}请编辑 .env 文件以配置您的环境变量${NC}"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Start services
echo -e "${BLUE}启动服务...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
echo -e "${BLUE}等待服务启动...${NC}"
sleep 10

# Check service status
echo -e "${BLUE}检查服务状态...${NC}"
docker-compose -f "$COMPOSE_FILE" ps

echo ""
echo -e "${GREEN}✓ 开发环境启动完成!${NC}"
echo ""
echo -e "${BLUE}服务访问地址:${NC}"
echo "• 前端: http://localhost:5173"
echo "• 后端 API: http://localhost:8080"
echo "• AI 服务: http://localhost:8001"
echo "• 仿真服务: http://localhost:8002"
echo "• 数据库: localhost:3306"
echo ""
echo -e "${BLUE}常用命令:${NC}"
echo "• 查看日志: docker-compose -f $COMPOSE_FILE logs -f [service_name]"
echo "• 停止服务: ./scripts/dev-down.sh"
echo "• 重启服务: docker-compose -f $COMPOSE_FILE restart [service_name]"