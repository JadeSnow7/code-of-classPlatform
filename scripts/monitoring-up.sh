#!/bin/bash

# 启动监控服务脚本
# Start monitoring services script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/monitoring/docker-compose.monitoring.yml"

echo -e "${BLUE}📊 启动监控服务...${NC}"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠ 未找到 .env 文件，使用默认配置...${NC}"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Start monitoring services
echo -e "${BLUE}启动监控服务...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for services to start
echo -e "${BLUE}等待服务启动...${NC}"
sleep 15

# Check service status
echo -e "${BLUE}检查服务状态...${NC}"
docker-compose -f "$COMPOSE_FILE" ps

echo ""
echo -e "${GREEN}✓ 监控服务启动完成!${NC}"
echo ""
echo -e "${BLUE}监控服务访问地址:${NC}"
echo "• Grafana 仪表板: http://localhost:3000"
echo "  - 默认用户名: admin"
echo "  - 默认密码: admin"
echo "• Prometheus: http://localhost:9090"
echo "• Node Exporter: http://localhost:9100"
echo "• cAdvisor: http://localhost:8080"
echo ""
echo -e "${BLUE}常用命令:${NC}"
echo "• 查看日志: docker-compose -f $COMPOSE_FILE logs -f [service_name]"
echo "• 停止监控: ./scripts/monitoring-down.sh"
echo "• 重启服务: docker-compose -f $COMPOSE_FILE restart [service_name]"
echo ""
echo -e "${YELLOW}注意: 首次访问 Grafana 时请更改默认密码${NC}"