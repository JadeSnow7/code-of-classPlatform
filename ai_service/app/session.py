"""
Learning Session Management

Provides secure session storage for guided learning mode with user binding,
TTL management, and session limit per user.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
import uuid


@dataclass
class LearningStep:
    """A single step in the learning path."""
    step: int
    title: str
    description: str
    questions: list[str] = field(default_factory=list)
    prerequisite_concepts: list[str] = field(default_factory=list)
    requires_tool_verification: bool = False
    completed: bool = False


@dataclass
class LearningSession:
    """Secure learning session with user binding."""
    
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""  # From JWT, not client-provided
    course_id: str | None = None
    topic: str = ""
    learning_goal: str = ""
    
    # Learning path (structured)
    learning_path: list[LearningStep] = field(default_factory=list)
    current_step: int = 0
    
    # State tracking
    weak_points: list[str] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)
    
    # Security and lifecycle
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    expires_at: datetime = field(default_factory=lambda: datetime.now() + timedelta(hours=2))
    
    def is_expired(self) -> bool:
        """Check if session has expired."""
        return datetime.now() > self.expires_at
    
    def refresh_ttl(self, hours: int = 2):
        """Extend session TTL."""
        self.expires_at = datetime.now() + timedelta(hours=hours)
        self.updated_at = datetime.now()
    
    def advance_step(self) -> bool:
        """Move to next step. Returns False if already at last step."""
        if self.current_step < len(self.learning_path) - 1:
            self.learning_path[self.current_step].completed = True
            self.current_step += 1
            self.updated_at = datetime.now()
            return True
        return False
    
    def add_weak_point(self, concept: str):
        """Record a discovered weak point."""
        if concept not in self.weak_points:
            self.weak_points.append(concept)
    
    def get_progress_percentage(self) -> float:
        """Get learning progress as percentage."""
        if not self.learning_path:
            return 0.0
        return (self.current_step / len(self.learning_path)) * 100
    
    def to_dict(self) -> dict:
        """Convert session to dict for JSON serialization."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "course_id": self.course_id,
            "topic": self.topic,
            "learning_goal": self.learning_goal,
            "current_step": self.current_step,
            "total_steps": len(self.learning_path),
            "progress_percentage": self.get_progress_percentage(),
            "weak_points": self.weak_points,
            "learning_path": [
                {
                    "step": s.step,
                    "title": s.title,
                    "description": s.description,
                    "questions": s.questions,
                    "completed": s.completed,
                }
                for s in self.learning_path
            ],
        }


class SessionManager:
    """
    Session storage with TTL and user binding.
    
    Note: This is an in-memory implementation. For production with multiple
    workers, use Redis or database-backed storage.
    """
    
    _sessions: dict[str, LearningSession] = {}
    MAX_SESSIONS_PER_USER = 5
    
    @classmethod
    def create(
        cls,
        user_id: str,
        topic: str,
        course_id: str | None = None,
    ) -> LearningSession:
        """Create new session bound to user."""
        # Cleanup expired sessions
        cls._cleanup_expired()
        
        # Limit sessions per user
        user_sessions = [s for s in cls._sessions.values() if s.user_id == user_id]
        if len(user_sessions) >= cls.MAX_SESSIONS_PER_USER:
            # Delete oldest session
            oldest = min(user_sessions, key=lambda s: s.created_at)
            del cls._sessions[oldest.session_id]
        
        session = LearningSession(
            user_id=user_id,
            topic=topic,
            course_id=course_id,
        )
        cls._sessions[session.session_id] = session
        return session
    
    @classmethod
    def get_for_user(cls, session_id: str, user_id: str) -> Optional[LearningSession]:
        """Get session only if owned by user."""
        session = cls._sessions.get(session_id)
        if session and session.user_id == user_id and not session.is_expired():
            session.refresh_ttl()
            return session
        return None
    
    @classmethod
    def update(cls, session: LearningSession):
        """Update session in storage."""
        session.updated_at = datetime.now()
        cls._sessions[session.session_id] = session
    
    @classmethod
    def delete(cls, session_id: str):
        """Delete a session."""
        if session_id in cls._sessions:
            del cls._sessions[session_id]
    
    @classmethod
    def _cleanup_expired(cls):
        """Remove expired sessions."""
        expired = [sid for sid, s in cls._sessions.items() if s.is_expired()]
        for sid in expired:
            del cls._sessions[sid]
    
    @classmethod
    def get_user_sessions(cls, user_id: str) -> list[LearningSession]:
        """Get all active sessions for a user."""
        cls._cleanup_expired()
        return [s for s in cls._sessions.values() if s.user_id == user_id]
