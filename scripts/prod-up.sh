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
DATA_ROOT="$PROJECT_ROOT/deployment/docker/data"

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    COMPOSE_CMD=(docker compose)
fi

run_compose_exec() {
    local service="$1"
    shift
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$service" "$@"
}

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
    "BACKEND_CORS_ORIGINS"
    "PUBLIC_WEB_BASE_URL"
    "AI_GATEWAY_SHARED_TOKEN"
    "MINIO_ACCESS_KEY"
    "MINIO_SECRET_KEY"
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

if [ "${ALLOW_DEMO_SEED:-false}" != "false" ]; then
    echo -e "${RED}✗ 生产环境禁止 ALLOW_DEMO_SEED=true${NC}"
    exit 1
fi

if [ "${BACKEND_CORS_ORIGINS:-}" = "*" ]; then
    echo -e "${RED}✗ 生产环境禁止 BACKEND_CORS_ORIGINS=*${NC}"
    exit 1
fi

if [[ "${BACKEND_CORS_ORIGINS:-}" == *"your-production-domain.example.com"* ]]; then
    echo -e "${RED}✗ 请先将 BACKEND_CORS_ORIGINS 替换为真实生产域名${NC}"
    exit 1
fi

if [[ "${PUBLIC_WEB_BASE_URL:-}" == *"your-production-domain.example.com"* ]]; then
    echo -e "${RED}✗ 请先将 PUBLIC_WEB_BASE_URL 替换为真实生产域名${NC}"
    exit 1
fi

mkdir -p "$DATA_ROOT/mysql" "$DATA_ROOT/minio" "$DATA_ROOT/ai-service"

# Warning for production
echo -e "${YELLOW}⚠ 您即将启动生产环境${NC}"
echo -e "${YELLOW}请确保:${NC}"
echo "1. 已正确配置所有环境变量"
echo "2. 已设置强密码和安全密钥"
echo "3. 已配置防火墙和安全组"
echo "4. 当前为 HTTP-only 临时部署"
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
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" up -d --build

# Wait for services to be healthy
echo -e "${BLUE}等待服务启动...${NC}"
sleep 30

# Check service status
echo -e "${BLUE}检查服务状态...${NC}"
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps

# Run health checks
echo -e "${BLUE}运行健康检查...${NC}"
sleep 10

public_health_url="${PUBLIC_WEB_BASE_URL%/}/healthz"
http_health_url="${public_health_url/https:\/\//http://}"
if curl -fsS "$http_health_url" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 公网入口健康检查通过: $http_health_url${NC}"
else
    echo -e "${YELLOW}⚠ 公网入口健康检查失败: $http_health_url${NC}"
fi

if run_compose_exec backend wget -q -O /dev/null http://127.0.0.1:8080/health; then
    echo -e "${GREEN}✓ backend 容器内健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠ backend 容器内健康检查失败${NC}"
fi

if run_compose_exec ai python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/healthz').read()"; then
    echo -e "${GREEN}✓ ai 容器内健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠ ai 容器内健康检查失败${NC}"
fi

if run_compose_exec sim python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/healthz').read()"; then
    echo -e "${GREEN}✓ sim 容器内健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠ sim 容器内健康检查失败${NC}"
fi

if run_compose_exec multi-agent python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8003/healthz').read()"; then
    echo -e "${GREEN}✓ multi-agent 容器内健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠ multi-agent 容器内健康检查失败${NC}"
fi

echo ""
echo -e "${GREEN}✓ 生产环境启动完成!${NC}"
echo ""
echo -e "${BLUE}服务访问地址:${NC}"
echo "• 应用: ${PUBLIC_WEB_BASE_URL/https:\/\//http://}"
echo "• API: ${PUBLIC_WEB_BASE_URL/https:\/\//http://}/api/v1"
echo ""
echo -e "${BLUE}常用命令:${NC}"
echo "• 查看日志: ${COMPOSE_CMD[*]} -f $COMPOSE_FILE logs -f [service_name]"
echo "• 容器内运维: ${COMPOSE_CMD[*]} -f $COMPOSE_FILE exec -T [service_name] sh"
echo "• 停止服务: ./scripts/prod-down.sh"
echo "• 备份数据: ./scripts/backup.sh"
echo "• 监控服务: ./scripts/monitoring-up.sh"
