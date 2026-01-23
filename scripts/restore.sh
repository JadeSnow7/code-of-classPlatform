#!/bin/bash

# 数据恢复脚本
# Data restore script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backup"

echo -e "${BLUE}🔄 数据恢复脚本${NC}"

# Check if backup timestamp is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}✗ 请提供备份时间戳${NC}"
    echo "用法: $0 <backup_timestamp>"
    echo ""
    echo -e "${BLUE}可用的备份:${NC}"
    find "$BACKUP_DIR" -name "backup_manifest_*.txt" -type f | sort -r | head -10 | while read manifest; do
        timestamp=$(basename "$manifest" | sed 's/backup_manifest_\(.*\)\.txt/\1/')
        backup_date=$(head -1 "$manifest" | cut -d: -f2-)
        echo "• $timestamp -$backup_date"
    done
    exit 1
fi

TIMESTAMP="$1"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
else
    echo -e "${RED}✗ 未找到 .env 文件${NC}"
    exit 1
fi

# Check if backup exists
MANIFEST_FILE="$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
if [ ! -f "$MANIFEST_FILE" ]; then
    echo -e "${RED}✗ 找不到备份时间戳 $TIMESTAMP 的备份${NC}"
    exit 1
fi

echo -e "${BLUE}恢复备份: $TIMESTAMP${NC}"
echo -e "${BLUE}备份信息:${NC}"
head -5 "$MANIFEST_FILE"
echo ""

# Warning
echo -e "${YELLOW}⚠ 警告: 恢复操作将覆盖现有数据${NC}"
echo -e "${YELLOW}请确保已停止相关服务${NC}"
echo ""
read -p "确认继续恢复操作? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}已取消恢复操作${NC}"
    exit 0
fi

# Function to restore MySQL database
restore_mysql() {
    local backup_file="$BACKUP_DIR/mysql_backup_$TIMESTAMP.sql.gz"
    
    if [ ! -f "$backup_file" ]; then
        echo -e "${YELLOW}⚠ MySQL 备份文件不存在，跳过数据库恢复${NC}"
        return
    fi
    
    echo -e "${BLUE}恢复 MySQL 数据库...${NC}"
    
    # Check if MySQL container is running
    if ! docker ps | grep -q mysql; then
        echo -e "${RED}✗ MySQL 容器未运行${NC}"
        echo -e "${YELLOW}请先启动 MySQL 服务${NC}"
        return 1
    fi
    
    # Wait for MySQL to be ready
    echo -e "${BLUE}等待 MySQL 准备就绪...${NC}"
    sleep 5
    
    # Restore database
    gunzip -c "$backup_file" | docker exec -i mysql mysql \
        -u"$MYSQL_USER" \
        -p"$MYSQL_PASSWORD" \
        "$MYSQL_DATABASE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ MySQL 数据库恢复完成${NC}"
    else
        echo -e "${RED}✗ MySQL 数据库恢复失败${NC}"
        return 1
    fi
}

# Function to restore AI service data
restore_ai_data() {
    local backup_file="$BACKUP_DIR/ai_data_backup_$TIMESTAMP.tar.gz"
    
    if [ ! -f "$backup_file" ]; then
        echo -e "${YELLOW}⚠ AI 数据备份文件不存在，跳过 AI 数据恢复${NC}"
        return
    fi
    
    echo -e "${BLUE}恢复 AI 服务数据...${NC}"
    
    # Check if AI container is running
    if ! docker ps | grep -q ai; then
        echo -e "${RED}✗ AI 服务容器未运行${NC}"
        echo -e "${YELLOW}请先启动 AI 服务${NC}"
        return 1
    fi
    
    # Restore AI data
    docker exec -i ai sh -c 'rm -rf /app/data/* && tar -xzf - -C /' < "$backup_file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ AI 服务数据恢复完成${NC}"
    else
        echo -e "${RED}✗ AI 服务数据恢复失败${NC}"
        return 1
    fi
}

# Function to restore configuration files
restore_configs() {
    local backup_file="$BACKUP_DIR/configs_backup_$TIMESTAMP.tar.gz"
    
    if [ ! -f "$backup_file" ]; then
        echo -e "${YELLOW}⚠ 配置文件备份不存在，跳过配置恢复${NC}"
        return
    fi
    
    echo -e "${BLUE}恢复配置文件...${NC}"
    
    # Ask for confirmation before overwriting configs
    read -p "是否要恢复配置文件? 这将覆盖当前配置 (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}跳过配置文件恢复${NC}"
        return
    fi
    
    # Create backup of current configs
    local current_backup="$BACKUP_DIR/current_configs_$(date +%Y%m%d_%H%M%S).tar.gz"
    tar -czf "$current_backup" -C "$PROJECT_ROOT" .env deployment/ scripts/ 2>/dev/null
    echo -e "${BLUE}当前配置已备份到: $current_backup${NC}"
    
    # Restore configs
    tar -xzf "$backup_file" -C "$PROJECT_ROOT"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 配置文件恢复完成${NC}"
    else
        echo -e "${RED}✗ 配置文件恢复失败${NC}"
        return 1
    fi
}

# Function to verify restore
verify_restore() {
    echo -e "${BLUE}验证恢复结果...${NC}"
    
    # Check if services are responding
    local services=("mysql:3306" "backend:8080" "ai:8001" "sim:8002")
    local failed_services=()
    
    for service in "${services[@]}"; do
        local container=${service%:*}
        local port=${service#*:}
        
        if docker ps | grep -q "$container"; then
            if [ "$container" = "mysql" ]; then
                if docker exec mysql mysqladmin ping -h localhost > /dev/null 2>&1; then
                    echo -e "${GREEN}✓ $container 服务正常${NC}"
                else
                    failed_services+=("$container")
                fi
            else
                if docker exec "$container" curl -f "http://localhost:$port/health" > /dev/null 2>&1; then
                    echo -e "${GREEN}✓ $container 服务正常${NC}"
                else
                    failed_services+=("$container")
                fi
            fi
        else
            echo -e "${YELLOW}⚠ $container 容器未运行${NC}"
        fi
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ 所有服务验证通过${NC}"
    else
        echo -e "${YELLOW}⚠ 以下服务可能需要重启: ${failed_services[*]}${NC}"
    fi
}

# Main restore function
main() {
    echo -e "${BLUE}开始恢复过程...${NC}"
    echo ""
    
    restore_mysql
    restore_ai_data
    restore_configs
    
    echo ""
    echo -e "${BLUE}重启服务以应用恢复的数据...${NC}"
    read -p "是否要重启服务? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        # Determine which environment to restart
        if docker ps | grep -q nginx; then
            echo -e "${BLUE}重启生产环境...${NC}"
            "$PROJECT_ROOT/scripts/prod-down.sh" && "$PROJECT_ROOT/scripts/prod-up.sh"
        else
            echo -e "${BLUE}重启开发环境...${NC}"
            "$PROJECT_ROOT/scripts/dev-down.sh" && "$PROJECT_ROOT/scripts/dev-up.sh"
        fi
    fi
    
    verify_restore
    
    echo ""
    echo -e "${GREEN}🎉 恢复完成!${NC}"
    echo ""
    echo -e "${BLUE}恢复摘要:${NC}"
    echo "• 备份时间戳: $TIMESTAMP"
    echo "• 恢复时间: $(date)"
    echo "• 备份清单: $MANIFEST_FILE"
}

# Run main function
main "$@"