# 后端服务 (Backend)

基于 Go 的后端服务，提供 RESTful API、认证鉴权与核心教学业务能力，并聚合 AI/仿真等外部服务。

## 技术栈

- Go 1.24+
- Gin (Web框架)
- GORM (ORM)
- MySQL (数据库)
- JWT (身份认证)
- RBAC (权限控制)
- MinIO (对象存储，可选：用于作业/资源上传)

## 开发环境

```bash
# 安装依赖
go mod download

# 运行开发服务器
go run cmd/server/main.go

# 构建可执行文件
go build -o bin/server cmd/server/main.go
```

## 项目结构

```
internal/
├── auth/          # 身份认证/密码哈希
├── authz/         # 权限控制
├── clients/       # 外部服务客户端
├── config/        # 配置管理
├── db/           # 数据库连接
├── http/         # HTTP处理器
├── middleware/   # 中间件
├── models/       # 数据模型
├── repo/         # 数据访问层
└── service/      # 业务逻辑层
```

## 主要功能

- 用户认证和授权
- 课程管理API
- 企业微信集成
- AI服务代理
- 仿真服务代理
- 文件上传与资源管理（可选：MinIO）

## 数据库与种子数据

服务启动时会自动执行 GORM `AutoMigrate`；首次启动会创建演示账号：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 教师 | teacher | teacher123 |
| 学生 | student | student123 |

## 相关文档

- [API 文档](../../docs/api/)
- [系统架构总览](../../docs/architecture/system-overview.md)
