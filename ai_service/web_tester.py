"""Gradio Web tester for vLLM OpenAI-compatible chat testing.

该脚本用于毕业设计阶段的小规模真实学生测试：
1. 通过 HTTP 调用 vLLM 暴露的 OpenAI-compatible `/v1/chat/completions`
2. 提供学号/用户名输入、系统 Prompt 配置、聊天主界面
3. 在后台异步写入 SQLite，用于后续论文实验分析
"""

from __future__ import annotations

import atexit
import os
import queue
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import gradio as gr
import httpx


DEFAULT_BASE_URL = os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
DEFAULT_API_KEY = os.getenv("VLLM_API_KEY", "token-local")
DEFAULT_MODEL = os.getenv("VLLM_MODEL", "qwen3.5-9b")
DEFAULT_DB_PATH = os.getenv(
    "WEB_TESTER_DB_PATH",
    os.path.join(os.path.dirname(__file__), "tester_data.db"),
)
DEFAULT_HOST = os.getenv("WEB_TESTER_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.getenv("WEB_TESTER_PORT", "7860"))
REQUEST_TIMEOUT_SEC = float(os.getenv("WEB_TESTER_TIMEOUT_SEC", "60"))

DEFAULT_SYSTEM_PROMPT = """你是《学术规范》课程的严厉助教。

你的职责：
1. 优先检查学生提问中的学术表达、逻辑结构、引用规范、论证严谨性问题。
2. 如果学生观点、引用方式、论文结构或学术措辞不规范，必须明确指出，不得迎合。
3. 回答要直接、严格、专业，但不进行人身攻击。
4. 当信息不足时，明确说明“当前信息不足，无法下结论”，并要求学生补充上下文。
5. 如果学生请求你代写、伪造引用、规避学术规范，应明确拒绝，并解释原因。

输出要求：
- 先给结论，再给理由。
- 能分点时优先分点。
- 如涉及修改建议，给出可执行的改法。
""".strip()


def ensure_parent_dir(path: str) -> None:
    """确保目标文件所在目录存在。"""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


@dataclass(slots=True)
class ChatLogRecord:
    """单轮对话日志。"""

    timestamp: str
    user_id: str
    user_query: str
    ai_response: str
    latency_ms: int
    token_count: int


class SQLiteAsyncLogger:
    """用单独线程串行写 SQLite，避免阻塞主对话请求。"""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._queue: queue.Queue[ChatLogRecord | None] = queue.Queue(maxsize=10000)
        self._stop_event = threading.Event()
        self._worker = threading.Thread(target=self._run, name="sqlite-log-writer", daemon=True)
        self._init_db()
        self._worker.start()
        atexit.register(self.close)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        ensure_parent_dir(self.db_path)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_logs (
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
                "CREATE INDEX IF NOT EXISTS idx_chat_logs_user_time ON chat_logs (user_id, timestamp)"
            )
            conn.commit()

    def submit(self, record: ChatLogRecord) -> None:
        """异步提交日志；队列满时直接丢弃并打印提示，避免主流程卡死。"""
        try:
            self._queue.put_nowait(record)
        except queue.Full:
            print("SQLite log queue is full. Skip one record.")

    def _run(self) -> None:
        conn = self._connect()
        try:
            while not self._stop_event.is_set():
                item = self._queue.get()
                try:
                    if item is None:
                        return
                    conn.execute(
                        """
                        INSERT INTO chat_logs (
                            timestamp,
                            user_id,
                            user_query,
                            ai_response,
                            latency_ms,
                            token_count
                        ) VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item.timestamp,
                            item.user_id,
                            item.user_query,
                            item.ai_response,
                            item.latency_ms,
                            item.token_count,
                        ),
                    )
                    conn.commit()
                except Exception as exc:  # pragma: no cover - 运行期兜底
                    print(f"SQLite write failed: {exc}")
                finally:
                    self._queue.task_done()
        finally:
            conn.close()

    def close(self) -> None:
        """退出前尽量刷新队列。"""
        if self._stop_event.is_set():
            return
        self._stop_event.set()
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            pass
        self._worker.join(timeout=2)


LOGGER = SQLiteAsyncLogger(DEFAULT_DB_PATH)


def utc_now_iso() -> str:
    """生成 ISO 8601 UTC 时间戳。"""
    return datetime.now(timezone.utc).isoformat()


def build_messages(
    system_prompt: str,
    chat_history: list[dict[str, str]],
    user_message: str,
) -> list[dict[str, str]]:
    """把当前系统提示与多轮历史拼成 OpenAI-compatible messages。"""
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in chat_history:
        role = item.get("role", "")
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


def extract_content(message_obj: dict[str, Any]) -> str:
    """兼容 content 为字符串或分片数组的返回结构。"""
    content = message_obj.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts).strip()
    return str(content).strip()


def request_chat_completion(messages: list[dict[str, str]]) -> tuple[str, int]:
    """同步调用 vLLM OpenAI-compatible 接口。"""
    url = f"{DEFAULT_BASE_URL}/chat/completions"
    payload = {
        "model": DEFAULT_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 1024,
        "stream": False,
        # Qwen3.5 默认会输出 thinking 内容。小规模学生测试阶段更适合只展示最终回答。
        "chat_template_kwargs": {"enable_thinking": False},
    }
    headers = {
        "Authorization": f"Bearer {DEFAULT_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=REQUEST_TIMEOUT_SEC, trust_env=False) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("上游返回缺少 choices 字段。")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ValueError("上游返回缺少 message 字段。")

    reply = extract_content(message)
    if not reply:
        raise ValueError("上游返回的回答内容为空。")

    usage = data.get("usage", {})
    token_count = int(usage.get("total_tokens", 0) or 0)
    return reply, token_count


def status_text(*, ok: bool, detail: str, latency_ms: int | None = None, token_count: int | None = None) -> str:
    """统一状态栏文本。"""
    prefix = "成功" if ok else "失败"
    extras: list[str] = []
    if latency_ms is not None:
        extras.append(f"耗时 {latency_ms} ms")
    if token_count is not None:
        extras.append(f"Token {token_count}")
    extra_text = f" | {' | '.join(extras)}" if extras else ""
    return f"{prefix}: {detail}{extra_text}"


def send_message(
    user_id: str,
    system_prompt: str,
    user_message: str,
    chat_state: list[dict[str, str]] | None,
) -> tuple[list[dict[str, str]], list[dict[str, str]], str, str]:
    """聊天主处理函数。"""
    current_history = list(chat_state or [])
    cleaned_user_id = user_id.strip()
    cleaned_prompt = system_prompt.strip() or DEFAULT_SYSTEM_PROMPT
    cleaned_message = user_message.strip()

    if not cleaned_user_id:
        return current_history, current_history, status_text(ok=False, detail="请先填写学号/用户名。"), user_message
    if not cleaned_message:
        return current_history, current_history, status_text(ok=False, detail="请输入问题后再发送。"), user_message

    messages = build_messages(cleaned_prompt, current_history, cleaned_message)
    started = time.perf_counter()

    try:
        reply, token_count = request_chat_completion(messages)
    except httpx.TimeoutException:
        return current_history, current_history, status_text(ok=False, detail="请求超时，请稍后重试。"), user_message
    except httpx.ConnectError:
        return (
            current_history,
            current_history,
            status_text(ok=False, detail="无法连接到 vLLM 服务，请检查服务端是否已启动。"),
            user_message,
        )
    except httpx.HTTPStatusError as exc:
        return (
            current_history,
            current_history,
            status_text(ok=False, detail=f"上游接口返回异常状态码 {exc.response.status_code}。"),
            user_message,
        )
    except Exception as exc:  # pragma: no cover - 运行期兜底
        return current_history, current_history, status_text(ok=False, detail=f"请求失败：{exc}"), user_message

    latency_ms = int((time.perf_counter() - started) * 1000)
    updated_history = current_history + [
        {"role": "user", "content": cleaned_message},
        {"role": "assistant", "content": reply},
    ]

    LOGGER.submit(
        ChatLogRecord(
            timestamp=utc_now_iso(),
            user_id=cleaned_user_id,
            user_query=cleaned_message,
            ai_response=reply,
            latency_ms=latency_ms,
            token_count=token_count,
        )
    )

    return (
        updated_history,
        updated_history,
        status_text(ok=True, detail="回答已生成并写入日志。", latency_ms=latency_ms, token_count=token_count),
        "",
    )


def clear_history() -> tuple[list[dict[str, str]], list[dict[str, str]], str, str]:
    """清空前端历史，不删除数据库。"""
    empty: list[dict[str, str]] = []
    return empty, empty, "已清空当前页面对话历史，数据库记录已保留。", ""


def build_demo() -> gr.Blocks:
    """构建 Gradio 页面。"""
    with gr.Blocks(title="智能教学辅导平台测试页", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            """
            # 智能教学辅导平台测试页
            用于研究生《学术规范》课程的小规模真实学生测试。
            页面会在后台记录学号、问题、回答、耗时和 token 数，用于后续实验分析。
            """
        )

        chat_state = gr.State([])

        with gr.Row():
            user_id = gr.Textbox(
                label="学号 / 用户名",
                placeholder="例如：20250001",
                scale=1,
            )
            status_box = gr.Textbox(
                label="最近一次调用状态",
                value=(
                    f"待机中：当前上游 {DEFAULT_BASE_URL}/chat/completions，"
                    f"模型 {DEFAULT_MODEL}，数据库 {DEFAULT_DB_PATH}"
                ),
                interactive=False,
                scale=2,
            )

        system_prompt = gr.Textbox(
            label="系统 Prompt（默认：《学术规范》课程严厉助教）",
            value=DEFAULT_SYSTEM_PROMPT,
            lines=10,
        )

        chatbot = gr.Chatbot(
            label="聊天主界面",
            type="messages",
            height=560,
            show_copy_button=True,
        )

        with gr.Row():
            user_message = gr.Textbox(
                label="输入你的问题",
                placeholder="例如：请帮我检查这段论文摘要是否符合学术写作规范。",
                lines=4,
                scale=5,
            )
            send_button = gr.Button("发送", variant="primary", scale=1)
            clear_button = gr.Button("清空对话", variant="secondary", scale=1)

        send_button.click(
            fn=send_message,
            inputs=[user_id, system_prompt, user_message, chat_state],
            outputs=[chatbot, chat_state, status_box, user_message],
        )
        user_message.submit(
            fn=send_message,
            inputs=[user_id, system_prompt, user_message, chat_state],
            outputs=[chatbot, chat_state, status_box, user_message],
        )
        clear_button.click(
            fn=clear_history,
            inputs=[],
            outputs=[chatbot, chat_state, status_box, user_message],
        )

    return demo


if __name__ == "__main__":
    app = build_demo()
    app.queue(default_concurrency_limit=16).launch(server_name=DEFAULT_HOST, server_port=DEFAULT_PORT)
