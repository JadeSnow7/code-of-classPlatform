"""Derivation planning based on the retrieved reasoning subgraph."""

from __future__ import annotations

from collections import defaultdict

from app.graphrag_neo4j.types import DerivationPlan, DerivationPlanStep, ProblemFrame, ReasoningEdge, ReasoningNode, ReasoningSubgraph


class DerivationPlanner:
    """Construct a high-level derivation plan from graph evidence."""

    def plan(self, *, problem_frame: ProblemFrame, subgraph: ReasoningSubgraph) -> DerivationPlan:
        nodes_by_id = {node.node_id: node for node in subgraph.nodes}
        edges_by_source: dict[str, list[ReasoningEdge]] = defaultdict(list)
        incoming: dict[str, list[ReasoningEdge]] = defaultdict(list)
        for edge in subgraph.edges:
            edges_by_source[edge.source].append(edge)
            incoming[edge.target].append(edge)

        primary = self._pick_primary_node(problem_frame, subgraph.nodes)
        primary_title = primary.title if primary else problem_frame.target_quantity or "目标结论"
        primary_method = primary_title
        steps: list[DerivationPlanStep] = []

        foundational_ids = []
        if primary:
            foundational_ids = [
                edge.target if edge.source == primary.node_id else edge.source
                for edge in incoming.get(primary.node_id, []) + edges_by_source.get(primary.node_id, [])
                if edge.relation in {"DERIVES_FROM", "USES", "APPLIES_WHEN", "HAS_BOUNDARY", "HAS_SYMMETRY"}
            ]
            foundational_ids = [node_id for node_id in foundational_ids if node_id in nodes_by_id and node_id != primary.node_id]

        steps.append(
            DerivationPlanStep(
                step_id="s1",
                goal=f"识别题目目标并建立推导起点：{primary_title}",
                method="problem_framing",
                used_node_ids=[primary.node_id] if primary else [],
                assumptions=self._build_assumptions(problem_frame),
                required_symbolic_check=False,
                required_physics_check=True,
            )
        )

        if foundational_ids:
            steps.append(
                DerivationPlanStep(
                    step_id="s2",
                    goal="调用基础定律、定理或条件建立推导主链",
                    method="foundation",
                    used_node_ids=foundational_ids[:4],
                    assumptions=self._build_assumptions(problem_frame),
                    required_symbolic_check=True,
                    required_physics_check=True,
                )
            )

        used_in_main = [primary.node_id] if primary else []
        used_in_main.extend(foundational_ids[:2])
        steps.append(
            DerivationPlanStep(
                step_id="s3",
                goal=f"将基础关系转换为目标结论：{primary_title}",
                method="derive_target",
                used_node_ids=used_in_main,
                assumptions=self._build_assumptions(problem_frame),
                required_symbolic_check=True,
                required_physics_check=True,
            )
        )

        steps.append(
            DerivationPlanStep(
                step_id="s4",
                goal="检查适用条件、边界条件和对称性，并整理最终结论",
                method="verification_and_wrapup",
                used_node_ids=self._collect_condition_nodes(subgraph.nodes)[:4],
                assumptions=self._build_assumptions(problem_frame),
                required_symbolic_check=False,
                required_physics_check=True,
            )
        )

        alternatives = [node.title for node in subgraph.nodes if node.node_id != getattr(primary, "node_id", "") and node.title][:3]
        return DerivationPlan(primary_method=primary_method, steps=steps, alternatives=alternatives)

    def _pick_primary_node(self, problem_frame: ProblemFrame, nodes: list[ReasoningNode]) -> ReasoningNode | None:
        target = problem_frame.target_quantity.strip()
        ranked = sorted(nodes, key=lambda node: (-node.score, node.node_id))
        for node in ranked:
            title = node.title or ""
            if target and target in title:
                return node
        for label in ("Formula", "Law", "Problem", "WorkedExample"):
            for node in ranked:
                if label in node.labels:
                    return node
        return ranked[0] if ranked else None

    def _build_assumptions(self, frame: ProblemFrame) -> list[str]:
        assumptions = []
        if frame.material_model:
            assumptions.append(frame.material_model)
        assumptions.extend(frame.boundary_conditions)
        assumptions.extend(frame.symmetry_hints)
        return assumptions[:4]

    def _collect_condition_nodes(self, nodes: list[ReasoningNode]) -> list[str]:
        node_ids = []
        for node in nodes:
            if any(label in node.labels for label in ("Condition", "BoundaryCondition", "Symmetry")):
                node_ids.append(node.node_id)
        return node_ids
