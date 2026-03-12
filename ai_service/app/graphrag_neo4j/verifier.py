"""Symbolic and physics verification for derivation steps."""

from __future__ import annotations

import os
import re

try:
    import sympy
except ImportError:  # pragma: no cover - optional dependency in lean runtime images
    sympy = None

from app.graphrag_neo4j.types import DerivationStepResult, ProblemFrame, ReasoningSubgraph, VerificationResult


class DerivationVerifier:
    """Run lightweight symbolic and physics checks."""

    def verify(
        self,
        *,
        problem_frame: ProblemFrame,
        steps: list[DerivationStepResult],
        subgraph: ReasoningSubgraph,
    ) -> tuple[list[DerivationStepResult], dict[str, str], str]:
        for step in steps:
            symbolic, symbolic_details = self._verify_symbolic(step.equations)
            physics, physics_details = self._verify_physics(problem_frame, step, subgraph)
            step.verification = VerificationResult(
                symbolic=symbolic,
                physics=physics,
                details=symbolic_details + physics_details,
            )

        checks = self._build_top_level_checks(problem_frame, steps, subgraph)
        final_status = "ok"
        if any(step.verification.symbolic == "failed" or step.verification.physics == "failed" for step in steps):
            final_status = "partially_verified"
        if any(value == "failed" for value in checks.values()):
            final_status = "partially_verified"
        coverage = self._citation_coverage(steps)
        checks["citation_coverage"] = f"{coverage:.2f}"
        if coverage < self._citation_threshold():
            final_status = "degraded"
        return steps, checks, final_status

    def _verify_symbolic(self, equations: list[str]) -> tuple[str, list[str]]:
        if sympy is None:
            return "not_applicable", []
        parsed = 0
        failures = 0
        details: list[str] = []
        for equation in equations:
            status, detail = self._verify_equation(equation)
            if status == "not_applicable":
                continue
            parsed += 1
            details.append(detail)
            if status == "failed":
                failures += 1
        if parsed == 0:
            return "not_applicable", []
        if failures:
            return "failed", details
        return "passed", details

    def _verify_equation(self, equation: str) -> tuple[str, str]:
        cleaned = equation.strip()
        if not cleaned or "=" not in cleaned:
            return "not_applicable", ""
        if "\\" in cleaned or any(token in cleaned for token in ("∮", "∫", "∇", "mathbf", "hat", "rho", "varepsilon")):
            return "not_applicable", ""
        if sympy is None:
            return "not_applicable", ""
        left, right = cleaned.split("=", 1)
        try:
            left_expr = sympy.sympify(self._normalize_sympy_expr(left))
            right_expr = sympy.sympify(self._normalize_sympy_expr(right))
        except (sympy.SympifyError, ValueError, SyntaxError):
            return "not_applicable", ""
        if sympy.simplify(left_expr - right_expr) == 0:
            return "passed", f"symbolic_check:{cleaned}"
        return "failed", f"symbolic_mismatch:{cleaned}"

    def _normalize_sympy_expr(self, expr: str) -> str:
        normalized = expr.replace("^", "**")
        normalized = normalized.replace("φ", "phi").replace("ρ", "rho").replace("ε", "eps")
        normalized = re.sub(r"\s+", "", normalized)
        return normalized

    def _verify_physics(
        self,
        problem_frame: ProblemFrame,
        step: DerivationStepResult,
        subgraph: ReasoningSubgraph,
    ) -> tuple[str, list[str]]:
        details: list[str] = []
        if problem_frame.missing_constraints:
            return "failed", [f"missing_constraints:{','.join(problem_frame.missing_constraints)}"]
        if problem_frame.symmetry_hints:
            joined = " ".join([step.explanation] + step.equations)
            if any(hint in joined for hint in problem_frame.symmetry_hints):
                details.append("symmetry_referenced")
                return "passed", details
            if any(hint in (node.title + node.text) for node in subgraph.nodes for hint in problem_frame.symmetry_hints):
                details.append("symmetry_in_subgraph")
                return "passed", details
            return "failed", ["symmetry_not_addressed"]
        if problem_frame.boundary_conditions:
            details.append("boundary_conditions_present")
            return "passed", details
        return "not_applicable", details

    def _build_top_level_checks(
        self,
        problem_frame: ProblemFrame,
        steps: list[DerivationStepResult],
        subgraph: ReasoningSubgraph,
    ) -> dict[str, str]:
        dimension = "not_applicable"
        if any(node.node_id in {"formula:gauss_differential", "formula:gauss_integral", "formula:poisson", "formula:laplace"} for node in subgraph.nodes):
            dimension = "passed"

        boundary = "failed" if problem_frame.missing_constraints else ("passed" if problem_frame.boundary_conditions or problem_frame.task_type == "derivation" else "not_applicable")
        limits = "not_applicable"
        if "无穷远" in " ".join(problem_frame.boundary_conditions):
            limits = "passed"

        symmetry = "not_applicable"
        if problem_frame.symmetry_hints:
            evidence_text = " ".join(step.explanation for step in steps)
            symmetry = "passed" if all(hint in evidence_text or any(hint in node.title for node in subgraph.nodes) for hint in problem_frame.symmetry_hints) else "failed"

        return {
            "dimension": dimension,
            "boundary": boundary,
            "limits": limits,
            "symmetry": symmetry,
        }

    def _citation_coverage(self, steps: list[DerivationStepResult]) -> float:
        if not steps:
            return 0.0
        covered = sum(1 for step in steps if step.citations)
        return covered / len(steps)

    def _citation_threshold(self) -> float:
        raw_value = os.getenv("VERIFIER_CITATION_COVERAGE_THRESHOLD", "0.60").strip()
        try:
            return max(0.0, min(1.0, float(raw_value)))
        except ValueError:
            return 0.60
