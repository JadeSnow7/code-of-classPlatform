"""
Tests for session management module.
"""

import pytest
from app.session import LearningSession, SessionManager, LearningStep


class TestLearningSession:
    """Test the LearningSession dataclass."""

    def test_session_creation(self):
        """Session should be created with default values."""
        session = LearningSession()
        
        assert session.session_id is not None
        assert len(session.session_id) > 0
        assert session.user_id == ""
        assert session.topic == ""
        assert session.current_step == 0
        assert session.weak_points == []
        assert session.messages == []

    def test_session_with_params(self):
        """Session should accept initialization parameters."""
        session = LearningSession(
            user_id="user-123",
            topic="高斯定律",
            course_id="course-001"
        )
        
        assert session.user_id == "user-123"
        assert session.topic == "高斯定律"
        assert session.course_id == "course-001"

    def test_add_weak_point(self):
        """add_weak_point should add unique weak points."""
        session = LearningSession()
        
        session.add_weak_point("边界条件")
        assert "边界条件" in session.weak_points
        
        # Adding same weak point should not duplicate
        session.add_weak_point("边界条件")
        assert session.weak_points.count("边界条件") == 1

    def test_add_multiple_weak_points(self):
        """Multiple different weak points should be added."""
        session = LearningSession()
        
        session.add_weak_point("高斯定律")
        session.add_weak_point("麦克斯韦方程")
        session.add_weak_point("边界条件")
        
        assert len(session.weak_points) == 3

    def test_learning_path_management(self):
        """Learning path should be set and accessed correctly."""
        session = LearningSession()
        
        path = [
            LearningStep(step=1, title="概念", description="学习基本概念", questions=[]),
            LearningStep(step=2, title="公式", description="学习公式推导", questions=[]),
        ]
        session.learning_path = path
        
        assert len(session.learning_path) == 2
        assert session.learning_path[0].title == "概念"

    def test_step_advancement(self):
        """current_step should advance correctly."""
        session = LearningSession()
        session.learning_path = [
            LearningStep(step=1, title="1", description="", questions=[]),
            LearningStep(step=2, title="2", description="", questions=[]),
            LearningStep(step=3, title="3", description="", questions=[]),
        ]
        
        assert session.current_step == 0
        
        session.current_step = 1
        assert session.current_step == 1
        
        session.current_step = 2
        assert session.current_step == 2


class TestSessionManager:
    """Test the SessionManager class."""

    def setup_method(self):
        """Clear sessions before each test."""
        SessionManager._sessions.clear()

    def test_create_session(self):
        """create should return a new session."""
        session = SessionManager.create(
            user_id="user-001",
            topic="电磁场"
        )
        
        assert session is not None
        assert session.user_id == "user-001"
        assert session.topic == "电磁场"
        assert session.session_id is not None

    def test_get_session(self):
        """get_for_user should return existing session."""
        created = SessionManager.create(user_id="user-002", topic="测试")
        
        retrieved = SessionManager.get_for_user(created.session_id, "user-002")
        
        assert retrieved is not None
        assert retrieved.session_id == created.session_id

    def test_get_session_wrong_user(self):
        """get_for_user should return None for wrong user."""
        created = SessionManager.create(user_id="user-003", topic="测试")
        
        # Different user trying to access
        retrieved = SessionManager.get_for_user(created.session_id, "user-other")
        
        assert retrieved is None

    def test_get_nonexistent_session(self):
        """get_for_user should return None for nonexistent session."""
        retrieved = SessionManager.get_for_user("nonexistent-id", "user-001")
        
        assert retrieved is None

    def test_update_session(self):
        """update should modify session state."""
        session = SessionManager.create(user_id="user-004", topic="测试")
        
        session.current_step = 2
        session.add_weak_point("概念A")
        
        SessionManager.update(session)
        
        retrieved = SessionManager.get_for_user(session.session_id, "user-004")
        assert retrieved.current_step == 2
        assert "概念A" in retrieved.weak_points

    def test_delete_session(self):
        """delete should remove session."""
        session = SessionManager.create(user_id="user-005", topic="测试")
        session_id = session.session_id
        
        SessionManager.delete(session_id)
        
        retrieved = SessionManager.get_for_user(session_id, "user-005")
        assert retrieved is None

    def test_session_limit(self):
        """Should enforce MAX_SESSIONS_PER_USER limit."""
        user_id = "user-limit-test"
        
        # Create sessions up to limit
        sessions = []
        for i in range(SessionManager.MAX_SESSIONS_PER_USER + 2):
            session = SessionManager.create(user_id=user_id, topic=f"Topic {i}")
            sessions.append(session.session_id)
        
        # Count active sessions for this user
        active_count = sum(
            1 for s in SessionManager._sessions.values()
            if s.user_id == user_id
        )
        
        # Should not exceed limit
        assert active_count <= SessionManager.MAX_SESSIONS_PER_USER


class TestLearningStep:
    """Test the LearningStep dataclass."""

    def test_step_creation(self):
        """LearningStep should be created with all fields."""
        step = LearningStep(
            step=1,
            title="高斯定律基础",
            description="学习高斯定律的基本概念和物理意义",
            questions=["什么是电通量？", "高斯定律的适用条件是什么？"]
        )
        
        assert step.step == 1
        assert step.title == "高斯定律基础"
        assert len(step.questions) == 2

    def test_step_empty_questions(self):
        """LearningStep should allow empty questions list."""
        step = LearningStep(
            step=1,
            title="测试",
            description="描述",
            questions=[]
        )
        
        assert step.questions == []
