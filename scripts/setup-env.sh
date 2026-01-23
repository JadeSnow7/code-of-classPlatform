#!/bin/bash

# 一键式环境配置脚本
# One-click environment setup script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

echo -e "${BLUE}🚀 电磁场教学平台环境配置脚本${NC}"
echo -e "${BLUE}   EMField Teaching Platform Environment Setup${NC}"
echo ""

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if running on supported OS
check_os() {
    print_info "检查操作系统兼容性..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        print_status "检测到 Linux 系统"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        print_status "检测到 macOS 系统"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
        print_status "检测到 Windows 系统"
    else
        print_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_info "检查必要的依赖..."
    
    local missing_deps=()
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    else
        print_status "Docker 已安装: $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing_deps+=("docker-compose")
    else
        if command -v docker-compose &> /dev/null; then
            print_status "Docker Compose 已安装: $(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)"
        else
            print_status "Docker Compose 已安装: $(docker compose version | cut -d' ' -f4)"
        fi
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        missing_deps+=("git")
    else
        print_status "Git 已安装: $(git --version | cut -d' ' -f3)"
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "缺少以下依赖: ${missing_deps[*]}"
        print_info "请先安装这些依赖后再运行此脚本"
        exit 1
    fi
}

# Setup environment file
setup_env_file() {
    print_info "配置环境变量文件..."
    
    if [ ! -f "$ENV_EXAMPLE" ]; then
        print_error "找不到 .env.example 文件"
        exit 1
    fi
    
    if [ -f "$ENV_FILE" ]; then
        print_warning ".env 文件已存在"
        read -p "是否要覆盖现有的 .env 文件? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "跳过环境文件配置"
            return
        fi
    fi
    
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    print_status "已创建 .env 文件"
    
    # Generate random JWT secret
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i.bak "s/BACKEND_JWT_SECRET=.*/BACKEND_JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
        rm "$ENV_FILE.bak" 2>/dev/null || true
        print_status "已生成随机 JWT 密钥"
    fi
    
    print_warning "请编辑 .env 文件以配置您的具体环境变量"
}

# Create necessary directories
create_directories() {
    print_info "创建必要的目录..."
    
    local dirs=(
        "$PROJECT_ROOT/data/mysql"
        "$PROJECT_ROOT/data/ai"
        "$PROJECT_ROOT/logs"
        "$PROJECT_ROOT/backup"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_status "已创建目录: $dir"
        fi
    done
}

# Setup Docker networks
setup_docker_networks() {
    print_info "设置 Docker 网络..."
    
    local networks=("emfield_dev" "emfield_frontend" "emfield_backend" "emfield_monitoring")
    
    for network in "${networks[@]}"; do
        if ! docker network ls | grep -q "$network"; then
            docker network create "$network" 2>/dev/null || true
            print_status "已创建 Docker 网络: $network"
        fi
    done
}

# Pull Docker images
pull_docker_images() {
    print_info "拉取 Docker 镜像..."
    
    local images=(
        "mysql:8.4"
        "nginx:alpine"
        "prom/prometheus:latest"
        "grafana/grafana:latest"
        "prom/node-exporter:latest"
    )
    
    for image in "${images[@]}"; do
        print_info "拉取镜像: $image"
        docker pull "$image"
    done
    
    print_status "Docker 镜像拉取完成"
}

# Test environment
test_environment() {
    print_info "测试环境配置..."
    
    cd "$PROJECT_ROOT"
    
    # Test Docker Compose files
    if docker-compose -f code/deployment/docker/docker-compose.dev.yml config > /dev/null 2>&1; then
        print_status "开发环境配置文件验证通过"
    else
        print_error "开发环境配置文件验证失败"
        return 1
    fi
    
    if docker-compose -f code/deployment/docker/docker-compose.prod.yml config > /dev/null 2>&1; then
        print_status "生产环境配置文件验证通过"
    else
        print_error "生产环境配置文件验证失败"
        return 1
    fi
    
    print_status "环境配置测试通过"
}

# Main setup function
main() {
    echo -e "${BLUE}开始环境配置...${NC}"
    echo ""
    
    check_os
    check_prerequisites
    setup_env_file
    create_directories
    setup_docker_networks
    
    # Ask if user wants to pull images
    read -p "是否要拉取 Docker 镜像? 这可能需要一些时间 (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pull_docker_images
    fi
    
    test_environment
    
    echo ""
    echo -e "${GREEN}🎉 环境配置完成!${NC}"
    echo ""
    echo -e "${BLUE}下一步:${NC}"
    echo "1. 编辑 .env 文件以配置您的环境变量"
    echo "2. 运行开发环境: ./scripts/dev-up.sh"
    echo "3. 运行生产环境: ./scripts/prod-up.sh"
    echo "4. 查看监控: ./scripts/monitoring-up.sh"
    echo ""
    echo -e "${YELLOW}注意: 请确保配置了正确的 LLM API 密钥和其他必要的环境变量${NC}"
}

# Run main function
main "$@"