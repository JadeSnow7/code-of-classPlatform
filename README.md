# LLM Teaching Platform - Code Base

本目录包含通用大模型大学教学平台的所有可执行代码，按功能模块组织。

## 目录结构

- **[frontend-react/](./frontend-react/)** - Web 前端 (React + Vite)
- **[backend/](./backend/)** - 后端代码 (Go)
- **[ai_service/](./ai_service/)** - AI服务代码 (Python)
- **[simulation/](./simulation/)** - 仿真服务代码 (Python) - 可选扩展模块
- **[shared/](./shared/)** - 共享资源和配置
- **[deployment/](./deployment/)** - 部署配置文件
- **[scripts/](./scripts/)** - 构建和部署脚本
- **[docker-compose.yml](./docker-compose.yml)** - 本地一键启动依赖服务（MySQL/MinIO + 后端/AI）

## 快速开始

1. 首次在 `code/` 根目录安装依赖（workspace）：`npm install --workspaces`
2. 在 `code/` 下使用 `docker-compose.yml` 启动后端依赖服务（推荐先配置 `code/.env`）
3. Web 前端：`npm -w frontend-react run dev`（Vite dev server）
4. Mobile：`npm -w mobile run start`（Expo）
5. 共享包：`@classplatform/shared` 会在安装时自动构建，如需手动更新运行 `npm -w shared run build`

## 开发环境

- Web 前端: React + TypeScript + Vite (+ Tailwind CSS)
- 后端: Go + Gin + GORM
- AI服务: Python + FastAPI（OpenAI-compatible，支持可选 GraphRAG）
- 数据库: MySQL
- 对象存储: MinIO（用于文件上传/资源存储，可选）

## 核心特性

- **通用化设计**: 支持任意学科的教学场景
- **模块化架构**: 可插拔的扩展模块系统
- **AI 智能**: 端侧 AI + 云端 AI 协同，支持多模态和 GraphRAG
- **跨端支持**: Web + iOS + Android + Desktop
- **安全可靠**: JWT + RBAC 权限系统，完善的数据隔离

## 相关文档

- [架构文档](../docs/architecture/)
- [API文档](../docs/api/)
- [部署文档](../docs/deployment/)
