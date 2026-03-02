"""Output formatting for GraphRAG derivation responses."""

from __future__ import annotations

from collections import OrderedDict

from app.graphrag_neo4j.types import DerivationStepResult, ProblemFrame, StepCitation


class DerivationFormatter:
    """Render the final structured derivation answer."""

    def format(
        self,
        *,
        problem_text: str,
        problem_frame: ProblemFrame,
        steps: list[DerivationStepResult],
        checks: dict[str, str],
        citations: list[StepCitation],
    ) -> str:
        lines = [
            "### 题目理解",
            problem_text.strip(),
            "",
            "### 已知条件与假设",
        ]
        assumption_lines = []
        if problem_frame.givens:
            assumption_lines.append(f"- 已知：{'；'.join(problem_frame.givens)}")
        if problem_frame.geometry:
            assumption_lines.append(f"- 几何结构：{problem_frame.geometry}")
        if problem_frame.material_model:
            assumption_lines.append(f"- 介质模型：{problem_frame.material_model}")
        if problem_frame.boundary_conditions:
            assumption_lines.append(f"- 边界条件：{'；'.join(problem_frame.boundary_conditions)}")
        if problem_frame.symmetry_hints:
            assumption_lines.append(f"- 对称性：{'；'.join(problem_frame.symmetry_hints)}")
        if problem_frame.missing_constraints:
            assumption_lines.append(f"- 缺失约束：{'；'.join(problem_frame.missing_constraints)}")
        if not assumption_lines:
            assumption_lines.append("- 无额外约束，按标准电磁场推导处理。")
        lines.extend(assumption_lines)
        lines.extend(["", "### 推导"])

        for idx, step in enumerate(steps, start=1):
            lines.append(f"{idx}. {step.title}")
            lines.append(step.explanation)
            for equation in step.equations:
                lines.append(f"   - {equation}")
            if step.citations:
                citation_tags = "".join([f"[{citation.id or citation.node_id}]" for citation in step.citations])
                lines.append(f"   - 依据：{citation_tags}")

        lines.extend(["", "### 最终结论"])
        if steps and steps[-1].equations:
            lines.append(steps[-1].equations[-1])
        elif steps:
            lines.append(steps[-1].explanation)
        else:
            lines.append("知识图谱上下文不足，无法给出可信推导。")

        lines.extend(["", "### 检查"])
        for key, value in checks.items():
            lines.append(f"- {key}: {value}")

        lines.extend(["", "### 依据"])
        for citation in citations:
            label = citation.title or citation.node_id
            lines.append(f"- [{citation.id or citation.node_id}] {label}")

        return "\n".join(lines).strip()

    def collect_citations(self, steps: list[DerivationStepResult]) -> list[StepCitation]:
        deduped: "OrderedDict[str, StepCitation]" = OrderedDict()
        counter = 1
        for step in steps:
            for citation in step.citations:
                key = citation.node_id
                if key in deduped:
                    continue
                stored = citation.model_copy()
                stored.id = f"c{counter}"
                deduped[key] = stored
                counter += 1
        return list(deduped.values())
