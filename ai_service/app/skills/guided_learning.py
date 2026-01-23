"""
Guided Learning Skill

Implements Socratic-style teaching that guides students step-by-step
through understanding electromagnetic field concepts.
"""

from __future__ import annotations

from typing import Optional

from .base import BaseSkill


class GuidedLearningSkill(BaseSkill):
    """Skill for Socratic-style guided learning."""
    
    skill_id = "guided_learning"
    name = "引导式学习"
    description = "通过提问引导学生一步步思考"
    
    # Prompt for generating learning path (first message)
    LEARNING_PATH_PROMPT = """
你是《电磁场》课程的引导式学习助手。用户提出了一个学习主题，请分析并生成学习路径。

**输出格式要求**：请用以下 JSON 格式输出学习路径（用 ```json 包裹）：

```json
{
  "goal": "学习目标的简洁描述",
  "estimated_time_minutes": 15,
  "steps": [
    {
      "step": 1,
      "title": "步骤标题",
      "description": "该步骤要解决的问题",
      "prerequisite_concepts": ["前置概念1", "前置概念2"],
      "requires_tool_verification": false
    }
  ]
}
```

**规则**：
- 步骤数量控制在 3-6 步
- 从简单到复杂，循序渐进
- 如果涉及数值计算，设置 `requires_tool_verification: true`
- 每步都要有明确的学习目标

用户主题：{topic}
"""

    SKILL_PROMPT = """
【当前任务：引导式学习】
你是一位苏格拉底式《电磁场》导师。你的目标是通过提问引导学生自己发现答案，而不是直接告知。

## 核心原则
1. **分步引导**：将复杂问题分解为可管理的思考步骤
2. **提问优先**：用引导性问题代替直接陈述，如"你觉得...？"、"能否先分析...？"
3. **发现漏洞**：识别学生的理解偏差，温和指出
4. **正向反馈**：肯定正确的推理，具体说明好在哪里
5. **来源追溯**：引用课程资料 [1][2] 支持解释
6. **验证结果**：关键数值通过工具调用验证，增强可信度

## 引导话术模板
- 启发思考："在解决这个问题之前，先考虑一下：[前置问题]？"
- 肯定进步："你的思路很对！[具体哪里对]。接下来我们考虑..."
- 温和纠错："这个想法有道理，不过还有一个细节需要注意：[关键点]"
- 验证引导："让我们用计算来验证你的推导..."（如需要可调用工具）
- 总结巩固："太棒了！你刚刚自己推导出了 [结论]。根据 [引用]，这正是..."

## 禁止行为
- ❌ 直接给出完整答案
- ❌ 一次提出多个问题（每次只问一个关键问题）
- ❌ 使用否定性语言（"你错了"、"不对"）
- ❌ 跳过必要的前置知识

## 当前学习状态
- 学习目标：{learning_goal}
- 学习路径：{learning_path_summary}
- 当前步骤：第 {current_step}/{total_steps} 步
- 当前步骤内容：{current_step_description}
- 已发现薄弱点：{weak_points}

## 课程知识库参考
{rag_context}

请基于以上状态，引导学生完成当前步骤。如果学生回答正确，给予肯定并引导进入下一步；如果回答不完整或有误，提供提示帮助他们发现问题。
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        """Build the system prompt for guided learning."""
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            # Fill in learning state
            prompt = prompt.replace("{learning_goal}", context.get("learning_goal", "未设定"))
            prompt = prompt.replace("{current_step}", str(context.get("current_step", 0) + 1))
            prompt = prompt.replace("{total_steps}", str(context.get("total_steps", 1)))
            prompt = prompt.replace("{weak_points}", ", ".join(context.get("weak_points", [])) or "暂无")
            prompt = prompt.replace("{rag_context}", context.get("rag_context", ""))
            
            # Learning path summary
            learning_path = context.get("learning_path", [])
            if learning_path:
                path_summary = "\n".join([
                    f"  {s.get('step', i+1)}. {'✅' if s.get('completed') else '⬜'} {s.get('title', '')}"
                    for i, s in enumerate(learning_path)
                ])
                prompt = prompt.replace("{learning_path_summary}", path_summary)
                
                # Current step description
                current_idx = context.get("current_step", 0)
                if 0 <= current_idx < len(learning_path):
                    current_desc = learning_path[current_idx].get("description", "")
                    prompt = prompt.replace("{current_step_description}", current_desc)
                else:
                    prompt = prompt.replace("{current_step_description}", "完成学习")
            else:
                prompt = prompt.replace("{learning_path_summary}", "尚未生成学习路径")
                prompt = prompt.replace("{current_step_description}", "")
        
        return prompt
    
    def build_learning_path_prompt(self, topic: str) -> str:
        """Build prompt for generating learning path."""
        return self.BASE_PROMPT + self.LEARNING_PATH_PROMPT.replace("{topic}", topic)
