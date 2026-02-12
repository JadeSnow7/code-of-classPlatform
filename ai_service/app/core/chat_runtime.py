"""Chat-mode parsing, prompting, and multimodal helpers."""

from __future__ import annotations

from typing import Any

from app.core.contracts import ChatMessage, MultimodalChatMessage
from app.core.routing import _get_bool_env
from app.model_router import to_openai_content, validate_message_parts

EDGE_TUTOR_SYSTEM_PROMPT = (
    "你是端侧学习助手，优先本地处理请求。回答要简洁、结构化、可执行。"
    "对于课程资源检索、学习追踪、简单问答，直接给出本地可执行建议。"
    "当问题属于复杂推理、证明、深入理论分析时，不要编造长推导，"
    "请明确说明该问题将转发云端 AI 处理。"
)

EDGE_COMPLEX_CLOUD_HINT = (
    "这是一个数学证明问题，需要严密的逻辑推理。"
    "我已将问题转发给云端 AI，它会提供完整的证明过程。"
)


def _parse_mode(mode: str | None) -> tuple[str | None, bool]:
    if not mode:
        return None, False
    normalized = mode.strip().lower()
    if normalized.endswith("_rag"):
        base = normalized[: -len("_rag")].strip() or None
        return base, True
    return normalized, False


def _latest_user_query_from_multimodal(messages: list[MultimodalChatMessage]) -> str:
    for message in reversed(messages):
        if message.role != "user":
            continue
        if message.content and message.content.strip():
            return message.content.strip()
        if not message.parts:
            continue
        for part in message.parts:
            if part.type == "text" and part.text and part.text.strip():
                return part.text.strip()
    return ""


def _latest_user_query(messages: list[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content:
            return message.content.strip()
    return ""


def _edge_complex_requires_cloud_hint(mode: str | None, query: str) -> bool:
    if not _get_bool_env("EDGE_TUTOR_PROMPT_ENABLED", default=False):
        return False
    base_mode, _ = _parse_mode(mode)
    if base_mode != "tutor":
        return False
    normalized_query = query.strip().lower()
    if not normalized_query:
        return False
    keywords = (
        "证明",
        "推导",
        "严格证明",
        "复杂推理",
        "格林定理",
        "波动方程",
    )
    return any(keyword in normalized_query for keyword in keywords)


def _to_openai_multimodal_message(message: MultimodalChatMessage) -> dict[str, Any]:
    message_dict = message.model_dump(exclude_none=True)
    validate_message_parts(message_dict)
    parts = message_dict.get("parts") or []
    content = message_dict.get("content")
    if not parts:
        return {"role": message.role, "content": content or ""}
    return {
        "role": message.role,
        "content": to_openai_content(parts, content=content),
    }


def _system_prompt(mode: str | None, context: dict | None = None) -> str | None:
    base_mode, _ = _parse_mode(mode)
    if not base_mode:
        return None

    try:
        from app.skills import get_skill

        skill = get_skill(base_mode)
        if skill:
            return skill.build_system_prompt(context)
    except ImportError:
        pass

    if base_mode == "tutor":
        if _get_bool_env("EDGE_TUTOR_PROMPT_ENABLED", default=False):
            return EDGE_TUTOR_SYSTEM_PROMPT
        return (
            "你是研究生专业英文写作课程助教（也可适配其他课程）。"
            "回答要循序渐进，先给结论/要点，再解释原因与例子，最后给可执行的修改/练习建议。"
            "如果启用知识库检索（RAG），请严格按引用编号标注，不要编造引用。"
        )
    if base_mode == "grader":
        return (
            "你是研究生专业英文写作课程助教，任务是辅助批改写作作业。"
            "请引用原文片段定位问题，按 rubric 给出可执行的改进建议与修改顺序。"
            "默认不代写整篇；如需示范，仅提供 1-2 句或一个段落框架。"
        )
    if base_mode == "sim_explain":
        return (
            "你是《电磁场》课程助教，任务是解释仿真结果。"
            "请结合参数与图像趋势解释物理含义，并给出课堂提问建议。"
        )
    if base_mode == "formula_verify":
        return (
            "你是《电磁场》课程助教，任务是帮助验证和推导公式。"
            "请按以下步骤处理：\n"
            "1. 首先确认公式是否正确，指出可能的错误\n"
            "2. 给出完整的推导过程，每一步都要说明依据（如麦克斯韦方程、边界条件等）\n"
            "3. 说明公式的适用范围和限制条件\n"
            "4. 如有必要，给出数值计算示例验证公式\n"
            "使用 LaTeX 格式书写公式，如 $\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$"
        )
    if base_mode == "sim_tutor":
        return (
            "你是《电磁场》课程助教，专门负责仿真结果的教学解读。"
            "你的任务是：\n"
            "1. 解释仿真图像中的物理现象，如电场线分布、电势等值线含义\n"
            "2. 将仿真结果与理论公式关联，说明数值解与解析解的对应关系\n"
            "3. 引导学生发现仿真中的关键特征（如边界效应、对称性等）\n"
            "4. 提出思考问题帮助学生深入理解\n"
            "5. 如果用户提供了仿真参数，请分析参数变化对结果的影响\n"
            "回答时要图文结合，引用仿真结果中的具体数据。"
        )
    if base_mode == "problem_solver":
        return (
            "你是《电磁场》课程助教，擅长解决电磁场计算题。"
            "解题步骤：\n"
            "1. 分析问题，明确已知条件和求解目标\n"
            "2. 选择合适的坐标系和求解方法\n"
            "3. 列出相关的基本方程（如泊松方程、拉普拉斯方程、边界条件）\n"
            "4. 进行推导，每步给出详细说明\n"
            "5. 代入数值计算，注意单位换算\n"
            "6. 检验结果的合理性（量纲、极限情况、物理直觉）\n"
            "使用 LaTeX 格式书写公式。"
        )
    if base_mode == "polish":
        return (
            "你是专业的学术英文写作编辑，致力于提升研究生的写作质量。"
            "任务要求：\n"
            "1. 润色提供的英文段落，提升学术语气（Formal Academic Tone）\n"
            "2. 修正语法、拼写和标点错误\n"
            "3. 改善句式结构，使其更地道流畅\n"
            "4. 保持原意不变\n\n"
            "请严格按照以下 JSON 格式返回结果（不要包含 Markdown 代码块标记，仅返回纯 JSON）：\n"
            "{\n"
            "  \"original\": \"原始文本\",\n"
            "  \"polished\": \"润色后的文本\",\n"
            "  \"changes\": [\n"
            "    {\n"
            "      \"type\": \"grammar/style/vocabulary\",\n"
            "      \"original_fragment\": \"原句片段\",\n"
            "      \"revised_fragment\": \"修改后片段\",\n"
            "      \"reason\": \"修改原因解释\"\n"
            "    }\n"
            "  ],\n"
            "  \"overall_comment\": \"总体评价和建议\"\n"
            "}"
        )
    return None


__all__ = [
    "EDGE_TUTOR_SYSTEM_PROMPT",
    "EDGE_COMPLEX_CLOUD_HINT",
    "_parse_mode",
    "_latest_user_query_from_multimodal",
    "_latest_user_query",
    "_edge_complex_requires_cloud_hint",
    "_to_openai_multimodal_message",
    "_system_prompt",
]
