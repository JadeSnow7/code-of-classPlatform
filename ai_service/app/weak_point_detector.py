"""
Weak Point Detector

Uses NLP techniques to detect student weak points from AI responses.
Analyzes conversation to identify concepts the student struggles with.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# Domain-specific terminology for electromagnetic field course
EM_CONCEPTS = {
    # Maxwell's Equations
    "麦克斯韦方程": ["麦克斯韦", "Maxwell"],
    "高斯定律": ["高斯", "Gauss", "散度"],
    "法拉第定律": ["法拉第", "Faraday", "感应电动势"],
    "安培定律": ["安培", "Ampere", "环路"],
    "位移电流": ["位移电流", "displacement current"],
    
    # Field Concepts
    "电场强度": ["电场", "E场", "电场强度"],
    "磁场强度": ["磁场", "H场", "磁场强度"],
    "磁感应强度": ["磁感应", "B场"],
    "电位移矢量": ["电位移", "D矢量"],
    "电势": ["电势", "电位", "电压"],
    "磁通量": ["磁通量", "磁通"],
    
    # Wave Concepts
    "电磁波": ["电磁波", "波动方程"],
    "波阻抗": ["波阻抗", "本征阻抗"],
    "趋肤深度": ["趋肤", "集肤效应"],
    "相速度": ["相速", "相速度"],
    "群速度": ["群速", "群速度"],
    
    # Boundary Conditions
    "边界条件": ["边界条件", "界面条件"],
    "切向分量": ["切向", "切向分量"],
    "法向分量": ["法向", "法向分量"],
    
    # Mathematical Tools
    "梯度": ["梯度", "grad", "∇"],
    "散度": ["散度", "div", "∇·"],
    "旋度": ["旋度", "curl", "∇×"],
    "拉普拉斯": ["拉普拉斯", "Laplacian", "∇²"],
    
    # Applications
    "传输线": ["传输线", "transmission line"],
    "波导": ["波导", "waveguide"],
    "天线": ["天线", "antenna"],
    "史密斯圆图": ["史密斯", "Smith chart"],
}

# Indicators that student made an error or has confusion
NEGATIVE_INDICATORS = [
    "不对",
    "不太对",
    "还需要",
    "注意",
    "其实",
    "但是",
    "偏差",
    "错误",
    "有误",
    "有问题",
    "不完全正确",
    "需要再想想",
    "还差一点",
    "忽略了",
    "遗漏了",
    "混淆了",
    "理解偏差",
    "错了",
    "常见错误",
    "容易忽视",
]

# Indicators that student is progressing well
POSITIVE_INDICATORS = [
    "正确",
    "很好",
    "太棒了",
    "完全正确",
    "理解得很好",
    "进入下一步",
    "接下来",
    "没问题",
    "掌握了",
]


@dataclass
class WeakPointAnalysis:
    """Result of weak point analysis."""
    detected_concepts: list[str] = field(default_factory=list)
    confidence: float = 0.0
    is_positive_response: bool = False
    is_negative_response: bool = False
    raw_excerpts: list[str] = field(default_factory=list)


class WeakPointDetector:
    """
    Detects weak points from AI teaching responses.
    
    Uses pattern matching and domain-specific terminology to identify
    concepts that the student struggles with.
    """
    
    def __init__(self, custom_concepts: Optional[dict[str, list[str]]] = None):
        """
        Initialize detector with concept dictionary.
        
        Args:
            custom_concepts: Additional domain-specific concepts to detect
        """
        self.concepts = EM_CONCEPTS.copy()
        if custom_concepts:
            self.concepts.update(custom_concepts)
    
    def analyze(self, ai_reply: str, student_message: Optional[str] = None) -> WeakPointAnalysis:
        """
        Analyze AI reply to detect potential weak points.
        
        Args:
            ai_reply: The AI assistant's response
            student_message: Optional student message for context
            
        Returns:
            WeakPointAnalysis with detected concepts and metadata
        """
        result = WeakPointAnalysis()
        
        # Check for positive/negative indicators
        result.is_positive_response = any(ind in ai_reply for ind in POSITIVE_INDICATORS)
        result.is_negative_response = any(ind in ai_reply for ind in NEGATIVE_INDICATORS)
        
        # If positive response, student likely doesn't have weak points in this topic
        if result.is_positive_response and not result.is_negative_response:
            result.confidence = 0.0
            return result
        
        # Extract concepts mentioned in negative context
        if result.is_negative_response:
            weak_concepts = self._extract_concepts_in_context(ai_reply)
            result.detected_concepts = weak_concepts
            result.confidence = min(0.3 + 0.2 * len(weak_concepts), 1.0)
            result.raw_excerpts = self._extract_correction_excerpts(ai_reply)
        
        return result
    
    def _extract_concepts_in_context(self, text: str) -> list[str]:
        """Extract domain concepts mentioned near negative indicators."""
        detected = set()
        
        # Split into sentences
        sentences = re.split(r'[。！？\n]', text)
        
        for sentence in sentences:
            # Check if sentence contains negative indicator
            has_negative = any(ind in sentence for ind in NEGATIVE_INDICATORS)
            
            if has_negative:
                # Look for domain concepts in this sentence
                for concept_name, keywords in self.concepts.items():
                    for keyword in keywords:
                        if keyword in sentence:
                            detected.add(concept_name)
                            break
        
        return list(detected)
    
    def _extract_correction_excerpts(self, text: str) -> list[str]:
        """Extract excerpts where corrections are made."""
        excerpts = []
        sentences = re.split(r'[。！？\n]', text)
        
        for sentence in sentences:
            if any(ind in sentence for ind in NEGATIVE_INDICATORS):
                sentence = sentence.strip()
                if sentence and len(sentence) > 10:
                    excerpts.append(sentence)
        
        return excerpts[:3]  # Limit to 3 excerpts
    
    def analyze_conversation(
        self,
        messages: list[dict],
        window_size: int = 5
    ) -> dict[str, int]:
        """
        Analyze recent conversation to aggregate weak points.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            window_size: Number of recent message pairs to analyze
            
        Returns:
            Dict mapping concept names to occurrence counts
        """
        weak_point_counts: dict[str, int] = {}
        
        # Get recent assistant messages
        assistant_messages = [
            m for m in messages[-window_size * 2:]
            if m.get("role") == "assistant"
        ]
        
        for msg in assistant_messages:
            analysis = self.analyze(msg.get("content", ""))
            for concept in analysis.detected_concepts:
                weak_point_counts[concept] = weak_point_counts.get(concept, 0) + 1
        
        return weak_point_counts


# Global detector instance
_detector: Optional[WeakPointDetector] = None


def get_weak_point_detector() -> WeakPointDetector:
    """Get or create the global weak point detector."""
    global _detector
    if _detector is None:
        _detector = WeakPointDetector()
    return _detector


def detect_weak_points(ai_reply: str) -> list[str]:
    """
    Convenience function to detect weak points from AI reply.
    
    Args:
        ai_reply: The AI assistant's response
        
    Returns:
        List of detected weak point concept names
    """
    detector = get_weak_point_detector()
    analysis = detector.analyze(ai_reply)
    return analysis.detected_concepts
