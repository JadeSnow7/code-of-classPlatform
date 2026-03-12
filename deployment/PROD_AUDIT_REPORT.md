# 生产环境全量审查体检报告

本报告基于仓库内当前可见的生产相关配置文件进行只读审查，结论反映的是“代码库声明的配置状态”，不等同于服务器运行时环境变量的最终值。

## 维度 1：Nginx 与网络路由审查

### 已满足
- `code/frontend/nginx.conf` 已配置 `try_files $uri $uri/ /index.html;`，可支撑 React Router 的 SPA 刷新回落。
- `/api/v1/` 已反向代理到 `http://127.0.0.1:8080`，并显式透传了 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto`。
- `/api/v1/` 已配置 `proxy_buffering off;`，能降低 SSE 被代理缓存截断的风险。

### 存在风险
- `proxy_send_timeout 120s;` 与 `proxy_read_timeout 120s;` 仅能覆盖较短对话。对于大模型长时流式输出，未达到建议的 `300s` 级别，存在长回答过程中被 Nginx 提前断流的风险。
- 当前 Nginx 配置将所有 `/api/v1/` 共用一组超时与 buffering 策略，尚未对 AI SSE 路径做更细粒度的长连接优化。

### 审查结论
- 网络基础路由正确，可用性基础达标。
- SSE 代理可工作，但长连接容忍度不足，应视为上线前的高风险项。
- Go 网关健康检查真实路径是 `/health`，不是 `/api/v1/health`；后续巡检与验收应按真实路由执行。

## 维度 2：生产环境安全与配置审查

### 阻断项
- `code/docker-compose.yml` 中 `backend.environment.ALLOW_DEMO_SEED` 被硬编码为 `"true"`。这会允许生产环境自动注入弱口令演示账号，属于明确的生产阻断项。

### 高风险项
- `code/.env` 中存在硬编码的 MySQL 口令、JWT Secret 和 MinIO 凭证：
  - `MYSQL_ROOT_PASSWORD=EmField2024Root!`
  - `MYSQL_PASSWORD=EmField2024Pass!`
  - `BACKEND_JWT_SECRET=emfield-jwt-secret-key-2024-graduation-design`
  - `MINIO_ACCESS_KEY=minioadmin`
  - `MINIO_SECRET_KEY=minioadmin123`
- `code/.env.example` 中仍保留明显弱口令或示例密钥：
  - `BACKEND_JWT_SECRET=change_me_in_prod`
  - `AI_GATEWAY_SHARED_TOKEN=super_secret_internal_token_123`
  - `MYSQL_ROOT_PASSWORD=teaching_platform_root`
  - `MYSQL_PASSWORD=teaching_platform_pass`
  - `MINIO_SECRET_KEY` 默认值落到 `minioadmin123`
- `code/docker-compose.yml` 明确依赖 `AI_GATEWAY_SHARED_TOKEN` 给 `backend` 与 `ai` 两个服务，但当前 `code/.env` 中未见实际赋值。就仓库状态而言，这属于“内部通信鉴权值缺失或待运行时注入确认”。
- `code/.env` 中 `BACKEND_CORS_ORIGINS=*`。虽然本次前端生产部署走同源 `/api` 已弱化浏览器跨域问题，但通配符 CORS 仍扩大了暴露面，不应视为生产最小权限配置。

### 审查结论
- 当前仓库中的安全配置不满足严格生产标准。
- 至少需要关闭 demo seed、移除硬编码密钥、补齐并核对 `AI_GATEWAY_SHARED_TOKEN` 后，才能认为配置闭环。

## 维度 3：数据持久化与高可用审查

### 已满足
- `code/docker-compose.yml` 已为 MySQL 和 MinIO 配置 named volume：
  - `mysql_data`
  - `minio_data`

### 缺失 / 未部署
- 当前 compose 未见任何服务配置 `restart: always` 或 `restart: unless-stopped`，核心服务重启自愈能力缺失。
- 当前 compose 使用的是 Docker named volume，而不是明确的宿主机物理目录 bind mount。对于生产运维审计、迁移和备份，这种声明不够透明。
- 仓库代码中已存在 FAISS 与 Neo4j 相关实现：
  - AI 侧有 `faiss` 向量存储代码
  - AI 侧有 `graphrag_neo4j` 模块
  但当前生产 compose 未见对应服务或宿主机持久化挂载声明。
- 当前 compose 未见 Qdrant、Milvus、Neo4j 的生产服务定义，因此无法证明这些数据面已被正式纳入生产持久化策略。
- SQLite 在仓库中用于测试与审计，但当前生产 compose 未明确声明 SQLite 数据文件目录的宿主机挂载方案。

### 审查结论
- MySQL 与 MinIO 基础持久化“有声明”，但离生产级别的可运维、可迁移、可审计仍有差距。
- 图谱/向量/SQLite 数据面的生产持久化策略目前不完整，应视为高风险缺口。

## 结论

### 阻断项
- `ALLOW_DEMO_SEED=true`

### 高风险项
- `code/.env` 中存在硬编码生产凭证与可识别口令
- `AI_GATEWAY_SHARED_TOKEN` 在 compose 中被依赖，但仓库内 `.env` 未见实际值
- Nginx 对 SSE 的 `proxy_read_timeout` / `proxy_send_timeout` 仅为 `120s`
- 核心服务缺少 `restart` 策略
- 向量库 / 图数据库 / SQLite 的生产持久化方案未在 compose 中完整落地

### 建议项
- 将 AI SSE 路由单独配置到 `300s` 级超时
- 将 CORS 从 `*` 收紧为实际生产域名
- 将 named volume 收敛为明确宿主机路径，便于备份与迁移
- 把 `.env.example` 中示例弱口令统一替换为占位符，而不是“看起来像可用密码”的值
