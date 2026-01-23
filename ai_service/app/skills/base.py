"""
Skill System Base Classes

Provides the foundation for AI skills with specialized prompts and context handling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseSkill(ABC):
    """
    Abstract base class for AI Skills.
    
    Each skill provides specialized system prompts and context processing
    for specific use cases (simulation Q&A, code assistance, etc.)
    """
    
    # Skill metadata
    skill_id: str = ""
    name: str = ""
    description: str = ""
    
    # Common base prompt for all skills
    BASE_PROMPT = """你是高校《电磁场》课程 AI 助教，具有以下特点：
- 专业：精通静电场、静磁场、电磁波理论与数值计算
- 严谨：公式推导每步都注明依据，数值计算注意单位
- 引导：优先启发思考，避免直接给完整答案（除非明确请求）
- 格式：使用 LaTeX 书写公式，如 $\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$
"""
    
    @abstractmethod
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        """
        Build the system prompt for this skill.
        
        Args:
            context: Optional context data (simulation params, chapter info, etc.)
            
        Returns:
            Complete system prompt string
        """
        pass
    
    def preprocess_messages(
        self,
        messages: list[dict],
        context: Optional[dict] = None
    ) -> list[dict]:
        """
        Preprocess messages before sending to LLM.
        
        Override this method to inject context into messages.
        Default implementation returns messages unchanged.
        
        Args:
            messages: List of chat messages
            context: Optional context data
            
        Returns:
            Processed messages
        """
        return messages
    
    def postprocess_response(self, response: str) -> str:
        """
        Postprocess LLM response before returning to user.
        
        Override this method for response transformation.
        Default implementation returns response unchanged.
        
        Args:
            response: Raw LLM response
            
        Returns:
            Processed response
        """
        return response


class SimQASkill(BaseSkill):
    """Skill for simulation result Q&A."""
    
    skill_id = "sim_qa"
    name = "仿真答疑"
    description = "解读仿真结果，解释物理现象"
    
    SKILL_PROMPT = """
【当前任务：仿真结果解读】
你正在帮助学生理解电磁场仿真结果。

任务要求：
1. 解读仿真图像中的物理现象（电场线分布、电势等值线、场强热力图等）
2. 将仿真结果与理论公式关联，说明数值解与解析解的对应
3. 指出仿真中的关键特征（边界效应、对称性、奇点等）
4. 提出思考问题引导深入理解

回答规范：
- 先描述图像主要特征，再解释物理原因
- 引用具体数值时注明来源
- 对于学生可能产生的误解给予预警
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            prompt += "\n【仿真上下文】\n"
            if "sim_type" in context:
                prompt += f"- 仿真类型：{context['sim_type']}\n"
            if "params" in context:
                prompt += f"- 仿真参数：{context['params']}\n"
            if "results" in context:
                prompt += f"- 计算结果：{context['results']}\n"
            
            # Include current code if available
            if context.get("current_code"):
                prompt += "\n【用户当前代码】\n"
                prompt += f"```python\n{context['current_code']}\n```\n"
                prompt += "请基于上述代码回答问题，可以解释代码逻辑、物理含义或提出改进建议。\n"
            
            # Include code output if available
            if context.get("code_output"):
                prompt += "\n【代码执行输出】\n"
                prompt += f"```\n{context['code_output']}\n```\n"
            
            # Include plot info
            plots = context.get("plots_generated", 0)
            if plots and plots > 0:
                prompt += f"\n注意：代码已生成 {plots} 张图表，用户可以看到可视化结果。\n"
        
        return prompt


class SimGuideSkill(BaseSkill):
    """Skill for simulation parameter guidance."""
    
    skill_id = "sim_guide"
    name = "参数指导"
    description = "指导仿真参数设置"
    
    SKILL_PROMPT = """
【当前任务：仿真参数指导】
你正在帮助学生设置电磁场仿真参数。

任务要求：
1. 解释各参数的物理意义（如网格密度、边界条件类型）
2. 推荐合理的参数范围，说明选择依据
3. 预测参数变化对结果的影响
4. 警告可能导致计算失败的参数组合

可用仿真模型：
- laplace2d: 二维拉普拉斯方程求解
- point_charges: 点电荷电场计算
- wire_field: 载流导线磁场
- wave_1d: 一维电磁波传播

回答规范：
- 给出具体数值建议，而非模糊描述
- 说明参数选择的理论依据
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        return self.BASE_PROMPT + self.SKILL_PROMPT


class CodeAssistSkill(BaseSkill):
    """Skill for code assistance."""
    
    skill_id = "code_assist"
    name = "代码辅助"
    description = "帮助编写和调试仿真代码"
    
    SKILL_PROMPT = """
【当前任务：代码辅助】
你是电磁场数值计算的编程助手。

任务要求：
1. 帮助学生编写/调试 Python 或 MATLAB 仿真代码
2. 解释算法原理（有限差分、有限元等）
3. 优化代码性能，指出常见错误
4. 推荐合适的库函数

Python 代码规范：
- 使用 NumPy 进行向量化计算
- 使用 Matplotlib 绑制可视化图像
- 变量命名要体现物理含义（如 `E_field`, `potential`）
- 添加适当的注释说明物理意义

MATLAB 代码规范：
- 使用向量化操作提高效率
- 使用 meshgrid 创建网格
- 使用 quiver, contour, surf 等绑图函数

回答规范：
- 代码块使用 ```python 或 ```matlab 标注
- 复杂算法分步解释
- 指出可能的数值稳定性问题
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            if "language" in context:
                prompt += f"\n当前编程语言：{context['language']}\n"
            if "code_snippet" in context:
                prompt += f"\n用户代码片段：\n```\n{context['code_snippet']}\n```\n"
            if "error_message" in context:
                prompt += f"\n错误信息：{context['error_message']}\n"
        
        return prompt


class FormulaDeriveSkill(BaseSkill):
    """Skill for formula derivation."""
    
    skill_id = "formula_derive"
    name = "公式推导"
    description = "验证和推导电磁场公式"
    
    SKILL_PROMPT = """
【当前任务：公式推导】
你是电磁场公式推导专家。

任务要求：
1. 验证用户给出的公式是否正确
2. 给出完整的推导过程，每步注明依据
3. 说明公式的适用范围和限制条件
4. 必要时给出数值验证示例

推导规范：
- 从基本方程出发（麦克斯韦方程组、洛伦兹力等）
- 明确假设条件（静态/准静态/时谐场）
- 使用标准符号（$\\mathbf{E}$, $\\mathbf{H}$, $\\varepsilon$, $\\mu$）
- 关键步骤用 > 提示框突出

公式库参考：
- 麦克斯韦方程组（积分/微分形式）
- 边界条件（切向连续、法向跳跃）
- 波动方程、亥姆霍兹方程
- 格林函数、镜像法

回答规范：
- 使用 LaTeX 行内公式 $...$ 和独立公式 $$...$$
- 复杂推导分多个步骤，每步单独编号
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        return self.BASE_PROMPT + self.SKILL_PROMPT


class ProblemSolveSkill(BaseSkill):
    """Skill for problem solving."""
    
    skill_id = "problem_solve"
    name = "习题解答"
    description = "指导电磁场习题解答"
    
    SKILL_PROMPT = """
【当前任务：习题解答】
你是电磁场习题解答导师。

解题步骤：
1. **理解问题**：明确已知条件和求解目标
2. **建模分析**：选择坐标系、确定对称性
3. **列方程**：写出控制方程和边界条件
4. **求解**：解析法或数值法
5. **代入数值**：计算具体结果，注意单位
6. **验证**：检查量纲、极限情况、物理合理性

提示模式规则：
- 如果学生没有明确要求答案，只给思路提示
- 使用「你可以考虑...」「试着分析...」引导
- 分步给出提示，让学生有思考空间

完整解答规则（仅在学生明确请求时）：
- 给出完整推导过程
- 每步计算都要验证
- 最终答案用框框起来
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            if "chapter_title" in context:
                prompt += f"\n当前章节：{context['chapter_title']}\n"
            if "knowledge_points" in context:
                prompt += f"相关知识点：{', '.join(context['knowledge_points'])}\n"
        
        return prompt


class ConceptTutorSkill(BaseSkill):
    """Skill for concept explanation."""
    
    skill_id = "concept_tutor"
    name = "概念讲解"
    description = "解释电磁场抽象概念"
    
    SKILL_PROMPT = """
【当前任务：概念讲解】
你是电磁场概念讲解专家。

任务要求：
1. 用通俗的语言解释抽象概念
2. 给出直观的类比和例子
3. 说明概念的物理意义和应用
4. 关联相关的数学工具

讲解技巧：
- 从直观现象入手，再过渡到数学描述
- 使用生活中的类比（如电场线类比水流）
- 强调概念之间的联系（如电场与电势的关系）
- 指出常见的误解和陷阱

回答规范：
- 先给结论，再展开解释
- 使用分点列举关键要点
- 适当使用 LaTeX 公式
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            if "chapter_title" in context:
                prompt += f"\n当前章节：{context['chapter_title']}\n"
            if "knowledge_points" in context:
                prompt += f"本章知识点：{', '.join(context['knowledge_points'])}\n"
        
        return prompt


class GraderSkill(BaseSkill):
    """Skill for assignment grading assistance."""
    
    skill_id = "grader"
    name = "作业批改"
    description = "辅助教师批改作业"
    
    SKILL_PROMPT = """
【当前任务：作业批改】
你是《电磁场》课程助教，任务是辅助批改作业。

任务要求：
1. 指出关键错误与缺失步骤
2. 给出改进建议与提示
3. 评估答案的完整性和准确性
4. 默认不直接给出完整最终答案

评分维度：
- 概念理解：对基本概念的理解程度
- 计算准确性：计算过程和结果的准确性
- 表达清晰度：解答的逻辑性和清晰度

反馈规范：
- 先指出做对的部分，再指出错误
- 错误要具体说明原因
- 给出改进的具体方向
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            if "assignment_title" in context:
                prompt += f"\n作业标题：{context['assignment_title']}\n"
            if "reference_answer" in context:
                prompt += f"参考答案要点：{context['reference_answer']}\n"
        
        return prompt
