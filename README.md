# 代码库 (Code Base)

本目录包含项目的所有可执行代码，按功能模块组织。

## 目录结构

- **[frontend-react/](./frontend-react/)** - Web 前端 (React + Vite)
- **[backend/](./backend/)** - 后端代码 (Go)
- **[ai_service/](./ai_service/)** - AI服务代码 (Python)
- **[simulation/](./simulation/)** - 仿真服务代码 (Python)
- **[shared/](./shared/)** - 共享资源和配置
- **[deployment/](./deployment/)** - 部署配置文件
- **[scripts/](./scripts/)** - 构建和部署脚本
- **[docker-compose.yml](./docker-compose.yml)** - 本地一键启动依赖服务（MySQL/MinIO + 后端/AI/仿真）

## 快速开始

1. 查看各模块的 README.md 了解具体使用方法
2. 在 `code/` 下使用 `docker-compose.yml` 启动后端依赖服务（推荐先配置 `code/.env`）
3. Web 前端在 `code/frontend-react/` 中单独启动（Vite dev server）

## 开发环境

- Web 前端: React + TypeScript + Vite (+ Tailwind CSS)
- 后端: Go + Gin + GORM
- AI服务: Python + FastAPI（OpenAI-compatible，支持可选 GraphRAG）
- 仿真服务: Python + FastAPI + NumPy/SciPy
- 数据库: MySQL
- 对象存储: MinIO（用于文件上传/资源存储，可选）

## 相关文档

- [架构文档](../docs/architecture/)
- [API文档](../docs/api/)
- [部署文档](../docs/deployment/)
