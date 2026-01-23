"""
Writing Concepts for Professional English Writing Course

This module replaces the EM_CONCEPTS from weak_point_detector.py with 
writing-related concepts for the student-centric Professional English Writing course.
"""

# Writing concepts for weak point detection
WRITING_CONCEPTS = {
    # Academic Tone & Style
    "学术语气": ["academic tone", "formal", "objective", "impersonal", "hedging", "cautious language"],
    "被动语态": ["passive voice", "被动", "is done", "was conducted", "has been shown"],
    "正式词汇": ["formal vocabulary", "academic vocabulary", "Latinate words", "avoid contractions"],
    
    # Structure & Organization  
    "段落结构": ["paragraph structure", "topic sentence", "supporting sentences", "concluding sentence", "unity"],
    "逻辑连接": ["logical connection", "transition words", "coherence", "cohesion", "flow", "therefore", "however", "moreover"],
    "论点展开": ["argument development", "thesis statement", "claim", "evidence", "analysis", "reasoning"],
    
    # Citation & References
    "引用规范": ["citation", "reference", "APA", "MLA", "IEEE", "in-text citation", "bibliography"],
    "文献综合": ["synthesis", "literature review", "compare sources", "integrate sources", "critical analysis"],
    "学术诚信": ["academic integrity", "plagiarism", "paraphrase", "quotation", "attribution"],
    
    # Content & Argumentation
    "批判性思维": ["critical thinking", "critical analysis", "evaluate", "assess", "critique", "limitation"],
    "研究问题": ["research question", "research gap", "contribution", "significance", "rationale"],
    "证据支持": ["evidence", "support", "data", "examples", "illustration", "empirical"],
    
    # Language Accuracy
    "语法准确性": ["grammar", "grammatical", "syntax", "sentence structure", "agreement"],
    "词汇丰富度": ["vocabulary richness", "lexical diversity", "word choice", "precise language"],
    "句式多样性": ["sentence variety", "complex sentences", "compound sentences", "sentence length"],
    
    # Writing Types
    "综述写作": ["literature review", "review paper", "survey", "synthesize", "summarize field"],
    "论文摘要": ["abstract", "summary", "purpose", "methods", "results", "conclusions"],
    "研究方法": ["methodology", "research design", "data collection", "analysis method", "validity"],
}

# Writing types with their evaluation criteria
WRITING_TYPES = {
    "literature_review": {
        "name": "文献综述",
        "key_criteria": ["文献综合", "批判性思维", "逻辑连接", "引用规范", "综述写作"],
        "weights": {
            "文献综合": 0.25,
            "批判性思维": 0.20,
            "逻辑连接": 0.15,
            "引用规范": 0.15,
            "学术语气": 0.10,
            "段落结构": 0.10,
            "语法准确性": 0.05,
        },
    },
    "course_paper": {
        "name": "课程论文",
        "key_criteria": ["论点展开", "证据支持", "段落结构", "引用规范", "学术语气"],
        "weights": {
            "论点展开": 0.25,
            "证据支持": 0.20,
            "段落结构": 0.15,
            "逻辑连接": 0.15,
            "引用规范": 0.10,
            "学术语气": 0.10,
            "语法准确性": 0.05,
        },
    },
    "thesis": {
        "name": "学位论文",
        "key_criteria": ["研究问题", "研究方法", "批判性思维", "论点展开", "学术语气"],
        "weights": {
            "研究问题": 0.20,
            "研究方法": 0.20,
            "论点展开": 0.15,
            "证据支持": 0.15,
            "批判性思维": 0.10,
            "引用规范": 0.10,
            "学术语气": 0.05,
            "语法准确性": 0.05,
        },
    },
    "abstract": {
        "name": "摘要",
        "key_criteria": ["论文摘要", "逻辑连接", "学术语气", "词汇丰富度"],
        "weights": {
            "论文摘要": 0.30,
            "逻辑连接": 0.20,
            "学术语气": 0.20,
            "词汇丰富度": 0.15,
            "语法准确性": 0.15,
        },
    },
}

# Negative indicators for weak point detection
NEGATIVE_INDICATORS = [
    "不够",
    "缺乏",
    "问题",
    "错误",
    "需要改进",
    "不恰当",
    "不合适",
    "混乱",
    "unclear",
    "lacks",
    "missing",
    "incorrect",
    "needs improvement",
    "should be",
    "try to",
    "consider",
    "avoid",
]

# Positive indicators
POSITIVE_INDICATORS = [
    "很好",
    "准确",
    "恰当",
    "清晰",
    "excellent",
    "well-written",
    "clear",
    "appropriate",
    "effective",
    "correct",
]


def get_writing_type_info(writing_type: str) -> dict:
    """Get information about a specific writing type."""
    return WRITING_TYPES.get(writing_type, WRITING_TYPES["course_paper"])


def get_evaluation_weights(writing_type: str) -> dict:
    """Get evaluation weights for a specific writing type."""
    type_info = get_writing_type_info(writing_type)
    return type_info.get("weights", {})


def detect_writing_concepts(text: str) -> list:
    """Detect which writing concepts are mentioned in the text."""
    text_lower = text.lower()
    detected = []
    
    for concept, keywords in WRITING_CONCEPTS.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                detected.append(concept)
                break
    
    return list(set(detected))
