"""
Student Profile Persistence

Provides API endpoints for syncing student learning profiles between
the AI service (in-memory sessions) and the Go backend (database storage).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import httpx
from pydantic import BaseModel


@dataclass
class StudentProfile:
    """Student learning profile for persistence."""
    student_id: int
    course_id: int
    weak_points: dict[str, int] = field(default_factory=dict)  # concept -> count
    completed_topics: list[str] = field(default_factory=list)
    total_sessions: int = 0
    total_study_minutes: int = 0
    last_session_at: Optional[datetime] = None
    recommended_topics: list[str] = field(default_factory=list)
    
    def add_weak_point(self, concept: str, weight: int = 1):
        """Add or increment a weak point."""
        self.weak_points[concept] = self.weak_points.get(concept, 0) + weight
    
    def complete_topic(self, topic: str):
        """Mark a topic as completed."""
        if topic not in self.completed_topics:
            self.completed_topics.append(topic)
    
    def to_dict(self) -> dict:
        """Convert to dict for API transmission."""
        return {
            "student_id": self.student_id,
            "course_id": self.course_id,
            "weak_points": json.dumps(self.weak_points),
            "completed_topics": json.dumps(self.completed_topics),
            "total_sessions": self.total_sessions,
            "total_study_minutes": self.total_study_minutes,
            "last_session_at": self.last_session_at.isoformat() if self.last_session_at else None,
            "recommended_topics": json.dumps(self.recommended_topics),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "StudentProfile":
        """Create from API response dict."""
        weak_points = json.loads(data.get("weak_points", "{}") or "{}")
        completed_topics = json.loads(data.get("completed_topics", "[]") or "[]")
        recommended_topics = json.loads(data.get("recommended_topics", "[]") or "[]")
        
        last_session = None
        if data.get("last_session_at"):
            try:
                last_session = datetime.fromisoformat(data["last_session_at"].replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass
        
        return cls(
            student_id=data.get("student_id", 0),
            course_id=data.get("course_id", 0),
            weak_points=weak_points,
            completed_topics=completed_topics,
            total_sessions=data.get("total_sessions", 0),
            total_study_minutes=data.get("total_study_minutes", 0),
            last_session_at=last_session,
            recommended_topics=recommended_topics,
        )


class ProfileSyncClient:
    """Client for syncing profiles with Go backend."""
    
    def __init__(self, backend_url: str | None = None, base_url: str | None = None):
        """
        Initialize sync client.
        
        Args:
            backend_url: Base URL of Go backend API (e.g., http://localhost:8080)
            base_url: Backward-compatible alias for backend_url
        """
        backend = backend_url or base_url
        if not backend:
            raise ValueError("backend_url is required")
        self.backend_url = backend.rstrip("/")
        # Backward-compatible alias for tests
        self.base_url = self.backend_url
        # Optional injected client for tests/mocking
        self._http_client: httpx.AsyncClient | None = None
    
    async def get_profile(self, student_id: int, course_id: int) -> Optional[StudentProfile]:
        """
        Fetch student profile from backend.
        
        Args:
            student_id: Student user ID
            course_id: Course ID
            
        Returns:
            StudentProfile if found, None otherwise
        """
        url = f"{self.backend_url}/api/v1/learning-profiles/{course_id}/{student_id}"
        
        try:
            if self._http_client:
                resp = await self._http_client.get(url)
            else:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("data"):
                    return StudentProfile.from_dict(data["data"])
            return None
        except httpx.HTTPError:
            return None
    
    async def save_profile(self, profile: StudentProfile) -> bool:
        """
        Save or update student profile in backend.
        
        Args:
            profile: StudentProfile to save
            
        Returns:
            True if successful, False otherwise
        """
        url = f"{self.backend_url}/api/v1/learning-profiles"
        
        try:
            if self._http_client:
                resp = await self._http_client.post(url, json=profile.to_dict())
            else:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json=profile.to_dict())
            return resp.status_code in (200, 201)
        except httpx.HTTPError:
            return False
    
    async def merge_weak_points(
        self,
        student_id: int,
        course_id: int,
        new_weak_points: dict[str, int]
    ) -> bool:
        """
        Merge new weak points into existing profile.
        
        Args:
            student_id: Student user ID
            course_id: Course ID
            new_weak_points: New weak points to merge
            
        Returns:
            True if successful
        """
        profile = await self.get_profile(student_id, course_id)
        if profile is None:
            profile = StudentProfile(student_id=student_id, course_id=course_id)
        
        for concept, count in new_weak_points.items():
            profile.add_weak_point(concept, count)
        
        profile.total_sessions += 1
        profile.last_session_at = datetime.now()
        
        return await self.save_profile(profile)


# ============================================================================
# Pydantic models for API endpoints
# ============================================================================

class ProfileRequest(BaseModel):
    """Request to get or create a learning profile."""
    student_id: int
    course_id: int


class ProfileUpdateRequest(BaseModel):
    """Request to update a learning profile."""
    student_id: int
    course_id: int
    weak_points: dict[str, int] = {}
    completed_topic: Optional[str] = None
    study_minutes: int = 0


class ProfileResponse(BaseModel):
    """Response containing student profile."""
    profile: dict
    success: bool
    message: str = ""
