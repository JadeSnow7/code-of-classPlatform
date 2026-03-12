FROM node:20-alpine AS builder

WORKDIR /workspace

# 说明：
# 1. 该 Dockerfile 位于 code/frontend 下；
# 2. 构建时请把上下文设为 code 目录，而不是 frontend 目录；
# 3. 这是因为 frontend 依赖同一 workspace 下的 shared 包。
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci --workspaces

COPY shared shared
COPY frontend frontend

# 先构建共享包，再构建前端生产产物。
RUN npm -w shared run build && npm -w frontend run build

FROM nginx:1.27-alpine AS runner

# 使用自定义站点配置，提供 SPA 路由、缓存和 /api/v1 反向代理。
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 将前端打包结果复制到 Nginx 静态目录。
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
