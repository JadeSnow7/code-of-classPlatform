# 部署配置

本目录包含项目的部署配置文件。

## 目录结构

```
deployment/
└── docker/
    ├── docker-compose.dev.yml      # 开发环境配置
    ├── docker-compose.prod.yml     # 生产环境配置
    └── monitoring/
        └── docker-compose.monitoring.yml  # 监控服务配置
```

## 使用方式

### 开发环境

```bash
cd code/deployment/docker
docker-compose -f docker-compose.dev.yml up -d
```

### 生产环境

```bash
cd code/deployment/docker
docker-compose -f docker-compose.prod.yml up -d
```

### 监控服务

```bash
cd code/deployment/docker/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

## 环境变量

请参考 `code/.env.example` 配置所需的环境变量。
