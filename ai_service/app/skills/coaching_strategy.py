"""
Coaching Strategy Skill

Generates personalized tutoring strategies based on student learning profiles,
including targeted exercises for weak points and recommended learning paths.
"""

from __future__ import annotations

from typing import Optional

from .base import BaseSkill


class CoachingStrategySkill(BaseSkill):
    """Skill for generating personalized coaching strategies."""
    
    skill_id = "coaching_strategy"
    name = "个性化辅导策略"
    description = "基于学习档案生成针对性辅导建议"
    
    SKILL_PROMPT = """
【当前任务：个性化辅导策略生成】

你是一位经验丰富的《电磁场》课程辅导教师。请基于学生的学习档案，生成个性化的辅导策略。

## 学生学习档案
- 学生 ID：{student_id}
- 已完成主题：{completed_topics}
- 已发现薄弱点：{weak_points}
- 累计学习时长：{study_minutes} 分钟
- 总学习会话数：{session_count} 次

## 任务要求

请生成一份个性化辅导策略，包含以下部分：

### 1. 学习状态诊断
分析学生当前的学习状态，指出主要问题和进步之处。

### 2. 薄弱点专项辅导
针对每个薄弱点：
- 概念澄清：简洁解释关键概念
- 典型例题：1-2 道针对性练习题
- 学习建议：具体的复习方法

### 3. 下一步学习建议
推荐接下来应该学习的 2-3 个主题，并说明理由。

### 4. 学习计划
制定一个简短的学习计划（时间跨度 1-2 周）。

## 输出格式

请用以下 JSON 格式输出策略（用 ```json 包裹）：

```json
{
  "diagnosis": "学习状态诊断文本",
  "weak_point_remediation": [
    {
      "concept": "薄弱点名称",
      "clarification": "概念澄清",
      "exercises": ["练习题1", "练习题2"],
      "tips": "学习建议"
    }
  ],
  "recommended_topics": [
    {
      "topic": "推荐主题",
      "reason": "推荐理由",
      "priority": 1
    }
  ],
  "study_plan": {
    "duration_days": 7,
    "milestones": ["Day 1-2: ...", "Day 3-5: ...", "Day 6-7: ..."]
  }
}
```
"""
    
    ANALYSIS_PROMPT = """
【当前任务：学习进展分析】

你是一位教育分析专家。请基于学生的学习数据，生成简洁的学习进展报告。

## 学生数据
- 薄弱点统计：{weak_points}
- 会话记录：{session_summary}

## 任务

1. 总结学生的学习强项和弱项
2. 分析学习趋势（进步还是停滞）
3. 给出 1-2 条核心建议

请用简洁的自然语言回答，不超过 200 字。
"""
    
    def build_system_prompt(self, context: Optional[dict] = None) -> str:
        """Build the system prompt for coaching strategy generation."""
        prompt = self.BASE_PROMPT + self.SKILL_PROMPT
        
        if context:
            # Fill in student profile data
            prompt = prompt.replace("{student_id}", str(context.get("student_id", "未知")))
            
            completed = context.get("completed_topics", [])
            if completed:
                prompt = prompt.replace("{completed_topics}", "、".join(completed))
            else:
                prompt = prompt.replace("{completed_topics}", "暂无")
            
            weak_points = context.get("weak_points", {})
            if weak_points:
                weak_str = "、".join([f"{k}({v}次)" for k, v in weak_points.items()])
                prompt = prompt.replace("{weak_points}", weak_str)
            else:
                prompt = prompt.replace("{weak_points}", "暂无")
            
            prompt = prompt.replace("{study_minutes}", str(context.get("study_minutes", 0)))
            prompt = prompt.replace("{session_count}", str(context.get("session_count", 0)))
        
        return prompt
    
    def build_analysis_prompt(self, context: Optional[dict] = None) -> str:
        """Build prompt for progress analysis."""
        prompt = self.BASE_PROMPT + self.ANALYSIS_PROMPT
        
        if context:
            weak_points = context.get("weak_points", {})
            if weak_points:
                weak_str = ", ".join([f"{k}: {v}次" for k, v in weak_points.items()])
                prompt = prompt.replace("{weak_points}", weak_str)
            else:
                prompt = prompt.replace("{weak_points}", "暂无记录")
            
            session_summary = context.get("session_summary", "暂无详细记录")
            prompt = prompt.replace("{session_summary}", session_summary)
        
        return prompt
