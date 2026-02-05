"""
Writing Type-Aware Prompts for AI Writing Analysis.

This module provides specialized prompts for different writing types
to enable type-aware evaluation and feedback generation.
"""

from typing import Optional


# Base system prompt for writing analysis
WRITING_ANALYSIS_SYSTEM_PROMPT = """你是一位专业的学术英文写作导师，专门为研究生提供写作指导。

你的职责是：
1. 分析学生的学术写作样本
2. 识别写作中的优点和不足
3. 提供具体、可操作的改进建议
4. 使用鼓励性的语言，帮助学生逐步提升

回复格式要求：
- 使用中文给出反馈（因为学生是中国研究生）
- 结构清晰，分点陈述
- 先肯定优点，再指出问题，最后给出建议
- 引用原文具体片段时使用引号

评估维度包括：学术语气、段落结构、逻辑连接、引用规范、词汇使用、语法准确性等。
"""

# Type-specific evaluation prompts
TYPE_PROMPTS = {
    "literature_review": {
        "name": "文献综述",
        "system_addition": """
作为文献综述的评审者，你需要特别关注：
- 文献覆盖是否全面，是否涵盖了领域内的重要研究
- 文献综合能力：是否能将多个来源的信息有机整合
- 批判性分析：是否对现有研究进行了评价，而非简单罗列
- 研究空白的识别：是否指出了现有研究的不足或空白
- 逻辑组织：是否按主题而非按文献来组织内容
""",
        "evaluation_template": """
请对以下文献综述进行评估：

---
{content}
---

请从以下维度进行分析（按重要性排序）：
1. **文献综合能力** (25%)：是否有效整合了多个来源？是否形成了连贯的叙述？
2. **批判性思维** (20%)：是否对文献进行了批判性分析？是否指出了研究局限？
3. **逻辑连接** (15%)：段落之间是否有清晰的过渡？论述是否连贯？
4. **引用规范** (15%)：引用格式是否正确？是否恰当使用了改述和直接引用？
5. **学术语气** (10%)：语言是否正式、客观？是否使用了hedging语言？
6. **段落结构** (10%)：段落是否有明确的主题句和支撑句？
7. **语法准确性** (5%)：是否有明显的语法错误？

请给出：
- 每个维度的评分（1-10分）和简要评语
- 3个主要优点
- 3个需要改进的地方（附具体建议）
- 总体评分和总结性建议
""",
    },
    
    "course_paper": {
        "name": "课程论文",
        "system_addition": """
作为课程论文的评审者，你需要特别关注：
- 论点是否清晰明确，是否有明确的thesis statement
- 论证过程是否有力，是否用证据支持观点
- 结构是否完整（引言-正文-结论）
- 段落内部的论证是否充分
- 学术规范是否得到遵守
""",
        "evaluation_template": """
请对以下课程论文进行评估：

---
{content}
---

请从以下维度进行分析（按重要性排序）：
1. **论点展开** (25%)：论点是否明确？论证是否有力？
2. **证据支持** (20%)：是否使用了充分的证据？证据是否与论点相关？
3. **段落结构** (15%)：段落组织是否清晰？是否遵循了topic-support-conclude结构？
4. **逻辑连接** (15%)：论证逻辑是否清晰？过渡是否自然？
5. **引用规范** (10%)：是否正确引用了来源？
6. **学术语气** (10%)：语言是否符合学术写作规范？
7. **语法准确性** (5%)：是否有语法错误？

请给出：
- 每个维度的评分（1-10分）和简要评语
- 3个主要优点
- 3个需要改进的地方（附具体建议）
- 总体评分和总结性建议
""",
    },
    
    "thesis": {
        "name": "学位论文",
        "system_addition": """
作为学位论文的评审者，你需要特别关注：
- 研究问题是否清晰、有价值
- 研究方法是否合理、可行
- 研究贡献是否明确
- 论文结构是否完整规范
- 学术严谨性
""",
        "evaluation_template": """
请对以下学位论文片段进行评估：

---
{content}
---

请从以下维度进行分析（按重要性排序）：
1. **研究问题** (20%)：研究问题是否清晰？是否有研究价值？
2. **研究方法** (20%)：方法描述是否清晰？方法选择是否合理？
3. **论点展开** (15%)：论证是否严谨？逻辑是否清晰？
4. **证据支持** (15%)：数据/证据是否充分？分析是否深入？
5. **批判性思维** (10%)：是否展现了对研究局限的认识？
6. **引用规范** (10%)：学术引用是否规范？
7. **学术语气** (5%)：语言是否符合学位论文要求？
8. **语法准确性** (5%)：是否有语言错误？

请给出：
- 每个维度的评分（1-10分）和简要评语
- 3个主要优点
- 3个需要改进的地方（附具体建议）
- 总体评分和针对学位论文的具体建议
""",
    },
    
    "abstract": {
        "name": "摘要",
        "system_addition": """
作为摘要的评审者，你需要特别关注：
- 是否涵盖了摘要的所有必要要素（背景、目的、方法、结果、结论）
- 语言是否简洁精炼
- 信息是否完整且突出重点
- 是否符合字数要求（通常150-300词）
- 是否使用了恰当的时态和语态
""",
        "evaluation_template": """
请对以下摘要进行评估：

---
{content}
---

请从以下维度进行分析（按重要性排序）：
1. **摘要完整性** (30%)：是否包含背景/目的/方法/结果/结论？各部分比例是否合适？
2. **逻辑连接** (20%)：信息组织是否有逻辑？过渡是否自然？
3. **学术语气** (20%)：语言是否简洁、客观、正式？
4. **词汇丰富度** (15%)：词汇使用是否准确、精炼？
5. **语法准确性** (15%)：是否有语法错误？时态使用是否正确？

请给出：
- 每个维度的评分（1-10分）和简要评语
- 2个主要优点
- 2个需要改进的地方（附具体建议）
- 修改后的示范摘要（如果需要）
- 总体评分
""",
    },
}


def get_writing_analysis_prompt(
    content: str, 
    writing_type: str = "course_paper",
    student_profile: Optional[dict] = None
) -> tuple[str, str]:
    """
    Generate system prompt and user prompt for writing analysis.
    
    Args:
        content: The writing content to analyze
        writing_type: Type of writing (literature_review, course_paper, thesis, abstract)
        student_profile: Optional student profile for personalized feedback
        
    Returns:
        Tuple of (system_prompt, user_prompt)
    """
    # Get type-specific info
    type_info = TYPE_PROMPTS.get(writing_type, TYPE_PROMPTS["course_paper"])
    
    # Build system prompt
    system_prompt = WRITING_ANALYSIS_SYSTEM_PROMPT + type_info["system_addition"]
    
    # Add personalization if profile available
    if student_profile:
        weak_points = student_profile.get("weak_points", {})
        if weak_points:
            top_weak = sorted(weak_points.items(), key=lambda x: x[1], reverse=True)[:3]
            system_prompt += f"\n\n该学生的历史薄弱点：{', '.join([w[0] for w in top_weak])}。请在这些方面给予更详细的指导。"
    
    # Build user prompt
    user_prompt = type_info["evaluation_template"].format(content=content)
    
    return system_prompt, user_prompt


def get_polish_prompt(content: str, focus_areas: list = None) -> tuple[str, str]:
    """Generate prompts for text polishing."""
    system_prompt = """你是一位专业的学术英文写作编辑，帮助学生润色学术写作。

你的任务是：
1. 保持原意的基础上改进语言表达
2. 提升学术语气和正式程度
3. 改善句子结构和多样性
4. 修正语法和用词错误

请提供：
- 润色后的文本
- 主要修改列表（每处修改解释原因）
"""
    
    focus_text = ""
    if focus_areas:
        focus_text = f"\n请特别关注以下方面：{', '.join(focus_areas)}"
    
    user_prompt = f"""请润色以下学术写作：{focus_text}

---
{content}
---

请提供润色后的版本和修改说明。
"""
    
    return system_prompt, user_prompt
