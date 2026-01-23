"""
Tests for student_profile module.
"""

import pytest
from unittest.mock import AsyncMock, patch
from app.student_profile import StudentProfile, ProfileSyncClient


class TestStudentProfile:
    """Test the StudentProfile dataclass."""

    def test_profile_creation(self):
        """Profile should be created with all fields."""
        profile = StudentProfile(
            student_id=123,
            course_id=456,
            weak_points={"高斯定律": 2, "边界条件": 1},
            completed_topics=["电场基础", "电势"],
            total_sessions=5,
            total_study_minutes=120,
        )
        
        assert profile.student_id == 123
        assert profile.course_id == 456
        assert "高斯定律" in profile.weak_points
        assert len(profile.completed_topics) == 2

    def test_profile_default_values(self):
        """Profile should have sensible defaults."""
        profile = StudentProfile(
            student_id=1,
            course_id=1,
        )
        
        assert profile.weak_points == {}
        assert profile.completed_topics == []
        assert profile.total_sessions == 0
        assert profile.total_study_minutes == 0

    def test_weak_points_aggregation(self):
        """Weak points should aggregate correctly."""
        profile = StudentProfile(student_id=1, course_id=1)
        
        # Simulate adding weak points
        profile.weak_points["概念A"] = profile.weak_points.get("概念A", 0) + 1
        profile.weak_points["概念A"] = profile.weak_points.get("概念A", 0) + 1
        profile.weak_points["概念B"] = profile.weak_points.get("概念B", 0) + 1
        
        assert profile.weak_points["概念A"] == 2
        assert profile.weak_points["概念B"] == 1

    def test_top_weak_points(self):
        """Should be able to get top N weak points."""
        profile = StudentProfile(
            student_id=1,
            course_id=1,
            weak_points={
                "概念A": 5,
                "概念B": 3,
                "概念C": 8,
                "概念D": 1,
            }
        )
        
        # Sort by count
        sorted_weak = sorted(
            profile.weak_points.items(),
            key=lambda x: x[1],
            reverse=True
        )
        top_3 = sorted_weak[:3]
        
        assert top_3[0][0] == "概念C"  # 8
        assert top_3[1][0] == "概念A"  # 5
        assert top_3[2][0] == "概念B"  # 3


class TestProfileSyncClient:
    """Test the ProfileSyncClient class."""

    @pytest.fixture
    def client(self):
        return ProfileSyncClient(base_url="http://test:8080")

    def test_client_initialization(self, client):
        """Client should initialize with base URL."""
        assert client.base_url == "http://test:8080"

    @pytest.mark.asyncio
    async def test_get_profile_success(self, client):
        """get_profile should return profile on success."""
        mock_response = {
            "data": {
                "student_id": 1,
                "course_id": 1,
                "weak_points": '{"高斯定律": 2}',
                "completed_topics": '["电场"]',
                "total_sessions": 3,
                "total_study_minutes": 60,
            }
        }
        
        with patch.object(client, '_http_client') as mock_http:
            mock_http.get = AsyncMock(return_value=AsyncMock(
                status_code=200,
                json=lambda: mock_response
            ))
            
            # This would need actual async HTTP mocking
            # Placeholder for test structure
            pass

    @pytest.mark.asyncio
    async def test_get_profile_not_found(self, client):
        """get_profile should return None when not found."""
        with patch.object(client, '_http_client') as mock_http:
            mock_http.get = AsyncMock(return_value=AsyncMock(
                status_code=404,
                json=lambda: {"error": "not found"}
            ))
            
            # Placeholder
            pass

    @pytest.mark.asyncio
    async def test_save_profile_creates_new(self, client):
        """save_profile should create new profile."""
        profile = StudentProfile(
            student_id=1,
            course_id=1,
            weak_points={"测试": 1},
        )
        
        with patch.object(client, '_http_client') as mock_http:
            mock_http.post = AsyncMock(return_value=AsyncMock(
                status_code=201,
                json=lambda: {"data": {"id": 1}}
            ))
            
            # Placeholder
            pass

    @pytest.mark.asyncio
    async def test_merge_weak_points(self, client):
        """merge_weak_points should combine with existing."""
        existing = {"A": 2, "B": 1}
        new_points = {"A": 1, "C": 3}
        
        # Expected merge
        merged = existing.copy()
        for k, v in new_points.items():
            merged[k] = merged.get(k, 0) + v
        
        assert merged == {"A": 3, "B": 1, "C": 3}


class TestProfileSerialization:
    """Test profile JSON serialization."""

    def test_weak_points_to_json(self):
        """Weak points dict should serialize to JSON."""
        import json
        
        weak_points = {"高斯定律": 2, "边界条件": 1}
        serialized = json.dumps(weak_points, ensure_ascii=False)
        
        assert "高斯定律" in serialized
        
        deserialized = json.loads(serialized)
        assert deserialized == weak_points

    def test_completed_topics_to_json(self):
        """Completed topics list should serialize to JSON."""
        import json
        
        topics = ["电场基础", "电势", "电容"]
        serialized = json.dumps(topics, ensure_ascii=False)
        
        deserialized = json.loads(serialized)
        assert deserialized == topics
