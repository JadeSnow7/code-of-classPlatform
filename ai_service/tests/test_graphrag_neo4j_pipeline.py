from __future__ import annotations

from app.graphrag_neo4j.executor import DerivationExecutor
from app.graphrag_neo4j.formatter import DerivationFormatter
from app.graphrag_neo4j.planner import DerivationPlanner
from app.graphrag_neo4j.problem_parser import ProblemParser
from app.graphrag_neo4j.types import ReasoningEdge, ReasoningNode, ReasoningSubgraph
from app.graphrag_neo4j.verifier import DerivationVerifier


def test_problem_parser_extracts_target_and_constraints() -> None:
    parser = ProblemParser()
    frame = parser.parse("推导真空中静电场的高斯定律微分形式，并说明球对称情况下的意义", course_id="2")

    assert frame.task_type == "derivation"
    assert "高斯定律微分形式" in frame.target_quantity
    assert frame.material_model == "真空介质"
    assert "球对称" in frame.symmetry_hints
    assert frame.course_id == "2"


def test_planner_executor_verifier_for_gauss_chain() -> None:
    subgraph = ReasoningSubgraph(
        anchor_ids=["law:gauss_electric", "formula:gauss_differential"],
        nodes=[
            ReasoningNode(node_id="law:gauss_electric", labels=["Law"], title="高斯定律", text="电通量与包围电荷关系", score=1.0),
            ReasoningNode(node_id="formula:gauss_integral", labels=["Formula"], title="高斯定律积分形式", latex=r"\oint_S \mathbf{E}\cdot d\mathbf{S} = \frac{1}{\varepsilon_0}\int_V \rho \, dV", score=0.95),
            ReasoningNode(node_id="law:divergence_theorem", labels=["Law"], title="散度定理", text="体积分与曲面积分转换", score=0.9),
            ReasoningNode(node_id="formula:divergence_theorem", labels=["Formula"], title="散度定理公式", latex=r"\oint_S \mathbf{F}\cdot d\mathbf{S} = \int_V \nabla\cdot\mathbf{F}\, dV", score=0.9),
            ReasoningNode(node_id="formula:gauss_differential", labels=["Formula"], title="高斯定律微分形式", latex=r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}", score=0.98),
            ReasoningNode(node_id="condition:vacuum", labels=["Condition"], title="真空介质", text="使用真空介电常数", score=0.5),
            ReasoningNode(node_id="symmetry:spherical", labels=["Symmetry"], title="球对称", text="场量只与半径有关", score=0.4),
        ],
        edges=[
            ReasoningEdge(source="law:gauss_electric", target="formula:gauss_integral", relation="USES"),
            ReasoningEdge(source="law:gauss_electric", target="formula:gauss_differential", relation="DERIVES_TO"),
            ReasoningEdge(source="law:gauss_electric", target="law:divergence_theorem", relation="DERIVES_FROM"),
            ReasoningEdge(source="law:divergence_theorem", target="formula:divergence_theorem", relation="USES"),
            ReasoningEdge(source="law:gauss_electric", target="condition:vacuum", relation="APPLIES_WHEN"),
            ReasoningEdge(source="law:gauss_electric", target="symmetry:spherical", relation="HAS_SYMMETRY"),
        ],
    )

    frame = ProblemParser().parse("推导真空中静电场的高斯定律微分形式，并说明球对称情况下的意义")
    plan = DerivationPlanner().plan(problem_frame=frame, subgraph=subgraph)
    steps = DerivationExecutor().execute(
        problem_text="推导真空中静电场的高斯定律微分形式",
        problem_frame=frame,
        plan=plan,
        subgraph=subgraph,
    )
    steps, checks, status = DerivationVerifier().verify(problem_frame=frame, steps=steps, subgraph=subgraph)
    citations = DerivationFormatter().collect_citations(steps)
    rendered = DerivationFormatter().format(
        problem_text="推导真空中静电场的高斯定律微分形式",
        problem_frame=frame,
        steps=steps,
        checks=checks,
        citations=citations,
    )

    assert plan.steps
    assert len(steps) >= 3
    assert any("高斯定律微分形式" in step.title or "高斯定律微分形式" in step.explanation for step in steps)
    assert checks["dimension"] == "passed"
    assert checks["symmetry"] == "passed"
    assert status in {"ok", "partially_verified"}
    assert "### 推导" in rendered
    assert "### 最终结论" in rendered
