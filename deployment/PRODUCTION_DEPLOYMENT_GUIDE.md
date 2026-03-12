# 生产环境部署操作指南

## 1. 启动前检查

在服务器上进入项目目录：

```bash
cd /path/to/graduationDesign/code
```

检查并修改以下生产变量后再启动：

- `BACKEND_CORS_ORIGINS`：替换为真实公网域名，例如 `http://www.assistplatform.xyz`
- `PUBLIC_WEB_BASE_URL`：替换为同一个真实公网域名
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`：替换为实际推理服务配置
- 企业微信配置如不用可留空

当前生产持久化目录为：

- `code/deployment/docker/data/mysql`
- `code/deployment/docker/data/minio`
- `code/deployment/docker/data/ai-service`

当前临时生产部署只开放 Nginx：

- `80/tcp`：统一 Web/API 入口

以下内部端口不再对宿主机或公网开放：

- `8080`
- `8001`
- `8002`
- `8003`
- `9000`
- `9001`

说明：

- 当前是无证书 HTTP-only 临时部署
- 正式上线前建议补齐 TLS 证书并恢复 `443`

## 2. 启动全栈服务

推荐先使用项目脚本，它会阻止占位域名、`ALLOW_DEMO_SEED=true` 和缺失密钥的误启动：

```bash
cd /path/to/graduationDesign/code
./scripts/prod-up.sh
```

如果你要直接用 Compose，命令如下：

```bash
cd /path/to/graduationDesign/code
docker-compose -f deployment/docker/docker-compose.prod.yml up -d --build
```

若服务器是 Compose v2，也可以使用：

```bash
cd /path/to/graduationDesign/code
docker compose -f deployment/docker/docker-compose.prod.yml up -d --build
```

查看状态与日志：

```bash
docker-compose -f deployment/docker/docker-compose.prod.yml ps
docker-compose -f deployment/docker/docker-compose.prod.yml logs -f nginx
docker-compose -f deployment/docker/docker-compose.prod.yml logs -f backend
docker-compose -f deployment/docker/docker-compose.prod.yml logs -f ai
```

## 3. 第一次管理员登录

生产配置已关闭 demo seed，`admin/admin123` 不会再自动创建。首次管理员建议使用一次性 CSV 导入：

1. 在服务器上创建导入文件：

```bash
cat > /tmp/bootstrap_admin.csv <<'EOF'
admin,admin,ReplaceWithAStrongAdminPassword
EOF
```

2. 执行一次性导入：

```bash
docker run --rm \
  --network emfield-network \
  -v /path/to/graduationDesign/code/backend:/src \
  -v /tmp:/tmp \
  -w /src \
  golang:1.24-alpine \
  sh -lc "apk add --no-cache git >/dev/null && DB_DSN='emfield:你的MYSQL密码@tcp(mysql:3306)/emfield?charset=utf8mb4&parseTime=True&loc=Local' go run ./cmd/seed /tmp/bootstrap_admin.csv"
```

3. 然后访问生产站点登录：

```text
http://你的生产域名/login
```

首次登录后立即：

- 修改管理员密码
- 通过后台再创建正式管理员/教师账号
- 删除或归档一次性导入文件 `/tmp/bootstrap_admin.csv`

## 4. GraphRAG 语料冷启动

如果只需要先启用本地知识库，先确认 `.env` 中：

```env
GRAPH_RAG_ENABLED=true
```

然后重建并启动 AI 服务后，通过容器内调用示例导入：

```bash
docker compose -f /path/to/graduationDesign/code/deployment/docker/docker-compose.prod.yml exec -T ai \
  python -c "import json, urllib.request; req = urllib.request.Request(
    'http://127.0.0.1:8001/v1/graphrag/index',
    data=json.dumps({
      'doc_id': 'course-001:syllabus',
      'content': '这里放课程讲义、FAQ 或教学规范全文。',
      'source': 'cold-start:course-001:syllabus',
      'course_id': 'course-001',
      'doc_type': 'markdown'
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
  ); print(urllib.request.urlopen(req).read().decode())"
```

批量冷启动建议把每份课程资料拆成多次 `POST /v1/graphrag/index` 调用，分别写入：

- 课程大纲
- FAQ
- 作业规范
- 评分 rubric
- 参考资料摘要

数据会落到持久化目录：

```text
code/deployment/docker/data/ai-service
```

## 5. 前端构建

Web 端构建：

```bash
cd /path/to/graduationDesign/code
npm -w shared run build
npm -w frontend run build
```

或直接：

```bash
cd /path/to/graduationDesign/code/frontend
npm run build
```

`vite.config.ts` 已支持：

- Web 构建时 `base=/`
- Tauri/桌面构建时 `base=./`
- 本地 Web 调试时代理 `/api/v1 -> http://localhost:8080`

## 6. Tauri 构建

当前仓库里的 Tauri 壳在 `code/desktop-tauri/src-tauri`。构建前先生成前端产物：

```bash
cd /path/to/graduationDesign/code
npm -w shared run build
VITE_DESKTOP_BUILD=true npm -w frontend run build
```

然后进入 Tauri Rust 工程目录执行：

```bash
cd /path/to/graduationDesign/code/desktop-tauri/src-tauri
cargo build --release --features tauri-command
```

如果服务器或构建机已经安装了 Tauri CLI，也可以用：

```bash
cd /path/to/graduationDesign/code/desktop-tauri/src-tauri
cargo tauri build
```

## 7. 常用运维命令

查看实时日志：

```bash
docker-compose -f /path/to/graduationDesign/code/deployment/docker/docker-compose.prod.yml logs -f
```

容器内排障：

```bash
docker-compose -f /path/to/graduationDesign/code/deployment/docker/docker-compose.prod.yml exec -T backend sh
docker-compose -f /path/to/graduationDesign/code/deployment/docker/docker-compose.prod.yml exec -T ai sh
docker-compose -f /path/to/graduationDesign/code/deployment/docker/docker-compose.prod.yml exec -T minio sh
```

当前公网入口健康检查：

```bash
curl -I http://你的生产域名/healthz
```

停止服务：

```bash
cd /path/to/graduationDesign/code
./scripts/prod-down.sh
```

备份：

```bash
cd /path/to/graduationDesign/code
./scripts/backup.sh
```
