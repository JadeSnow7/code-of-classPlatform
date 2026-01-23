"""
Skill Registry

Central registry for all available AI skills.
"""

from __future__ import annotations

from typing import Optional

from app.skills.base import (
    BaseSkill,
    SimQASkill,
    SimGuideSkill,
    CodeAssistSkill,
    FormulaDeriveSkill,
    ProblemSolveSkill,
    ConceptTutorSkill,
    GraderSkill,
)
from app.skills.guided_learning import GuidedLearningSkill
from app.skills.coaching_strategy import CoachingStrategySkill


# Skill instances
_SKILLS: dict[str, BaseSkill] = {
    "sim_qa": SimQASkill(),
    "sim_guide": SimGuideSkill(),
    "code_assist": CodeAssistSkill(),
    "formula_derive": FormulaDeriveSkill(),
    "problem_solve": ProblemSolveSkill(),
    "concept_tutor": ConceptTutorSkill(),
    "grader": GraderSkill(),
    "guided_learning": GuidedLearningSkill(),
    "coaching_strategy": CoachingStrategySkill(),
}

# Aliases for backward compatibility with existing mode names
_ALIASES: dict[str, str] = {
    "tutor": "concept_tutor",
    "sim_explain": "sim_qa",
    "sim_tutor": "sim_guide",
    "formula_verify": "formula_derive",
    "guided": "guided_learning",  # Alias for guided learning mode
}


def get_skill(skill_id: str) -> Optional[BaseSkill]:
    """
    Get a skill by its ID.
    
    Args:
        skill_id: Skill identifier (e.g., "sim_qa", "code_assist")
        
    Returns:
        Skill instance or None if not found
    """
    # Check aliases first
    resolved_id = _ALIASES.get(skill_id, skill_id)
    return _SKILLS.get(resolved_id)


def get_all_skills() -> dict[str, BaseSkill]:
    """Get all registered skills."""
    return _SKILLS.copy()


def list_skill_ids() -> list[str]:
    """List all available skill IDs."""
    return list(_SKILLS.keys())


def get_skill_info() -> list[dict]:
    """
    Get information about all skills.
    
    Returns:
        List of skill metadata dicts
    """
    return [
        {
            "id": skill.skill_id,
            "name": skill.name,
            "description": skill.description,
        }
        for skill in _SKILLS.values()
    ]


# Re-export for convenience
__all__ = [
    "BaseSkill",
    "SimQASkill",
    "SimGuideSkill", 
    "CodeAssistSkill",
    "FormulaDeriveSkill",
    "ProblemSolveSkill",
    "ConceptTutorSkill",
    "GraderSkill",
    "GuidedLearningSkill",
    "CoachingStrategySkill",
    "get_skill",
    "get_all_skills",
    "list_skill_ids",
    "get_skill_info",
]
