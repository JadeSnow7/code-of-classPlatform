#!/usr/bin/env python3
"""
生产环境一键巡检脚本。

用途：
1. 检查 Nginx 首页是否正常返回 React 挂载点；
2. 检查 Go 网关健康检查接口；
3. 使用测试账号登录，验证认证链路；
4. 发起一次 AI SSE 对话，确认网关与 AI 容器都处于可服务状态。

运行示例：
BASE_URL=http://47.121.194.134 \
TEST_USERNAME=student01 \
TEST_PASSWORD='***' \
python3 prod_health_check.py
"""

from __future__ import annotations

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1").rstrip("/")
LOGIN_PATH = os.getenv("LOGIN_PATH", "/api/v1/auth/login")
CHAT_PATH = os.getenv("CHAT_PATH", "/api/v1/ai/chat")
GATEWAY_HEALTH_PATH = os.getenv("GATEWAY_HEALTH_PATH", "/health")

TEST_USERNAME = os.getenv("TEST_USERNAME", "").strip()
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "").strip()

NORMAL_TIMEOUT_SEC = 15
SSE_FIRST_EVENT_TIMEOUT_SEC = 30
MAX_SSE_LINES = 200


@dataclass
class CheckResult:
    status: str
    title: str
    detail: str


def build_url(path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    normalized = path if path.startswith("/") else f"/{path}"
    return f"{BASE_URL}{normalized}"


def print_result(result: CheckResult) -> None:
    print(f"[{result.status}] {result.title}: {result.detail}")


def fail(title: str, detail: str) -> None:
    raise RuntimeError(f"{title}: {detail}")


def decode_body(raw: bytes) -> str:
    return raw.decode("utf-8", errors="replace")


def request_json(
    method: str,
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = NORMAL_TIMEOUT_SEC,
) -> tuple[int, dict[str, str], Any]:
    body = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            text = decode_body(raw)
            data = json.loads(text)
            return resp.status, dict(resp.headers.items()), data
    except urllib.error.HTTPError as exc:
        text = decode_body(exc.read())
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = {"raw_body": text}
        return exc.code, dict(exc.headers.items()), data


def request_text(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = NORMAL_TIMEOUT_SEC,
) -> tuple[int, dict[str, str], str]:
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers.items()), decode_body(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), decode_body(exc.read())


def extract_health_status(payload: Any) -> str | None:
    if isinstance(payload, dict):
        if payload.get("status") == "ok":
            return "ok"
        data = payload.get("data")
        if isinstance(data, dict) and data.get("status") == "ok":
            return "ok"
    return None


def extract_access_token(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data")
    if isinstance(data, dict):
        token = str(data.get("access_token", "")).strip()
        if token:
            return token
    token = str(payload.get("access_token", "")).strip()
    return token


def check_frontend_root() -> CheckResult:
    url = build_url("/")
    status, _, body = request_text("GET", url)
    if status != 200:
        fail("首页巡检失败", f"HTTP {status}，URL={url}")
    if '<div id="root"></div>' not in body and '<div id="root">' not in body:
        fail("首页巡检失败", "响应体中未发现 React 挂载点 <div id=\"root\">")
    return CheckResult("PASS", "Nginx 首页", f"HTTP 200，且检测到 React 挂载点，URL={url}")


def check_gateway_health() -> CheckResult:
    url = build_url(GATEWAY_HEALTH_PATH)
    status, _, payload = request_json("GET", url)
    if status != 200:
        fail("网关健康检查失败", f"HTTP {status}，URL={url}，响应={payload}")
    if extract_health_status(payload) != "ok":
        fail("网关健康检查失败", f"返回体未包含 status=ok，响应={payload}")
    return CheckResult("PASS", "Go 网关健康检查", f"HTTP 200，status=ok，URL={url}")


def login_and_get_token() -> tuple[str, CheckResult]:
    if not TEST_USERNAME or not TEST_PASSWORD:
        fail(
            "登录巡检失败",
            "缺少 TEST_USERNAME 或 TEST_PASSWORD 环境变量，生产巡检不允许跳过登录链路",
        )

    url = build_url(LOGIN_PATH)
    status, _, payload = request_json(
        "POST",
        url,
        payload={"username": TEST_USERNAME, "password": TEST_PASSWORD},
        headers={"X-Client-Type": "prod-health-check"},
    )
    if status != 200:
        fail("登录巡检失败", f"HTTP {status}，URL={url}，响应={payload}")

    token = extract_access_token(payload)
    if not token:
        fail("登录巡检失败", f"响应中未提取到 access_token，响应={payload}")

    return token, CheckResult("PASS", "测试账号登录", f"HTTP 200，已获取 JWT，账号={TEST_USERNAME}")


def normalize_sse_event(payload: dict[str, Any]) -> tuple[str, str]:
    event_type = str(payload.get("type", "")).strip().lower()

    if "error" in payload and payload.get("error"):
        return "error", str(payload.get("error", "")).strip()

    if event_type == "error":
        return "error", str(payload.get("error", "")).strip()

    if event_type == "done":
        return "done", str(payload.get("model", "")).strip()

    if event_type == "message":
        return "message", str(payload.get("content", "")).strip()

    content = str(payload.get("content", "")).strip()
    if content:
        return "message", content

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            delta = first.get("delta")
            if isinstance(delta, dict):
                delta_content = str(delta.get("content", "")).strip()
                if delta_content:
                    return "message", delta_content

    return "unknown", ""


def check_ai_sse(token: str) -> CheckResult:
    url = build_url(CHAT_PATH)
    req_body = {
        "messages": [
            {"role": "user", "content": "请回复：系统巡检成功。"}
        ],
        "stream": True,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(req_body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {token}",
            "X-Client-Type": "prod-health-check",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=SSE_FIRST_EVENT_TIMEOUT_SEC) as resp:
            if resp.status != 200:
                fail("AI SSE 巡检失败", f"HTTP {resp.status}，URL={url}")

            content_type = resp.headers.get("Content-Type", "")
            if "text/event-stream" not in content_type.lower():
                fail("AI SSE 巡检失败", f"返回 Content-Type 非 text/event-stream，实际为 {content_type}")

            for _ in range(MAX_SSE_LINES):
                raw_line = resp.readline()
                if not raw_line:
                    break

                line = decode_body(raw_line).strip()
                if not line or not line.startswith("data:"):
                    continue

                payload_text = line[5:].strip()
                if not payload_text:
                    continue
                if payload_text == "[DONE]":
                    fail("AI SSE 巡检失败", "过早收到 [DONE]，但未读到任何有效消息事件")

                try:
                    payload = json.loads(payload_text)
                except json.JSONDecodeError:
                    return CheckResult("PASS", "AI SSE 对话链路", f"已收到非空 data 事件，URL={url}")

                event_type, content = normalize_sse_event(payload)
                if event_type == "error":
                    fail("AI SSE 巡检失败", f"收到 error event：{content or payload}")
                if event_type == "message" and content:
                    preview = content[:80]
                    return CheckResult("PASS", "AI SSE 对话链路", f"已收到有效消息事件，内容预览：{preview}")
                if event_type == "done":
                    fail("AI SSE 巡检失败", f"仅收到 done 事件，未读到有效消息内容，payload={payload}")

            fail("AI SSE 巡检失败", "在超时或最大读取窗口内未收到有效 data 事件")

    except urllib.error.HTTPError as exc:
        body = decode_body(exc.read())
        fail("AI SSE 巡检失败", f"HTTP {exc.code}，URL={url}，响应={body}")
    except socket.timeout:
        fail("AI SSE 巡检失败", f"等待首个 SSE 事件超时（{SSE_FIRST_EVENT_TIMEOUT_SEC}s）")
    except urllib.error.URLError as exc:
        fail("AI SSE 巡检失败", f"请求异常：{exc}")


def main() -> int:
    results: list[CheckResult] = []
    try:
        results.append(check_frontend_root())
        results.append(check_gateway_health())
        token, login_result = login_and_get_token()
        results.append(login_result)
        results.append(check_ai_sse(token))
    except Exception as exc:  # noqa: BLE001 - 巡检脚本需要统一兜底并返回非零
        for item in results:
            print_result(item)
        print_result(CheckResult("FAIL", "生产巡检", str(exc)))
        return 1

    for item in results:
        print_result(item)
    print_result(CheckResult("PASS", "生产巡检", "全部关键检查通过"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
