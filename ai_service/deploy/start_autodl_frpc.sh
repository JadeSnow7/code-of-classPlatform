#!/usr/bin/env bash
set -euo pipefail

FRP_VERSION="${FRP_VERSION:-0.61.1}"
FRP_DIR="${FRP_DIR:-/root/autodl-tmp/graduationDesign_runtime/frp}"
FRPC_CONFIG="${FRPC_CONFIG:-/root/graduationDesign/code/ai_service/deploy/autodl-frpc.toml}"
FRPC_LOG="${FRPC_LOG:-/root/graduationDesign/code/ai_service/frpc.log}"

mkdir -p "$FRP_DIR"

if [[ ! -x "$FRP_DIR/frpc" ]]; then
  cd /tmp
  rm -rf "/tmp/frp_${FRP_VERSION}_linux_amd64" /tmp/frp.tar.gz
  wget -O /tmp/frp.tar.gz "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz"
  tar -xzf /tmp/frp.tar.gz
  install -m 0755 "/tmp/frp_${FRP_VERSION}_linux_amd64/frpc" "$FRP_DIR/frpc"
fi

nohup "$FRP_DIR/frpc" -c "$FRPC_CONFIG" > "$FRPC_LOG" 2>&1 &
echo "frpc started in background. log=$FRPC_LOG"
