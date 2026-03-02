"""Heuristic parser for derivation problems."""

from __future__ import annotations

import re

from app.graphrag_neo4j.types import ProblemFrame


class ProblemParser:
    """Extract a normalized problem frame from a derivation request."""

    _geometry_keywords = {
        "球": "球对称区域",
        "球壳": "球对称区域",
        "球面": "球对称区域",
        "柱": "柱对称区域",
        "圆柱": "柱对称区域",
        "平面": "平面对称区域",
        "无限长导线": "柱对称区域",
    }
    _material_keywords = {
        "真空": "真空介质",
        "介质": "介质",
        "导体": "导体",
        "自由空间": "真空介质",
    }
    _boundary_keywords = {
        "接地": "接地边界",
        "无穷远处": "无穷远边界",
        "边界条件": "边界条件已给出",
        "导体表面": "导体表面边界条件",
        "连续": "场量连续条件",
    }
    _symmetry_keywords = {
        "球对称": "球对称",
        "柱对称": "柱对称",
        "平面对称": "平面对称",
    }

    def parse(self, problem_text: str, course_id: str | None = None) -> ProblemFrame:
        text = (problem_text or "").strip()
        target = self._extract_target_quantity(text)
        geometry = self._find_first(text, self._geometry_keywords)
        material_model = self._find_first(text, self._material_keywords)
        boundary_conditions = self._find_all(text, self._boundary_keywords)
        symmetry_hints = self._find_all(text, self._symmetry_keywords)
        givens = self._extract_givens(text)
        task_type = "derivation" if any(token in text for token in ("推导", "证明", "导出")) else "problem_solve"
        missing_constraints = []
        if task_type == "problem_solve" and not geometry:
            missing_constraints.append("geometry")
        if task_type == "problem_solve" and not boundary_conditions:
            missing_constraints.append("boundary_conditions")

        return ProblemFrame(
            task_type=task_type,
            target_quantity=target,
            givens=givens,
            unknowns=[target] if target else [],
            geometry=geometry,
            material_model=material_model,
            boundary_conditions=boundary_conditions,
            symmetry_hints=symmetry_hints,
            requires_full_derivation=True,
            course_id=course_id,
            missing_constraints=missing_constraints,
        )

    def _extract_target_quantity(self, text: str) -> str:
        patterns = [
            r"(?:推导|证明|导出|求)\s*([^，。；\n]+)",
            r"([^，。；\n]+(?:方程|定律|微分形式|积分形式))",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        return text[:48]

    def _extract_givens(self, text: str) -> list[str]:
        lines = re.split(r"[\n；;。]", text)
        givens: list[str] = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if any(token in stripped for token in ("已知", "给定", "设", "其中")):
                givens.append(stripped)
        if not givens and text:
            givens.append(text[:80].strip())
        return givens[:5]

    def _find_first(self, text: str, mapping: dict[str, str]) -> str | None:
        for keyword, value in mapping.items():
            if keyword in text:
                return value
        return None

    def _find_all(self, text: str, mapping: dict[str, str]) -> list[str]:
        values: list[str] = []
        for keyword, value in mapping.items():
            if keyword in text and value not in values:
                values.append(value)
        return values
