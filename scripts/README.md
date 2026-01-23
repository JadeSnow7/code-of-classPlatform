# 脚本目录

本目录包含项目的环境配置、构建、部署、备份和监控脚本。

## 文件说明

### 环境管理
- `setup-env.sh` - 一键式环境配置脚本
- `dev-up.sh` - 启动开发环境
- `dev-down.sh` - 停止开发环境
- `prod-up.sh` - 启动生产环境
- `prod-down.sh` - 停止生产环境

### 监控服务
- `monitoring-up.sh` - 启动监控服务 (Prometheus, Grafana)
- `monitoring-down.sh` - 停止监控服务

### 数据管理
- `backup.sh` - 数据备份脚本
- `restore.sh` - 数据恢复脚本

### 传统脚本 (兼容性)
- `compose-up.sh` - 启动 Docker Compose 服务
- `compose-down.sh` - 停止 Docker Compose 服务

## 使用方法

### 首次环境配置
```bash
# 一键配置开发环境
./scripts/setup-env.sh

# 启动开发环境
./scripts/dev-up.sh
```

### 开发环境
```bash
# 启动开发环境
./scripts/dev-up.sh

# 停止开发环境
./scripts/dev-down.sh
```

### 生产环境
```bash
# 启动生产环境 (需要先配置 .env)
./scripts/prod-up.sh

# 停止生产环境
./scripts/prod-down.sh
```

### 监控服务
```bash
# 启动监控服务
./scripts/monitoring-up.sh

# 访问 Grafana: http://localhost:3001
# 访问 Prometheus: http://localhost:9090

# 停止监控服务
./scripts/monitoring-down.sh
```

### 数据备份与恢复
```bash
# 创建备份
./scripts/backup.sh

# 恢复数据 (需要备份时间戳)
./scripts/restore.sh 20241223_143000
```

## 环境要求

- Docker 和 Docker Compose
- Bash shell
- curl (用于健康检查)
- Git

## 注意事项

1. 首次使用请运行 `setup-env.sh` 进行环境配置
2. 生产环境启动前请确保配置了所有必要的环境变量
3. 定期运行备份脚本以保护数据
4. 监控服务默认用户名/密码为 admin/admin，请及时修改

## 相关文档

- [部署指南](../../docs/deployment/)
- [开发文档](../../docs/development/README.md)
