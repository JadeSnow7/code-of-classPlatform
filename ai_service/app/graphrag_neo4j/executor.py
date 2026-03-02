"""Plan execution for GraphRAG-based derivations."""

from __future__ import annotations

from collections import OrderedDict

from app.graphrag_neo4j.types import (
    DerivationPlan,
    DerivationStepResult,
    ProblemFrame,
    ReasoningNode,
    ReasoningSubgraph,
    StepCitation,
)


class DerivationExecutor:
    """Expand a derivation plan into user-facing steps."""

    def execute(
        self,
        *,
        problem_text: str,
        problem_frame: ProblemFrame,
        plan: DerivationPlan,
        subgraph: ReasoningSubgraph,
    ) -> list[DerivationStepResult]:
        nodes_by_id = {node.node_id: node for node in subgraph.nodes}
        template_steps = self._try_domain_template(problem_frame, plan, nodes_by_id)
        if template_steps:
            return template_steps

        step_results: list[DerivationStepResult] = []
        for step in plan.steps:
            citations = self._build_citations(step.used_node_ids, nodes_by_id)
            equations = self._collect_equations(step.used_node_ids, nodes_by_id)
            explanation = self._render_generic_explanation(step.goal, step.method, step.assumptions, step.used_node_ids, nodes_by_id)
            step_results.append(
                DerivationStepResult(
                    step_id=step.step_id,
                    title=step.goal,
                    explanation=explanation,
                    equations=equations,
                    citations=citations,
                    verification_targets=equations,
                )
            )
        return step_results

    def _try_domain_template(
        self,
        problem_frame: ProblemFrame,
        plan: DerivationPlan,
        nodes_by_id: dict[str, ReasoningNode],
    ) -> list[DerivationStepResult] | None:
        node_ids = set(nodes_by_id)
        target = problem_frame.target_quantity
        if "formula:gauss_integral" in node_ids and "formula:gauss_differential" in node_ids and "formula:divergence_theorem" in node_ids:
            return self._gauss_derivation_template(nodes_by_id)
        if "formula:poisson" in node_ids and "formula:gauss_differential" in node_ids:
            return self._poisson_derivation_template(nodes_by_id)
        if "formula:laplace" in node_ids and "formula:poisson" in node_ids:
            return self._laplace_derivation_template(nodes_by_id)
        if "高斯定律" in target and "微分形式" in target:
            return self._gauss_derivation_template(nodes_by_id)
        return None

    def _gauss_derivation_template(self, nodes_by_id: dict[str, ReasoningNode]) -> list[DerivationStepResult]:
        citations = self._build_citations(
            ["law:gauss_electric", "formula:gauss_integral", "formula:divergence_theorem", "formula:gauss_differential"],
            nodes_by_id,
        )
        return [
            DerivationStepResult(
                step_id="s1",
                title="从高斯定律积分形式出发",
                explanation="选取任意闭合曲面 $S$ 及其包围体积 $V$，对电场应用高斯定律积分形式，把问题先写成电通量与体内电荷的关系。",
                equations=[r"\oint_S \mathbf{E}\cdot d\mathbf{S} = \frac{1}{\varepsilon_0}\int_V \rho \, dV"],
                citations=citations[:2],
                verification_targets=[r"\oint_S \mathbf{E}\cdot d\mathbf{S} = \frac{1}{\varepsilon_0}\int_V \rho \, dV"],
            ),
            DerivationStepResult(
                step_id="s2",
                title="利用散度定理把曲面积分转化为体积分",
                explanation="对左侧通量项应用散度定理，把闭合曲面积分改写为体积分。这样左右两侧都成为对同一体积 $V$ 的积分表达式。",
                equations=[
                    r"\oint_S \mathbf{E}\cdot d\mathbf{S} = \int_V \nabla\cdot\mathbf{E}\, dV",
                    r"\int_V \nabla\cdot\mathbf{E}\, dV = \frac{1}{\varepsilon_0}\int_V \rho \, dV",
                ],
                citations=citations[1:3],
                verification_targets=[
                    r"\int_V \nabla\cdot\mathbf{E}\, dV = \frac{1}{\varepsilon_0}\int_V \rho \, dV",
                ],
            ),
            DerivationStepResult(
                step_id="s3",
                title="由任意体积上的积分恒等式得到高斯定律微分形式",
                explanation="把两侧积分合并为同一个体积分，可得 $\\int_V(\\nabla\\cdot\\mathbf{E}-\\rho/\\varepsilon_0) dV = 0$。由于体积 $V$ 是任意选取的，因此被积函数必须处处为零。",
                equations=[
                    r"\int_V \left(\nabla\cdot\mathbf{E}-\frac{\rho}{\varepsilon_0}\right) dV = 0",
                    r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}",
                ],
                citations=citations[2:],
                verification_targets=[r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}"],
            ),
            DerivationStepResult(
                step_id="s4",
                title="整理适用条件",
                explanation="上述推导依赖于场量足够光滑，从而散度定理可用；同时使用了真空中的高斯定律写法，因此最终得到真空静电场中的微分形式。",
                equations=[],
                citations=citations,
                verification_targets=[],
            ),
        ]

    def _poisson_derivation_template(self, nodes_by_id: dict[str, ReasoningNode]) -> list[DerivationStepResult]:
        citations = self._build_citations(["formula:gauss_differential", "formula:poisson"], nodes_by_id)
        return [
            DerivationStepResult(
                step_id="s1",
                title="从高斯定律微分形式与电势定义出发",
                explanation="静电场中有 $\\mathbf{E}=-\\nabla\\varphi$，同时高斯定律微分形式给出 $\\nabla\\cdot\\mathbf{E}=\\rho/\\varepsilon$。",
                equations=[
                    r"\mathbf{E} = -\nabla \varphi",
                    r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon}",
                ],
                citations=citations,
                verification_targets=[],
            ),
            DerivationStepResult(
                step_id="s2",
                title="代入并整理得到泊松方程",
                explanation="把 $\\mathbf{E}=-\\nabla\\varphi$ 代入高斯定律微分形式，可得 $\\nabla\\cdot(-\\nabla\\varphi)=\\rho/\\varepsilon$，即泊松方程。",
                equations=[r"\nabla^2 \varphi = -\frac{\rho}{\varepsilon}"],
                citations=citations,
                verification_targets=[],
            ),
        ]

    def _laplace_derivation_template(self, nodes_by_id: dict[str, ReasoningNode]) -> list[DerivationStepResult]:
        citations = self._build_citations(["formula:poisson", "formula:laplace"], nodes_by_id)
        return [
            DerivationStepResult(
                step_id="s1",
                title="从泊松方程出发",
                explanation="静电势的一般控制方程为泊松方程 $\\nabla^2\\varphi=-\\rho/\\varepsilon$。",
                equations=[r"\nabla^2 \varphi = -\frac{\rho}{\varepsilon}"],
                citations=citations,
                verification_targets=[],
            ),
            DerivationStepResult(
                step_id="s2",
                title="在无源区域令体电荷密度为零",
                explanation="若所讨论区域内不存在自由电荷，则 $\\rho=0$，泊松方程立即退化为拉普拉斯方程。",
                equations=[r"\nabla^2 \varphi = 0"],
                citations=citations,
                verification_targets=[],
            ),
        ]

    def _build_citations(self, node_ids: list[str], nodes_by_id: dict[str, ReasoningNode]) -> list[StepCitation]:
        citations: list[StepCitation] = []
        seen: set[str] = set()
        for node_id in node_ids:
            node = nodes_by_id.get(node_id)
            if not node or node_id in seen:
                continue
            seen.add(node_id)
            citations.append(
                StepCitation(
                    node_id=node_id,
                    source_id=node.source_id,
                    source_type=node.source_type,
                    title=node.title,
                )
            )
        return citations

    def _collect_equations(self, node_ids: list[str], nodes_by_id: dict[str, ReasoningNode]) -> list[str]:
        equations = []
        for node_id in node_ids:
            node = nodes_by_id.get(node_id)
            if not node:
                continue
            if node.latex:
                equations.append(node.latex)
        deduped = list(OrderedDict.fromkeys(equations))
        return deduped[:4]

    def _render_generic_explanation(
        self,
        goal: str,
        method: str,
        assumptions: list[str],
        node_ids: list[str],
        nodes_by_id: dict[str, ReasoningNode],
    ) -> str:
        titles = [nodes_by_id[node_id].title for node_id in node_ids if node_id in nodes_by_id and nodes_by_id[node_id].title]
        basis = "、".join(titles[:4]) if titles else "知识图谱中的候选定律与证据"
        assumption_text = f" 当前采用的假设包括：{'、'.join(assumptions)}。" if assumptions else ""
        if method == "foundation":
            return f"本步先调用 {basis}，建立后续推导所需的基础关系。{assumption_text}".strip()
        if method == "derive_target":
            return f"在前面的基础关系之上，将 {basis} 连接起来，把中间变量消去并整理成目标公式。{assumption_text}".strip()
        if method == "verification_and_wrapup":
            return f"最后结合 {basis} 检查适用条件、边界条件和对称性，并把推导结果整理成最终结论。{assumption_text}".strip()
        return f"围绕“{goal}”，从 {basis} 中抽取可以直接支撑推导的关系链。{assumption_text}".strip()
