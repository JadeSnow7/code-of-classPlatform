#!/bin/bash

# 数据备份脚本
# Data backup script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backup"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
COMPOSE_FILE="$PROJECT_ROOT/deployment/docker/docker-compose.prod.yml"

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    COMPOSE_CMD=(docker compose)
fi

compose_service_running() {
    [ -n "$("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps -q "$1" 2>/dev/null)" ]
}

run_compose_exec() {
    local service="$1"
    shift
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$service" "$@"
}

echo -e "${BLUE}💾 开始数据备份...${NC}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
else
    echo -e "${RED}✗ 未找到 .env 文件${NC}"
    exit 1
fi

# Function to backup MySQL database
backup_mysql() {
    echo -e "${BLUE}备份 MySQL 数据库...${NC}"
    
    local backup_file="$BACKUP_DIR/mysql_backup_$TIMESTAMP.sql"
    
    # Check if MySQL container is running
    if ! compose_service_running mysql; then
        echo -e "${YELLOW}⚠ MySQL 容器未运行，跳过数据库备份${NC}"
        return
    fi
    
    # Create database backup
    run_compose_exec mysql mysqldump \
        -u"$MYSQL_USER" \
        -p"$MYSQL_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        "$MYSQL_DATABASE" > "$backup_file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ MySQL 备份完成: $backup_file${NC}"
        
        # Compress backup
        gzip "$backup_file"
        echo -e "${GREEN}✓ 备份文件已压缩: ${backup_file}.gz${NC}"
    else
        echo -e "${RED}✗ MySQL 备份失败${NC}"
        rm -f "$backup_file"
    fi
}

# Function to backup AI service data
backup_ai_data() {
    echo -e "${BLUE}备份 AI 服务数据...${NC}"
    
    local backup_file="$BACKUP_DIR/ai_data_backup_$TIMESTAMP.tar.gz"
    
    # Check if AI container is running
    if ! compose_service_running ai; then
        echo -e "${YELLOW}⚠ AI 服务容器未运行，跳过 AI 数据备份${NC}"
        return
    fi
    
    # Create AI data backup
    run_compose_exec ai tar -czf - /app/app/data 2>/dev/null > "$backup_file"
    
    if [ $? -eq 0 ] && [ -s "$backup_file" ]; then
        echo -e "${GREEN}✓ AI 数据备份完成: $backup_file${NC}"
    else
        echo -e "${YELLOW}⚠ AI 数据备份为空或失败${NC}"
        rm -f "$backup_file"
    fi
}

# Function to backup configuration files
backup_configs() {
    echo -e "${BLUE}备份配置文件...${NC}"
    
    local backup_file="$BACKUP_DIR/configs_backup_$TIMESTAMP.tar.gz"
    
    # Create configuration backup
    tar -czf "$backup_file" \
        -C "$PROJECT_ROOT" \
        .env \
        deployment/ \
        scripts/ \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 配置文件备份完成: $backup_file${NC}"
    else
        echo -e "${RED}✗ 配置文件备份失败${NC}"
        rm -f "$backup_file"
    fi
}

# Function to create backup manifest
create_manifest() {
    echo -e "${BLUE}创建备份清单...${NC}"
    
    local manifest_file="$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
    
    cat > "$manifest_file" << EOF
备份时间: $(date)
备份版本: $TIMESTAMP
项目路径: $PROJECT_ROOT

备份文件:
EOF
    
    # List backup files
    find "$BACKUP_DIR" -name "*_$TIMESTAMP.*" -type f | while read file; do
        echo "- $(basename "$file") ($(du -h "$file" | cut -f1))" >> "$manifest_file"
    done
    
    echo -e "${GREEN}✓ 备份清单创建完成: $manifest_file${NC}"
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo -e "${BLUE}清理旧备份文件...${NC}"
    
    # Keep only last 7 days of backups
    find "$BACKUP_DIR" -name "*.gz" -type f -mtime +7 -delete
    find "$BACKUP_DIR" -name "*.txt" -type f -mtime +7 -delete
    
    echo -e "${GREEN}✓ 旧备份文件清理完成${NC}"
}

# Main backup function
main() {
    echo -e "${BLUE}开始备份过程...${NC}"
    echo "备份时间戳: $TIMESTAMP"
    echo "备份目录: $BACKUP_DIR"
    echo ""
    
    backup_mysql
    backup_ai_data
    backup_configs
    create_manifest
    cleanup_old_backups
    
    echo ""
    echo -e "${GREEN}🎉 备份完成!${NC}"
    echo ""
    echo -e "${BLUE}备份文件位置:${NC}"
    find "$BACKUP_DIR" -name "*_$TIMESTAMP.*" -type f | while read file; do
        echo "• $(basename "$file") ($(du -h "$file" | cut -f1))"
    done
    echo ""
    echo -e "${BLUE}恢复命令:${NC}"
    echo "./scripts/restore.sh $TIMESTAMP"
}

# Run main function
main "$@"
