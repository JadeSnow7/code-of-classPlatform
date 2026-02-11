package http

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type learningProfileHandlers struct {
	service services.LearningProfileService
}

func newLearningProfileHandlers(service services.LearningProfileService) *learningProfileHandlers {
	return &learningProfileHandlers{service: service}
}

// GetProfile returns a student's learning profile for a course.
// GET /api/v1/learning-profiles/:courseId/:studentId
func (h *learningProfileHandlers) GetProfile(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid student ID")
		return
	}

	// Check permission: students can only view their own profile
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && fmt.Sprintf("%v", currentUserID) != fmt.Sprintf("%d", studentID) {
		response.Forbidden(c, "Cannot view other student's profile")
		return
	}

	// Use service to get profile
	profile, err := h.service.GetProfile(c.Request.Context(), uint(courseID), uint(studentID))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.NotFound(c, "Profile")
		} else {
			response.Error(c, err)
		}
		return
	}

	response.OK(c, profile)
}

// SaveProfile creates or updates a student's learning profile.
// POST /api/v1/learning-profiles
// This endpoint is called by the AI service to sync learning data.
type saveProfileRequest struct {
	StudentID         uint   `json:"student_id" binding:"required"`
	CourseID          uint   `json:"course_id" binding:"required"`
	WeakPoints        string `json:"weak_points"`
	CompletedTopics   string `json:"completed_topics"`
	TotalSessions     int    `json:"total_sessions"`
	TotalStudyMinutes int    `json:"total_study_minutes"`
	RecommendedTopics string `json:"recommended_topics"`
}

func (h *learningProfileHandlers) SaveProfile(c *gin.Context) {
	var req saveProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	// Build profile model
	profile := &models.StudentLearningProfile{
		StudentID:         req.StudentID,
		CourseID:          req.CourseID,
		WeakPoints:        req.WeakPoints,
		CompletedTopics:   req.CompletedTopics,
		TotalSessions:     req.TotalSessions,
		TotalStudyMinutes: req.TotalStudyMinutes,
		RecommendedTopics: req.RecommendedTopics,
	}

	// Use service to save (upsert)
	if err := h.service.SaveProfile(c.Request.Context(), profile); err != nil {
		response.Error(c, err)
		return
	}

	// Return appropriate status based on whether it was created or updated
	// For simplicity, return 200 OK (service handles upsert internally)
	response.OK(c, profile)
}

// ListCourseProfiles returns all profiles for a course (teacher only).
// GET /api/v1/courses/:courseId/learning-profiles
func (h *learningProfileHandlers) ListCourseProfiles(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	// Use service to list profiles
	profiles, err := h.service.ListCourseProfiles(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"items": profiles, "count": len(profiles)})
}
