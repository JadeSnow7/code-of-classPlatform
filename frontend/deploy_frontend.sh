#!/usr/bin/env bash

set -euo pipefail

# 用法：
# ./deploy_frontend.sh
#
# 脚本行为：
# 1. 在本地构建 shared + frontend
# 2. 将 dist、nginx.conf、docker-compose.frontend.yml、.env.production 推送到阿里云
# 3. 在阿里云停止宿主机 nginx，释放 80 端口
# 4. 在远端显式删除旧容器，避免挂载漂移残留
# 5. 使用 docker compose 启动前端 Nginx 容器
# 6. 发布后立即执行挂载与路由验真

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${CODE_DIR}/frontend"
TMP_TARBALL="$(mktemp /tmp/frontend-deploy.XXXXXX.tgz)"

REMOTE_HOST="${REMOTE_HOST:-root@47.121.194.134}"
REMOTE_DIR="${REMOTE_DIR:-/opt/smart-teaching/frontend}"
REMOTE_SERVICE_NAME="${REMOTE_SERVICE_NAME:-frontend}"

cleanup() {
  rm -f "${TMP_TARBALL}"
}
trap cleanup EXIT

echo "[1/5] 本地构建 shared + frontend"
cd "${CODE_DIR}"
npm -w shared run build
npm -w frontend run build

echo "[2/5] 准备远端目录 ${REMOTE_DIR}"
ssh "${REMOTE_HOST}" "mkdir -p '${REMOTE_DIR}'"

echo "[3/7] 打包并覆盖同步前端构建产物与部署配置"
COPYFILE_DISABLE=1 tar \
  --exclude='._*' \
  -czf "${TMP_TARBALL}" \
  -C "${FRONTEND_DIR}" \
  dist nginx.conf docker-compose.frontend.yml .env.production
scp "${TMP_TARBALL}" "${REMOTE_HOST}:${REMOTE_DIR}/frontend-deploy.tar.gz"
ssh "${REMOTE_HOST}" "\
  rm -rf '${REMOTE_DIR}/dist' && \
  mkdir -p '${REMOTE_DIR}' && \
  tar -xzf '${REMOTE_DIR}/frontend-deploy.tar.gz' -C '${REMOTE_DIR}' && \
  find '${REMOTE_DIR}' -name '._*' -delete && \
  chmod -R a+rX '${REMOTE_DIR}/dist'"

echo "[4/7] 停止宿主机 nginx，释放 80 端口"
ssh "${REMOTE_HOST}" "systemctl stop nginx || true"

echo "[5/7] 删除旧前端容器，清理错误挂载残留"
ssh "${REMOTE_HOST}" "docker rm -f smart-teaching-frontend >/dev/null 2>&1 || true"

echo "[6/7] 启动 Docker 化前端服务"
ssh "${REMOTE_HOST}" "cd '${REMOTE_DIR}' && docker compose -f docker-compose.frontend.yml up -d"

echo "[7/7] 验证容器挂载与前端路由"
ssh "${REMOTE_HOST}" "docker inspect smart-teaching-frontend --format '{{json .Mounts}}'" | tee /tmp/smart_teaching_frontend_mounts.json >/dev/null

if ! grep -q '"/etc/nginx/conf.d/default.conf"' /tmp/smart_teaching_frontend_mounts.json; then
  echo "部署失败：前端容器未挂载到 /etc/nginx/conf.d/default.conf"
  exit 1
fi

ssh "${REMOTE_HOST}" "docker exec smart-teaching-frontend sh -c 'grep -q \"location /api/v1/\" /etc/nginx/conf.d/default.conf && grep -q \"try_files \\\$uri \\\$uri/ /index.html;\" /etc/nginx/conf.d/default.conf'"
curl -sf http://47.121.194.134/ >/dev/null
curl -sf http://47.121.194.134/learning >/dev/null
if curl -s http://47.121.194.134/api/v1/auth/me | grep -q '502 Bad Gateway'; then
  echo "部署失败：/api/v1/auth/me 仍返回 502"
  exit 1
fi

echo
echo "部署完成。请访问: http://47.121.194.134"
