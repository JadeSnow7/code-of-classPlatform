from __future__ import annotations

import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest


DEFAULT_GATEWAY_BASE_URL = "http://localhost:8080"
DEFAULT_AI_BASE_URL = "http://localhost:8001"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "tester_data.db"
DEFAULT_STUDENT_USERNAME = "student"
DEFAULT_STUDENT_PASSWORD = "student123"
DEFAULT_TIMEOUT_SEC = 60.0
AUDIT_TABLE_NAME = "chat_logs"


@dataclass(frozen=True)
class E2EConfig:
    gateway_base_url: str
    ai_base_url: str
    audit_db_path: Path
    student_username: str
    student_password: str
    shared_token: str
    timeout_sec: float
    use_stream_chat: bool


@dataclass(frozen=True)
class AuditRecord:
    timestamp: str
    user_id: str
    user_query: str
    ai_response: str
    latency_ms: int
    token_count: int


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    value = _env(name).lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if not raw:
        return default
    try:
        parsed = float(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_config() -> E2EConfig:
    return E2EConfig(
        gateway_base_url=_env("E2E_GATEWAY_BASE_URL", DEFAULT_GATEWAY_BASE_URL).rstrip("/"),
        ai_base_url=_env("E2E_AI_BASE_URL", DEFAULT_AI_BASE_URL).rstrip("/"),
        audit_db_path=Path(_env("E2E_AUDIT_DB_PATH", str(DEFAULT_DB_PATH))).expanduser(),
        student_username=_env("E2E_STUDENT_USERNAME", DEFAULT_STUDENT_USERNAME),
        student_password=_env("E2E_STUDENT_PASSWORD", DEFAULT_STUDENT_PASSWORD),
        shared_token=_env("AI_GATEWAY_SHARED_TOKEN"),
        timeout_sec=_env_float("E2E_TIMEOUT_SEC", DEFAULT_TIMEOUT_SEC),
        use_stream_chat=_env_bool("E2E_USE_STREAM_CHAT", default=False),
    )


def _build_timeout(timeout_sec: float) -> httpx.Timeout:
    return httpx.Timeout(timeout=timeout_sec, connect=min(timeout_sec, 10.0))


def _extract_json(response: httpx.Response, context: str) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        pytest.fail(f"{context} 返回的不是合法 JSON: {exc}; body={response.text[:500]}")
    if not isinstance(payload, dict):
        pytest.fail(f"{context} 返回 JSON 结构异常，期望 object，实际为 {type(payload).__name__}")
    return payload


def _extract_enveloped_data(payload: dict[str, Any], context: str) -> dict[str, Any]:
    if "data" not in payload:
        pytest.fail(f"{context} 缺少 data 字段: {payload}")
    data = payload["data"]
    if not isinstance(data, dict):
        pytest.fail(f"{context} 的 data 字段结构异常，期望 object，实际为 {type(data).__name__}")
    return data


def _extract_reply_text(payload: dict[str, Any], context: str) -> str:
    if "reply" in payload and isinstance(payload["reply"], str) and payload["reply"].strip():
        return payload["reply"].strip()

    data = payload.get("data")
    if isinstance(data, dict):
        reply = data.get("reply")
        if isinstance(reply, str) and reply.strip():
            return reply.strip()

    pytest.fail(f"{context} 缺少非空 reply 字段: {payload}")


def _extract_token_count(payload: dict[str, Any]) -> int:
    candidates = [payload]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.append(data)

    for container in candidates:
        usage = container.get("usage")
        if not isinstance(usage, dict):
            continue
        value = usage.get("total_tokens")
        try:
            if value is not None:
                return max(0, int(value))
        except (TypeError, ValueError):
            continue
    return 0


def _assert_response_completed_within_timeout(
    elapsed_sec: float,
    timeout_sec: float,
    context: str,
) -> int:
    latency_ms = int(elapsed_sec * 1000)
    assert elapsed_sec <= timeout_sec, f"{context} 超时: {elapsed_sec:.2f}s > {timeout_sec:.2f}s"
    return latency_ms


def _ensure_audit_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {AUDIT_TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_query TEXT NOT NULL,
                ai_response TEXT NOT NULL,
                latency_ms INTEGER NOT NULL,
                token_count INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE INDEX IF NOT EXISTS idx_{AUDIT_TABLE_NAME}_user_time
            ON {AUDIT_TABLE_NAME} (user_id, timestamp)
            """
        )
        conn.commit()


def _write_audit_record(db_path: Path, record: AuditRecord) -> None:
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                f"""
                INSERT INTO {AUDIT_TABLE_NAME} (
                    timestamp,
                    user_id,
                    user_query,
                    ai_response,
                    latency_ms,
                    token_count
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    record.timestamp,
                    record.user_id,
                    record.user_query,
                    record.ai_response,
                    record.latency_ms,
                    record.token_count,
                ),
            )
            conn.commit()
    except sqlite3.Error as exc:
        pytest.fail(f"写入 SQLite 审计库失败: {exc}")


def _fetch_latest_audit_record(db_path: Path, user_id: str, user_query: str) -> AuditRecord:
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                f"""
                SELECT timestamp, user_id, user_query, ai_response, latency_ms, token_count
                FROM {AUDIT_TABLE_NAME}
                WHERE user_id = ? AND user_query = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (user_id, user_query),
            ).fetchone()
    except sqlite3.Error as exc:
        pytest.fail(f"查询 SQLite 审计库失败: {exc}")

    if row is None:
        pytest.fail(f"未在 SQLite 审计库中查到测试记录: user_id={user_id}, query={user_query}")

    return AuditRecord(
        timestamp=str(row["timestamp"]),
        user_id=str(row["user_id"]),
        user_query=str(row["user_query"]),
        ai_response=str(row["ai_response"]),
        latency_ms=int(row["latency_ms"]),
        token_count=int(row["token_count"]),
    )


def _delete_audit_records_for_run(db_path: Path, user_id_prefix: str) -> None:
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                f"DELETE FROM {AUDIT_TABLE_NAME} WHERE user_id LIKE ?",
                (f"{user_id_prefix}%",),
            )
            conn.commit()
    except sqlite3.Error:
        # 清理失败不影响主测试结果，避免 teardown 反向污染真实问题。
        return


def _health_check(client: httpx.Client, url: str, context: str) -> dict[str, Any]:
    try:
        response = client.get(url)
    except httpx.HTTPError as exc:
        pytest.fail(f"{context} 请求失败: {exc}")

    assert response.status_code == 200, f"{context} 期望 200，实际 {response.status_code}: {response.text[:500]}"
    return _extract_json(response, context)


def _login_and_get_jwt(client: httpx.Client, config: E2EConfig) -> str:
    payload = {
        "username": config.student_username,
        "password": config.student_password,
    }

    try:
        response = client.post(
            f"{config.gateway_base_url}/api/v1/auth/login",
            json=payload,
        )
    except httpx.HTTPError as exc:
        pytest.fail(f"学生登录请求失败: {exc}")

    assert response.status_code == 200, (
        "学生登录失败，请检查服务是否启动、demo 账号是否存在，"
        f"或通过环境变量覆盖账号密码。status={response.status_code}, body={response.text[:500]}"
    )
    payload_json = _extract_json(response, "学生登录")
    data = _extract_enveloped_data(payload_json, "学生登录")
    token = data.get("access_token")
    if not isinstance(token, str) or not token.strip():
        pytest.fail(f"登录成功但 access_token 缺失: {payload_json}")
    return token.strip()


def _post_gateway_chat(
    client: httpx.Client,
    config: E2EConfig,
    jwt_token: str,
    payload: dict[str, Any],
    *,
    stream: bool,
) -> tuple[httpx.Response, float]:
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json",
    }
    body = dict(payload)
    body["stream"] = stream
    started = time.perf_counter()
    try:
        response = client.post(
            f"{config.gateway_base_url}/api/v1/ai/chat",
            json=body,
            headers=headers,
        )
    except httpx.HTTPError as exc:
        pytest.fail(f"网关 AI 对话请求失败: {exc}")
    return response, time.perf_counter() - started


def _post_gateway_orchestrated(
    client: httpx.Client,
    config: E2EConfig,
    jwt_token: str,
    payload: dict[str, Any],
) -> tuple[httpx.Response, float]:
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json",
    }
    started = time.perf_counter()
    try:
        response = client.post(
            f"{config.gateway_base_url}/api/v1/ai/orchestrated",
            json=payload,
            headers=headers,
        )
    except httpx.HTTPError as exc:
        pytest.fail(f"网关多智能体请求失败: {exc}")
    return response, time.perf_counter() - started


def _post_ai_hybrid(
    client: httpx.Client,
    config: E2EConfig,
    payload: dict[str, Any],
    *,
    trusted: bool,
) -> tuple[httpx.Response, float]:
    headers = {"Content-Type": "application/json"}
    if trusted and config.shared_token:
        headers["X-AI-Gateway-Token"] = config.shared_token

    started = time.perf_counter()
    try:
        response = client.post(
            f"{config.ai_base_url}/v1/chat/hybrid",
            json=payload,
            headers=headers,
        )
    except httpx.HTTPError as exc:
        pytest.fail(f"AI Hybrid 请求失败: {exc}")
    return response, time.perf_counter() - started


def _read_sse_text(response: httpx.Response) -> str:
    chunks: list[str] = []
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        chunk = line.removeprefix("data:").strip()
        if not chunk:
            continue
        chunks.append(chunk)
    return "\n".join(chunks)


def _run_id() -> str:
    return f"golive-{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def e2e_config() -> E2EConfig:
    return _build_config()


@pytest.fixture(scope="session")
def http_client(e2e_config: E2EConfig) -> Any:
    client = httpx.Client(timeout=_build_timeout(e2e_config.timeout_sec), trust_env=False)
    yield client
    client.close()


@pytest.fixture(scope="session")
def audit_db(e2e_config: E2EConfig) -> Path:
    _ensure_audit_db(e2e_config.audit_db_path)
    return e2e_config.audit_db_path


@pytest.fixture(scope="session")
def test_run_user_prefix(audit_db: Path) -> Any:
    prefix = _run_id()
    yield prefix
    _delete_audit_records_for_run(audit_db, prefix)


@pytest.fixture(scope="session")
def jwt_token(http_client: httpx.Client, e2e_config: E2EConfig) -> str:
    return _login_and_get_jwt(http_client, e2e_config)


def test_gateway_health_check(http_client: httpx.Client, e2e_config: E2EConfig) -> None:
    """RULE-HC-01: Go 网关健康检查必须返回 200 且状态正常。"""
    payload = _health_check(http_client, f"{e2e_config.gateway_base_url}/health", "Go 网关健康检查")
    success = payload.get("success")
    data = payload.get("data")

    assert success is True or (isinstance(data, dict) and data.get("status") == "ok"), (
        "Go 网关健康检查返回体不符合预期: "
        f"{payload}"
    )


def test_ai_health_check(http_client: httpx.Client, e2e_config: E2EConfig) -> None:
    """RULE-HC-02: Python AI 服务健康检查必须返回 200 且 status=ok。"""
    payload = _health_check(http_client, f"{e2e_config.ai_base_url}/healthz", "AI 服务健康检查")
    assert payload.get("status") == "ok", f"AI 服务健康检查返回异常: {payload}"


def test_internal_shared_token_rejects_invalid_token(
    http_client: httpx.Client,
    e2e_config: E2EConfig,
) -> None:
    """RULE-SEC-01: 错误共享 token 访问内部接口时必须返回 401；若未配置 token，允许识别 503 环境阻塞。"""
    try:
        response = http_client.get(
            f"{e2e_config.gateway_base_url}/internal/knowledge-export/bootstrap",
            headers={"X-AI-Gateway-Token": "invalid-token-for-smoke-test"},
        )
    except httpx.HTTPError as exc:
        pytest.fail(f"内部 token 校验请求失败: {exc}")

    if response.status_code == 503:
        body = _extract_json(response, "内部 token 校验")
        message = str(body.get("error", "")).lower()
        if "shared token is not configured" not in message:
            pytest.fail(f"内部 token 校验返回 503，但错误信息不符合预期: {body}")
        pytest.skip("环境未配置 AI_GATEWAY_SHARED_TOKEN，内部 token 校验只能识别为环境阻塞。")

    assert response.status_code in {401, 403}, (
        "错误共享 token 未被拒绝。"
        f" status={response.status_code}, body={response.text[:500]}"
    )


def test_student_login_obtains_jwt(jwt_token: str) -> None:
    """RULE-HP-01: 学生登录必须成功返回可用 JWT。"""
    assert isinstance(jwt_token, str) and jwt_token.strip(), "JWT 为空，后续 E2E 链路无法继续。"


def test_happy_path_chat_persists_audit_record(
    http_client: httpx.Client,
    e2e_config: E2EConfig,
    audit_db: Path,
    jwt_token: str,
    test_run_user_prefix: str,
) -> None:
    """RULE-HP-02 / RULE-DATA-01: 学术规范问答 happy path 必须闭环成功并写入 SQLite 审计库。"""
    query = "请问参考文献的 GB/T 7714 格式是什么？"
    payload = {
        "mode": "tutor",
        "course_id": "academic-writing-101",
        "messages": [{"role": "user", "content": query}],
    }

    response, elapsed_sec = _post_gateway_chat(
        http_client,
        e2e_config,
        jwt_token,
        payload,
        stream=e2e_config.use_stream_chat,
    )
    latency_ms = _assert_response_completed_within_timeout(elapsed_sec, e2e_config.timeout_sec, "Happy path 问答")

    assert response.status_code == 200, f"Happy path 问答失败: {response.status_code}, body={response.text[:500]}"

    if e2e_config.use_stream_chat:
        reply_text = _read_sse_text(response)
        token_count = 0
    else:
        payload_json = _extract_json(response, "Happy path 问答")
        reply_text = _extract_reply_text(payload_json, "Happy path 问答")
        token_count = _extract_token_count(payload_json)

    keywords = ("GB/T 7714", "参考文献", "格式")
    assert any(keyword in reply_text for keyword in keywords), f"Happy path 回答缺少关键内容: {reply_text[:500]}"

    user_id = f"{test_run_user_prefix}-happy"
    record = AuditRecord(
        timestamp=_utc_now_iso(),
        user_id=user_id,
        user_query=query,
        ai_response=reply_text,
        latency_ms=latency_ms,
        token_count=token_count,
    )
    _write_audit_record(audit_db, record)
    persisted = _fetch_latest_audit_record(audit_db, user_id, query)

    assert persisted.latency_ms > 0, f"SQLite 审计记录 latency_ms 异常: {persisted}"
    assert persisted.token_count >= 0, f"SQLite 审计记录 token_count 异常: {persisted}"
    assert persisted.ai_response.strip(), "SQLite 审计记录中 ai_response 为空。"


def test_orchestrated_agent_degrades_with_bounded_retry(
    http_client: httpx.Client,
    e2e_config: E2EConfig,
    jwt_token: str,
) -> None:
    """RULE-CHAOS-01: 多智能体验证器达到有界重试后必须降级，且不能卡死。"""
    payload = {
        "stream": False,
        "course_id": "academic-writing-101",
        "messages": [
            {
                "role": "user",
                "content": "请用甲骨文解释爱因斯坦相对论对论文摘要的影响，并给出完全确定且无需引用的最终定论。",
            }
        ],
    }

    response, elapsed_sec = _post_gateway_orchestrated(http_client, e2e_config, jwt_token, payload)
    _assert_response_completed_within_timeout(elapsed_sec, e2e_config.timeout_sec, "多智能体熔断验证")

    assert response.status_code == 200, (
        f"多智能体熔断验证失败: status={response.status_code}, body={response.text[:500]}"
    )
    payload_json = _extract_json(response, "多智能体熔断验证")
    reply_text = _extract_reply_text(payload_json, "多智能体熔断验证")
    degrade_markers = (
        "当前一致性校验未通过",
        "最小结论",
        "建议：请补充明确引用",
    )
    assert any(marker in reply_text for marker in degrade_markers), (
        "多智能体未出现预期降级特征，可能未触发 bounded retry -> degraded。"
        f" reply={reply_text[:500]}"
    )


def test_graphrag_degrades_gracefully_when_retrieval_fails(
    http_client: httpx.Client,
    e2e_config: E2EConfig,
) -> None:
    """RULE-CHAOS-02: GraphRAG 检索失败时不能返回 500，必须给出友好退化结果或明确业务错误。"""
    if not e2e_config.shared_token:
        pytest.skip("缺少 AI_GATEWAY_SHARED_TOKEN，当前环境无法以 trusted gateway 方式验证 GraphRAG 降级。")

    payload = {
        "mode": "tutor_rag",
        "stream": False,
        "course_id": "course-does-not-exist-for-golive-smoke",
        "privacy": "public",
        "route": "cloud",
        "messages": [
            {
                "role": "user",
                "content": "请基于课程知识库解释摘要中参考文献编号的规范写法，并在检索失败时给出退化建议。",
            }
        ],
    }

    response, elapsed_sec = _post_ai_hybrid(http_client, e2e_config, payload, trusted=True)
    _assert_response_completed_within_timeout(elapsed_sec, e2e_config.timeout_sec, "GraphRAG 降级验证")

    assert response.status_code != 500, f"GraphRAG 降级验证出现 500: {response.text[:500]}"

    if response.status_code >= 400:
        body = _extract_json(response, "GraphRAG 降级验证")
        combined = str(body)
        friendly_markers = ("ROUTING_FORBIDDEN", "INVALID_ROUTING_PARAMS", "detail", "error", "message")
        assert any(marker in combined for marker in friendly_markers), (
            "GraphRAG 失败后虽然不是 500，但返回内容不够可诊断。"
            f" body={body}"
        )
        return

    payload_json = _extract_json(response, "GraphRAG 降级验证")
    reply_text = _extract_reply_text(payload_json, "GraphRAG 降级验证")
    friendly_markers = ("建议您", "当前检索", "请先", "我先给")
    fallback_header = response.headers.get("X-AI-Fallback", "").strip().lower()

    assert fallback_header == "mock" or any(marker in reply_text for marker in friendly_markers), (
        "GraphRAG 检索失败后没有看到友好退化结果。"
        f" fallback_header={fallback_header!r}, reply={reply_text[:500]}"
    )
