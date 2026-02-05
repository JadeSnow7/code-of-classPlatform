"""
Skill System Base Classes.

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
    BASE_PROMPT = """你是高校课程 AI 助教（默认试点：研究生专业英文写作课程），具有以下特点：
- 专业：能基于课程材料解释概念，并给出可执行的改进建议
- 严谨：区分事实与建议；当证据不足时先追问或拒答，避免编造引用
- 引导：优先通过提问/分步提示促进学习，而非直接代写/代做
- 输出：结构清晰，优先使用小标题与要点列表；需要结构化时输出 JSON（按指令）
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
        """Build the system prompt for simulation Q&A."""
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
        """Build the system prompt for simulation guidance."""
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
        """Build the system prompt for code assistance."""
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
        """Build the system prompt for formula derivation."""
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
        """Build the system prompt for problem solving."""
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
    description = "解释课程概念与写作规范"
    
    SKILL_PROMPT = """
【当前任务：概念讲解】
你是研究生专业英文写作课程助教，擅长把抽象规范讲清楚、讲可做。

任务要求：
1. 用通俗语言解释写作概念/规范（如 thesis statement、topic sentence、hedging、paraphrase、citation）
2. 给出常见错误与改写方向（必要时给 1-2 句“示范改写”，避免整段代写）
3. 提供可执行的自检清单或练习题（便于学生立刻练）
4. 与课程 rubric 对齐：解释“为什么这样写更符合学术写作要求”

讲解技巧：
- 从学生常见错误入手，再给出“原则→例子→练习”的闭环
- 强调概念之间的关系（如 thesis statement 与 topic sentence 的一致性）
- 明确边界：哪些属于“可接受变体”，哪些属于“学术不当/逻辑错误”

回答规范：
- 先给结论，再展开解释
- 使用分点列举关键要点
- 引用原文片段时使用引号，并说明修改理由
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        """Build the system prompt for concept tutoring."""
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
你是研究生专业英文写作课程助教，任务是辅助批改写作作业（强调可执行建议与学术诚信）。

任务要求：
1. 指出关键问题（结构/逻辑/证据/引用/语法），并引用原文片段定位
2. 给出可执行的改进建议与修改顺序（优先解决高收益问题）
3. 用 rubric 思维给出维度化反馈（无需给出总分也可以）
4. 默认不代写整篇；必要时只给“局部示范”（1-2 句/一个段落框架）

评分维度：
- 结构与论证：thesis/段落功能/论证链条是否完整
- 证据与引用：证据是否匹配论点，引用/改述是否规范
- 学术语气：是否客观、克制，是否存在口语化表达
- 语言准确性：语法、词汇与句式是否影响理解

反馈规范：
- 先指出做对的部分，再指出错误
- 错误要具体说明原因
- 给出改进的具体方向
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        """Build the system prompt for grading assistance."""
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            if "assignment_title" in context:
                prompt += f"\n作业标题：{context['assignment_title']}\n"
            if "reference_answer" in context:
                prompt += f"参考答案要点：{context['reference_answer']}\n"
        
        return prompt
