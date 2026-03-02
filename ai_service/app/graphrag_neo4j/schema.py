"""Schema constants and content mapping helpers for Neo4j GraphRAG."""

from __future__ import annotations

import hashlib
import re
from typing import Any

from app.graphrag_neo4j.types import GraphNodePayload, GraphRelationshipPayload

VECTOR_INDEXES: dict[str, tuple[str, str]] = {
    "textchunk_embedding_idx": ("TextChunk", "embedding"),
    "formula_embedding_idx": ("Formula", "embedding"),
    "workedexample_embedding_idx": ("WorkedExample", "embedding"),
    "problem_embedding_idx": ("Problem", "embedding"),
}

FULLTEXT_INDEXES: dict[str, tuple[str, list[str]]] = {
    "concept_fulltext_idx": ("Concept", ["title"]),
    "law_fulltext_idx": ("Law", ["title"]),
    "formula_fulltext_idx": ("Formula", ["title", "latex", "keywords"]),
    "condition_fulltext_idx": ("Condition", ["title"]),
    "boundary_condition_fulltext_idx": ("BoundaryCondition", ["title"]),
}

ALLOWED_RELATIONSHIPS = [
    "CONTAINS",
    "COVERS",
    "USES",
    "DERIVES_FROM",
    "DERIVES_TO",
    "APPLIES_WHEN",
    "REQUIRES",
    "HAS_BOUNDARY",
    "HAS_SYMMETRY",
    "HAS_VARIABLE",
    "EXPLAINS",
    "SIMILAR_TO",
    "SUPPORTED_BY",
    "PART_OF",
]

ALLOWED_LABELS = {
    "KnowledgeNode",
    "Course",
    "Chapter",
    "Resource",
    "Problem",
    "WorkedExample",
    "Concept",
    "Law",
    "Formula",
    "Condition",
    "BoundaryCondition",
    "Symmetry",
    "Variable",
    "DerivationStep",
    "TextChunk",
}

DOMAIN_NODES: list[GraphNodePayload] = [
    GraphNodePayload(
        node_id="law:gauss_electric",
        label="Law",
        properties={
            "id": "law:gauss_electric",
            "title": "高斯定律",
            "text": "高斯定律给出闭合曲面电通量与包围电荷之间的关系。",
            "keywords": "高斯定律 电通量 积分形式 微分形式",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "law:gauss_electric",
        },
    ),
    GraphNodePayload(
        node_id="law:divergence_theorem",
        label="Law",
        properties={
            "id": "law:divergence_theorem",
            "title": "散度定理",
            "text": "散度定理把向量场的体积分与曲面积分联系起来，是积分形式与微分形式之间的桥梁。",
            "keywords": "散度定理 高斯公式 体积分 曲面积分",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "law:divergence_theorem",
        },
    ),
    GraphNodePayload(
        node_id="law:coulomb",
        label="Law",
        properties={
            "id": "law:coulomb",
            "title": "库仑定律",
            "text": "库仑定律描述静止点电荷之间的相互作用，是静电场计算的重要起点。",
            "keywords": "库仑定律 点电荷 静电场",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "law:coulomb",
        },
    ),
    GraphNodePayload(
        node_id="formula:gauss_integral",
        label="Formula",
        properties={
            "id": "formula:gauss_integral",
            "title": "高斯定律积分形式",
            "text": "闭合曲面电通量等于包围电荷除以真空介电常数。",
            "latex": r"\oint_S \mathbf{E}\cdot d\mathbf{S} = \frac{Q_{\mathrm{enc}}}{\varepsilon_0}",
            "keywords": "高斯定律 积分形式 电通量 Qenc eps0",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:gauss_integral",
        },
    ),
    GraphNodePayload(
        node_id="formula:gauss_differential",
        label="Formula",
        properties={
            "id": "formula:gauss_differential",
            "title": "高斯定律微分形式",
            "text": "电场散度等于电荷密度除以真空介电常数。",
            "latex": r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}",
            "keywords": "高斯定律 微分形式 散度 rho eps0",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:gauss_differential",
        },
    ),
    GraphNodePayload(
        node_id="formula:divergence_theorem",
        label="Formula",
        properties={
            "id": "formula:divergence_theorem",
            "title": "散度定理公式",
            "text": "将矢量场散度的体积分转化为边界曲面的通量积分。",
            "latex": r"\oint_S \mathbf{F}\cdot d\mathbf{S} = \int_V \nabla \cdot \mathbf{F}\, dV",
            "keywords": "散度定理 体积分 曲面积分 通量",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:divergence_theorem",
        },
    ),
    GraphNodePayload(
        node_id="formula:coulomb",
        label="Formula",
        properties={
            "id": "formula:coulomb",
            "title": "库仑定律公式",
            "text": "点电荷在真空中的电场或作用力满足平方反比规律。",
            "latex": r"\mathbf{E} = \frac{1}{4\pi\varepsilon_0}\frac{q}{r^2}\hat{\mathbf{r}}",
            "keywords": "库仑定律 电场 点电荷 反平方",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:coulomb",
        },
    ),
    GraphNodePayload(
        node_id="formula:poisson",
        label="Formula",
        properties={
            "id": "formula:poisson",
            "title": "泊松方程",
            "text": "在静电场中，电势满足泊松方程。",
            "latex": r"\nabla^2 \varphi = -\frac{\rho}{\varepsilon}",
            "keywords": "泊松方程 电势 rho epsilon",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:poisson",
        },
    ),
    GraphNodePayload(
        node_id="formula:laplace",
        label="Formula",
        properties={
            "id": "formula:laplace",
            "title": "拉普拉斯方程",
            "text": "无源区域内电势满足拉普拉斯方程。",
            "latex": r"\nabla^2 \varphi = 0",
            "keywords": "拉普拉斯方程 无源区域 电势",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "formula:laplace",
        },
    ),
    GraphNodePayload(
        node_id="condition:electrostatic",
        label="Condition",
        properties={
            "id": "condition:electrostatic",
            "title": "静电场",
            "text": "电荷分布不随时间变化，磁感应强度时间导数可忽略。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "condition:electrostatic",
        },
    ),
    GraphNodePayload(
        node_id="condition:vacuum",
        label="Condition",
        properties={
            "id": "condition:vacuum",
            "title": "真空介质",
            "text": "介质参数取真空介电常数与真空磁导率。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "condition:vacuum",
        },
    ),
    GraphNodePayload(
        node_id="boundary:conductor_surface",
        label="BoundaryCondition",
        properties={
            "id": "boundary:conductor_surface",
            "title": "导体表面边界条件",
            "text": "静电平衡时导体内部电场为零，表面切向电场为零。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "boundary:conductor_surface",
        },
    ),
    GraphNodePayload(
        node_id="symmetry:spherical",
        label="Symmetry",
        properties={
            "id": "symmetry:spherical",
            "title": "球对称",
            "text": "场量只与径向距离有关，方向沿径向。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "symmetry:spherical",
        },
    ),
    GraphNodePayload(
        node_id="symmetry:cylindrical",
        label="Symmetry",
        properties={
            "id": "symmetry:cylindrical",
            "title": "柱对称",
            "text": "场量只与径向距离有关，并绕轴保持不变。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "symmetry:cylindrical",
        },
    ),
    GraphNodePayload(
        node_id="symmetry:planar",
        label="Symmetry",
        properties={
            "id": "symmetry:planar",
            "title": "平面对称",
            "text": "场量沿垂直平面方向变化，其余方向保持不变。",
            "course_id": "global",
            "visibility": "student_public",
            "source_type": "catalog",
            "source_id": "symmetry:planar",
        },
    ),
]

DOMAIN_RELATIONSHIPS: list[GraphRelationshipPayload] = [
    GraphRelationshipPayload(source="law:gauss_electric", target="formula:gauss_integral", relation="USES"),
    GraphRelationshipPayload(source="law:gauss_electric", target="formula:gauss_differential", relation="DERIVES_TO"),
    GraphRelationshipPayload(source="law:gauss_electric", target="law:divergence_theorem", relation="DERIVES_FROM"),
    GraphRelationshipPayload(source="law:divergence_theorem", target="formula:divergence_theorem", relation="USES"),
    GraphRelationshipPayload(source="law:gauss_electric", target="condition:electrostatic", relation="APPLIES_WHEN"),
    GraphRelationshipPayload(source="law:gauss_electric", target="condition:vacuum", relation="APPLIES_WHEN"),
    GraphRelationshipPayload(source="law:gauss_electric", target="symmetry:spherical", relation="HAS_SYMMETRY"),
    GraphRelationshipPayload(source="law:gauss_electric", target="symmetry:cylindrical", relation="HAS_SYMMETRY"),
    GraphRelationshipPayload(source="law:gauss_electric", target="symmetry:planar", relation="HAS_SYMMETRY"),
    GraphRelationshipPayload(source="formula:poisson", target="formula:gauss_differential", relation="DERIVES_FROM"),
    GraphRelationshipPayload(source="formula:laplace", target="formula:poisson", relation="DERIVES_FROM"),
    GraphRelationshipPayload(source="boundary:conductor_surface", target="condition:electrostatic", relation="APPLIES_WHEN"),
]

MENTION_RULES: dict[str, list[str]] = {
    "高斯定律": ["law:gauss_electric", "formula:gauss_integral", "formula:gauss_differential"],
    "散度定理": ["law:divergence_theorem", "formula:divergence_theorem"],
    "库仑定律": ["law:coulomb", "formula:coulomb"],
    "泊松方程": ["formula:poisson"],
    "拉普拉斯方程": ["formula:laplace"],
    "静电": ["condition:electrostatic"],
    "真空": ["condition:vacuum"],
    "导体表面": ["boundary:conductor_surface"],
    "边界条件": ["boundary:conductor_surface"],
    "球对称": ["symmetry:spherical"],
    "柱对称": ["symmetry:cylindrical"],
    "平面对称": ["symmetry:planar"],
}

FORMULA_PATTERN = re.compile(r"\${1,2}([^$]+)\${1,2}")


def safe_identifier(raw: str) -> str:
    if raw not in ALLOWED_LABELS and raw not in ALLOWED_RELATIONSHIPS and raw not in VECTOR_INDEXES and raw not in FULLTEXT_INDEXES:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", raw):
            raise ValueError(f"unsafe identifier: {raw}")
    return raw


def hash_suffix(raw: str) -> str:
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:10]


def split_text_chunks(text: str, max_chars: int = 380) -> list[str]:
    normalized = re.sub(r"\s+", " ", (text or "")).strip()
    if not normalized:
        return []
    sentences = re.split(r"(?<=[。！？.!?])\s+", normalized)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        current = sentence
    if current:
        chunks.append(current)
    return chunks or [normalized[:max_chars]]


def extract_formula_snippets(text: str) -> list[str]:
    return [snippet.strip() for snippet in FORMULA_PATTERN.findall(text or "") if snippet.strip()]


def match_catalog_nodes(text: str) -> list[str]:
    hits: list[str] = []
    haystack = (text or "").strip()
    if not haystack:
        return hits
    for keyword, node_ids in MENTION_RULES.items():
        if keyword in haystack:
            hits.extend(node_ids)
    deduped: list[str] = []
    seen: set[str] = set()
    for node_id in hits:
        if node_id in seen:
            continue
        seen.add(node_id)
        deduped.append(node_id)
    return deduped


def node_relation_for_label(label: str) -> str:
    if label == "Law":
        return "COVERS"
    if label == "Formula":
        return "USES"
    if label == "Condition":
        return "REQUIRES"
    if label == "BoundaryCondition":
        return "HAS_BOUNDARY"
    if label == "Symmetry":
        return "HAS_SYMMETRY"
    return "COVERS"


def infer_source_label(kind: str, title: str, content: str, metadata: dict[str, Any]) -> str:
    if kind in {"assignment", "quiz_question"}:
        return "Problem"
    if kind == "resource":
        blob = " ".join([title or "", content or "", str(metadata.get("type", ""))]).lower()
        if any(token in blob for token in ("例题", "解析", "worked_example", "solution")):
            return "WorkedExample"
        return "Resource"
    if kind == "chapter":
        return "Chapter"
    return "TextChunk"


def build_source_specific_concepts(source_doc_id: str, title: str, metadata: dict[str, Any], course_id: str, visibility: str) -> list[GraphNodePayload]:
    knowledge_points = metadata.get("knowledge_points") or []
    if not isinstance(knowledge_points, list):
        knowledge_points = []
    concepts: list[GraphNodePayload] = []
    for point in knowledge_points:
        point_text = str(point).strip()
        if not point_text:
            continue
        concepts.append(
            GraphNodePayload(
                node_id=f"{source_doc_id}:concept:{hash_suffix(point_text)}",
                label="Concept",
                properties={
                    "id": f"{source_doc_id}:concept:{hash_suffix(point_text)}",
                    "title": point_text,
                    "text": point_text,
                    "course_id": course_id,
                    "visibility": visibility,
                    "source_type": "derived_concept",
                    "source_id": source_doc_id,
                    "source_doc_id": source_doc_id,
                },
            )
        )
    if not concepts and title:
        concepts.append(
            GraphNodePayload(
                node_id=f"{source_doc_id}:concept:title",
                label="Concept",
                properties={
                    "id": f"{source_doc_id}:concept:title",
                    "title": title,
                    "text": title,
                    "course_id": course_id,
                    "visibility": visibility,
                    "source_type": "derived_concept",
                    "source_id": source_doc_id,
                    "source_doc_id": source_doc_id,
                },
            )
        )
    return concepts
