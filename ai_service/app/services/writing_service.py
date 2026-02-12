"""Writing-analysis service implementation."""

from __future__ import annotations

import re
import time

from fastapi import HTTPException, Request, Response

from app.core import audit as audit_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.core.contracts import DimensionScore, WritingAnalysisRequest, WritingAnalysisResponse
from app.writing_concepts import WRITING_TYPES
from app.writing_prompts import get_writing_analysis_prompt


async def analyze_writing(
    req: WritingAnalysisRequest,
    request: Request,
    response: Response,
) -> WritingAnalysisResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/writing/analyze",
        mode="writing",
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    if req.writing_type not in WRITING_TYPES:
        req.writing_type = "course_paper"

    system_prompt, user_prompt = get_writing_analysis_prompt(
        content=req.content,
        writing_type=req.writing_type,
        student_profile=req.student_profile,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    payload = {
        "messages": messages,
        "temperature": 0.3,
        "stream": False,
    }

    final_upstream = "none"
    fallback_reason = ""
    try:
        data, final_upstream, fallback_reason, model = await upstream_core._post_chat_completions_with_routing(payload, decision)
        raw_feedback = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except HTTPException as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise

    dimensions, strengths, improvements, overall_score = _parse_writing_feedback(raw_feedback, req.writing_type)

    type_name = WRITING_TYPES[req.writing_type]["name"]
    summary = f"您的{type_name}总体评分为 {overall_score:.1f}/10。"
    if improvements:
        summary += f"主要需要改进的方面：{improvements[0]}"

    word_count = len(req.content.split())

    audit_core._audit_request_complete(
        decision,
        status_code=200,
        final_upstream=final_upstream,
        fallback_reason=fallback_reason,
        started_at=started_at,
    )
    return WritingAnalysisResponse(
        overall_score=overall_score,
        dimensions=dimensions,
        strengths=strengths,
        improvements=improvements,
        summary=summary,
        raw_feedback=raw_feedback,
        word_count=word_count,
        writing_type=req.writing_type,
        model=model,
    )


def _parse_writing_feedback(
    feedback: str, writing_type: str
) -> tuple[list[DimensionScore], list[str], list[str], float]:
    lines = feedback.split("\n")

    type_info = WRITING_TYPES.get(writing_type, WRITING_TYPES["course_paper"])
    expected_weights = type_info.get("weights", {})

    dimensions: list[DimensionScore] = []
    strengths: list[str] = []
    improvements: list[str] = []

    current_section = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if "优点" in line or "strengths" in line.lower():
            current_section = "strengths"
            continue
        elif "改进" in line or "improvements" in line.lower() or "建议" in line:
            current_section = "improvements"
            continue
        elif "总体" in line or "overall" in line.lower():
            current_section = "overall"
            continue

        if "**" in line or "(" in line:
            for dim_name in expected_weights.keys():
                if dim_name in line:
                    score = _extract_score(line)
                    if score is not None:
                        dimensions.append(
                            DimensionScore(
                                name=dim_name,
                                score=score,
                                weight=expected_weights.get(dim_name, 0.1),
                                comment=line,
                            )
                        )
                    break

        if current_section == "strengths" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                strengths.append(text)
        elif current_section == "improvements" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                improvements.append(text)

    if dimensions:
        total_weight = sum(d.weight for d in dimensions)
        if total_weight > 0:
            overall_score = sum(d.score * d.weight for d in dimensions) / total_weight
        else:
            overall_score = sum(d.score for d in dimensions) / len(dimensions)
    else:
        overall_score = _extract_score(feedback) or 6.0

    if not strengths:
        strengths = ["写作内容已提交，请查看详细反馈"]
    if not improvements:
        improvements = ["请查看详细反馈中的具体建议"]

    return dimensions, strengths[:5], improvements[:5], min(10.0, max(0.0, overall_score))


def _extract_score(text: str) -> float | None:
    match = re.search(r"(\d+\.?\d*)\s*/\s*10", text)
    if match:
        return float(match.group(1))

    match = re.search(r"(\d+\.?\d*)\s*分", text)
    if match:
        score = float(match.group(1))
        if score <= 10:
            return score
        return score / 10

    match = re.search(r"[：:]\s*(\d+\.?\d*)", text)
    if match:
        score = float(match.group(1))
        if score <= 10:
            return score

    return None
