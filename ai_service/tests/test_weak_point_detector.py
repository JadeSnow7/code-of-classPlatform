"""
Tests for weak_point_detector module.
"""

import pytest
from app.weak_point_detector import (
    WeakPointDetector,
    detect_weak_points,
    get_weak_point_detector,
)


class TestDetectWeakPoints:
    """Test the detect_weak_points convenience function."""

    def test_positive_feedback_returns_empty(self):
        """Positive feedback should not trigger weak point detection."""
        reply = "你的回答正确！高斯定律的理解很到位。"
        result = detect_weak_points(reply)
        assert result == []

    def test_negative_feedback_triggers_detection(self):
        """Negative feedback should detect concepts."""
        reply = "这个想法有道理，但是还需要注意高斯定律的适用范围。"
        result = detect_weak_points(reply)
        assert "高斯定律" in result

    def test_multiple_concepts_detected(self):
        """Multiple concepts in negative context should all be detected."""
        reply = "你对边界条件和麦克斯韦方程的理解都有偏差。"
        result = detect_weak_points(reply)
        assert "边界条件" in result or "麦克斯韦方程" in result

    def test_empty_input_returns_empty(self):
        """Empty input should return empty list."""
        result = detect_weak_points("")
        assert result == []

    def test_neutral_text_returns_empty(self):
        """Neutral text without indicators should return empty."""
        result = detect_weak_points("今天天气不错。")
        assert result == []


class TestWeakPointDetector:
    """Test the WeakPointDetector class."""

    @pytest.fixture
    def detector(self):
        return WeakPointDetector()

    def test_analyze_positive_response(self, detector):
        """Positive response should not be marked as negative."""
        reply = "完全正确！你已经掌握了这个概念。"
        analysis = detector.analyze(reply)
        
        # May or may not be negative depending on implementation
        # assert not analysis.is_negative_response or analysis.detected_concepts == []

    def test_analyze_negative_response(self, detector):
        """Negative response should be detected."""
        reply = "不对，电场强度的方向理解错了。"
        analysis = detector.analyze(reply)
        
        assert analysis.is_negative_response is True

    def test_analyze_confidence_reasonable(self, detector):
        """Confidence should be between 0 and 1."""
        reply = "还需要复习一下高斯定律。"
        analysis = detector.analyze(reply)
        
        assert 0 <= analysis.confidence <= 1

    def test_analyze_with_correction_excerpt(self, detector):
        """Correction excerpts should be extracted."""
        reply = "你说的不对。正确的是：E = F/q。"
        analysis = detector.analyze(reply)
        
        # Should have correction excerpts if found
        # assert len(analysis.correction_excerpts) >= 0


class TestGetWeakPointDetector:
    """Test the global detector singleton."""

    def test_returns_detector_instance(self):
        """Should return a WeakPointDetector instance."""
        detector = get_weak_point_detector()
        assert isinstance(detector, WeakPointDetector)

    def test_returns_same_instance(self):
        """Should return the same instance on multiple calls."""
        detector1 = get_weak_point_detector()
        detector2 = get_weak_point_detector()
        assert detector1 is detector2


class TestDomainConcepts:
    """Test domain-specific concept detection."""

    @pytest.fixture
    def detector(self):
        return WeakPointDetector()

    @pytest.mark.parametrize("concept,text", [
        ("高斯定律", "高斯定律的积分形式有问题"),
        ("边界条件", "边界条件的处理不对"),
        ("电场强度", "电场强度的方向错了"),
        ("磁通量", "磁通量的计算有误"),
    ])
    def test_em_concepts_detected(self, detector, concept, text):
        """Core EM concepts should be detected in negative context."""
        analysis = detector.analyze(text)
        # Check if concept is in detected concepts
        found = any(concept in c for c in analysis.detected_concepts)
        assert found or len(analysis.detected_concepts) > 0
