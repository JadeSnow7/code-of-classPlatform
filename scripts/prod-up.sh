#!/bin/bash

# 启动生产环境脚本
# Start production environment script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.prod.yml"

echo -e "${BLUE}🚀 启动生产环境...${NC}"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}✗ 未找到 .env 文件${NC}"
    echo -e "${YELLOW}请先运行 ./scripts/setup-env.sh 来配置环境${NC}"
    exit 1
fi

# Validate required environment variables
source "$PROJECT_ROOT/.env"

required_vars=(
    "MYSQL_ROOT_PASSWORD"
    "MYSQL_DATABASE"
    "MYSQL_USER"
    "MYSQL_PASSWORD"
    "BACKEND_JWT_SECRET"
    "LLM_BASE_URL"
    "LLM_API_KEY"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}✗ 缺少必要的环境变量: ${missing_vars[*]}${NC}"
    echo -e "${YELLOW}请编辑 .env 文件并设置这些变量${NC}"
    exit 1
fi

# Warning for production
echo -e "${YELLOW}⚠ 您即将启动生产环境${NC}"
echo -e "${YELLOW}请确保:${NC}"
echo "1. 已正确配置所有环境变量"
echo "2. 已设置强密码和安全密钥"
echo "3. 已配置 SSL 证书（如需要）"
echo "4. 已配置防火墙和安全组"
echo ""
read -p "确认启动生产环境? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}已取消启动${NC}"
    exit 0
fi

# Change to project root
cd "$PROJECT_ROOT"

# Build and start services
echo -e "${BLUE}构建并启动服务...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d --build

# Wait for services to be healthy
echo -e "${BLUE}等待服务启动...${NC}"
sleep 30

# Check service status
echo -e "${BLUE}检查服务状态...${NC}"
docker-compose -f "$COMPOSE_FILE" ps

# Run health checks
echo -e "${BLUE}运行健康检查...${NC}"
sleep 10

# Check if services are responding
services=("backend:8080/health" "ai:8001/health" "sim:8002/health")
for service in "${services[@]}"; do
    if docker-compose -f "$COMPOSE_FILE" exec -T ${service%:*} curl -f "http://localhost:${service#*:}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ ${service%:*} 服务健康${NC}"
    else
        echo -e "${YELLOW}⚠ ${service%:*} 服务可能未完全启动${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ 生产环境启动完成!${NC}"
echo ""
echo -e "${BLUE}服务访问地址:${NC}"
echo "• 应用: http://localhost (通过 Nginx)"
echo "• API: http://localhost/api"
echo ""
echo -e "${BLUE}常用命令:${NC}"
echo "• 查看日志: docker-compose -f $COMPOSE_FILE logs -f [service_name]"
echo "• 停止服务: ./scripts/prod-down.sh"
echo "• 备份数据: ./scripts/backup.sh"
echo "• 监控服务: ./scripts/monitoring-up.sh"