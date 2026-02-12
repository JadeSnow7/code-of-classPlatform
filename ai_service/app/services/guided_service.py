"""Guided-learning service implementation."""

from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import HTTPException, Request, Response

from app.core import audit as audit_core
from app.core import graphrag_runtime as graphrag_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.core.contracts import GuidedChatRequest, GuidedChatResponse
from app.graphrag.retrieve import Citation, RetrievalContext, build_rag_context_with_citations
from app.session import LearningSession, LearningStep, SessionManager
from app.skills.guided_learning import GuidedLearningSkill
from app.tools import AVAILABLE_TOOLS, execute_tool, get_tool_result_message
from app.weak_point_detector import detect_weak_points


def _parse_learning_path(llm_output: str) -> list[LearningStep] | None:
    match = re.search(r"```json\s*(.*?)\s*```", llm_output, re.DOTALL)
    if not match:
        match = re.search(r"\{[^{}]*\"steps\"[^{}]*\[.*?\][^{}]*\}", llm_output, re.DOTALL)
        if not match:
            return None
        json_str = match.group(0)
    else:
        json_str = match.group(1)

    try:
        data = json.loads(json_str)
        steps: list[LearningStep] = []
        for s in data.get("steps", []):
            steps.append(
                LearningStep(
                    step=s.get("step", len(steps) + 1),
                    title=s.get("title", ""),
                    description=s.get("description", ""),
                    prerequisite_concepts=s.get("prerequisite_concepts", []),
                    requires_tool_verification=s.get("requires_tool_verification", False),
                )
            )
        return steps if steps else None
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


async def _call_llm_with_tools(
    messages: list[dict],
    decision: routing_core.RoutingDecision,
    enable_tools: bool = True,
    max_tool_calls: int = 3,
) -> tuple[str, list[dict], str, str, str]:
    payload: dict[str, Any] = {
        "messages": messages,
        "temperature": 0.3,
        "stream": False,
    }

    if enable_tools:
        payload["tools"] = AVAILABLE_TOOLS
        payload["tool_choice"] = "auto"

    tool_results: list[dict] = []
    final_upstream = "none"
    fallback_reason = ""
    model = ""

    for _ in range(max_tool_calls + 1):
        data, final_upstream, fallback_reason, model = await upstream_core._post_chat_completions_with_routing(payload, decision)
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        finish_reason = choice.get("finish_reason", "")

        tool_calls_data = message.get("tool_calls", [])

        if finish_reason == "tool_calls" or tool_calls_data:
            messages.append(message)

            for tc in tool_calls_data:
                func = tc.get("function", {})
                name = func.get("name", "")
                try:
                    args = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    args = {}

                result = await execute_tool(name, args)
                tool_results.append(
                    {
                        "name": name,
                        "success": result.success,
                        "result": result.result,
                        "error": result.error,
                    }
                )

                result_message = get_tool_result_message(name, result)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": result_message,
                    }
                )

            payload["messages"] = messages
            continue

        content = message.get("content", "")
        return str(content).strip(), tool_results, model, final_upstream, fallback_reason

    return "达到最大工具调用次数限制。", tool_results, model, final_upstream, fallback_reason


async def chat_guided(
    req: GuidedChatRequest,
    request: Request,
    response: Response,
) -> GuidedChatResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/chat/guided",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    user_id = req.user_id or request.headers.get("X-User-Id", "anonymous")
    course_id = req.course_id or request.headers.get("X-Course-Id")
    final_upstream = "none"
    fallback_reason = ""
    model = ""

    session: LearningSession | None = None

    if req.session_id:
        session = SessionManager.get_for_user(req.session_id, user_id)
        if not session:
            audit_core._audit_request_complete(
                decision,
                status_code=200,
                final_upstream=final_upstream,
                fallback_reason="session_not_found",
                started_at=started_at,
            )
            return GuidedChatResponse(
                reply="会话不存在或已过期，请开始新的学习。",
                session_id="",
                current_step=0,
                total_steps=0,
                progress_percentage=0.0,
            )

    if not session:
        if not req.topic:
            topic = req.messages[-1].content if req.messages else "电磁场学习"
        else:
            topic = req.topic

        session = SessionManager.create(user_id, topic, course_id)

        skill = GuidedLearningSkill()
        path_prompt = skill.build_learning_path_prompt(topic)

        messages = [
            {"role": "system", "content": path_prompt},
            {"role": "user", "content": f"请为以下学习主题生成学习路径：{topic}"},
        ]

        try:
            path_response, _, model, final_upstream, fallback_reason = await _call_llm_with_tools(
                messages,
                decision,
                enable_tools=False,
            )
        except HTTPException:
            path_response = ""

        learning_path = _parse_learning_path(path_response)
        if learning_path:
            session.learning_path = learning_path
            session.learning_goal = topic
        else:
            session.learning_path = [
                LearningStep(step=1, title="理解基本概念", description="掌握核心定义和原理"),
                LearningStep(step=2, title="公式推导", description="理解关键公式的推导过程"),
                LearningStep(step=3, title="应用练习", description="通过例题巩固理解"),
            ]
            session.learning_goal = topic

        SessionManager.update(session)

    citations: list[Citation] = []
    rag_context = ""

    if routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if index:
            query = req.messages[-1].content if req.messages else ""
            ctx = RetrievalContext(
                query=query,
                course_id=course_id,
                user_id=None,
                user_role="student",
            )

            try:
                rag_context, citations = await build_rag_context_with_citations(
                    index,
                    ctx,
                    graphrag_core._get_vector_store(graphrag_core._embedding_route(decision.route_resolved)),
                    graphrag_core._get_embedding(graphrag_core._embedding_route(decision.route_resolved)),
                    seed_top_k=routing_core._get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                    expand_hops=routing_core._get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                    final_top_k=routing_core._get_int_env("GRAPH_RAG_FINAL_TOP_K", default=6),
                    max_chars=routing_core._get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=3000),
                )
            except Exception:
                rag_context = ""
                citations = []

    skill = GuidedLearningSkill()
    learning_path_dicts = [
        {
            "step": s.step,
            "title": s.title,
            "description": s.description,
            "completed": s.completed,
        }
        for s in session.learning_path
    ]

    system_prompt = skill.build_system_prompt(
        context={
            "learning_goal": session.learning_goal,
            "learning_path": learning_path_dicts,
            "current_step": session.current_step,
            "total_steps": len(session.learning_path),
            "weak_points": session.weak_points,
            "rag_context": rag_context if rag_context else "暂无相关知识库内容",
        }
    )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for m in session.messages[-10:]:
        messages.append(m)
    for m in req.messages:
        messages.append(m.model_dump())

    enable_tools = False
    if session.learning_path and session.current_step < len(session.learning_path):
        current_step = session.learning_path[session.current_step]
        enable_tools = current_step.requires_tool_verification

    try:
        reply, tool_results, model, final_upstream, fallback_reason = await _call_llm_with_tools(
            messages,
            decision,
            enable_tools=enable_tools,
        )
    except HTTPException as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise

    for m in req.messages:
        session.messages.append(m.model_dump())
    session.messages.append({"role": "assistant", "content": reply})

    positive_indicators = ["正确", "很好", "太棒了", "完全正确", "进入下一步", "接下来"]
    if any(ind in reply for ind in positive_indicators):
        session.advance_step()

    detected_weak_points = detect_weak_points(reply)
    for concept in detected_weak_points:
        session.add_weak_point(concept)

    SessionManager.update(session)

    citations_dict = [
        {
            "index": c.index,
            "source": c.source,
            "section": c.section,
            "chunk_id": c.chunk_id,
            "text": c.text,
            "score": c.score,
        }
        for c in citations
    ]

    audit_core._audit_request_complete(
        decision,
        status_code=200,
        final_upstream=final_upstream,
        fallback_reason=fallback_reason,
        started_at=started_at,
    )
    return GuidedChatResponse(
        reply=reply,
        session_id=session.session_id,
        current_step=session.current_step,
        total_steps=len(session.learning_path),
        progress_percentage=session.get_progress_percentage(),
        weak_points=session.weak_points,
        citations=citations_dict,
        tool_results=tool_results,
        model=model or None,
        learning_path=learning_path_dicts,
    )
