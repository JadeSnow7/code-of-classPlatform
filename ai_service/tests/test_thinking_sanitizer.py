from __future__ import annotations

from app import main


def test_prepare_chat_completions_payload_disables_thinking_without_overwriting_other_kwargs() -> None:
    payload = {
        "messages": [{"role": "user", "content": "hello"}],
        "chat_template_kwargs": {"foo": "bar"},
    }

    prepared = main._prepare_chat_completions_payload(payload, model="qwen3.5-9b", stream=True)

    assert prepared["model"] == "qwen3.5-9b"
    assert prepared["stream"] is True
    assert prepared["chat_template_kwargs"] == {"foo": "bar", "enable_thinking": False}


def test_sanitize_chat_completion_data_removes_reasoning_and_think_blocks() -> None:
    data = {
        "choices": [
            {
                "message": {
                    "content": "<think>先分析题意</think>\n最终答案：这是测试回答。",
                    "reasoning_content": "不应暴露",
                }
            }
        ]
    }

    sanitized = main._sanitize_chat_completion_data(data)

    message = sanitized["choices"][0]["message"]
    assert message["content"] == "最终答案：这是测试回答。"
    assert "reasoning_content" not in message
    assert "reasoning" not in message


def test_streaming_content_sanitizer_drops_think_chunks() -> None:
    sanitizer = main._StreamingContentSanitizer()

    chunks = [
        "<think>先分析",
        "一下</think>最终答",
        "案。",
    ]

    outputs = [sanitizer.sanitize(chunk) for chunk in chunks]

    assert "".join(outputs) == "最终答案。"


def test_streaming_content_sanitizer_drops_thinking_process_prefix() -> None:
    sanitizer = main._StreamingContentSanitizer()

    outputs = [
        sanitizer.sanitize("Thinking Process:\n\n最终答"),
        sanitizer.sanitize("案。"),
    ]

    assert "".join(outputs) == "最终答案。"
