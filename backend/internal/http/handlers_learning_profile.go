package http

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type learningProfileHandlers struct {
	db *gorm.DB
}

func newLearningProfileHandlers(db *gorm.DB) *learningProfileHandlers {
	return &learningProfileHandlers{db: db}
}

// GetProfile returns a student's learning profile for a course.
// GET /api/v1/learning-profiles/:courseId/:studentId
func (h *learningProfileHandlers) GetProfile(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course_id"})
		return
	}

	studentID, err := strconv.ParseUint(c.Param("studentId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid student_id"})
		return
	}

	// Check permission: students can only view their own profile
	currentUserID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	if role == "student" && fmt.Sprintf("%v", currentUserID) != fmt.Sprintf("%d", studentID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot view other student's profile"})
		return
	}

	var profile models.StudentLearningProfile
	result := h.db.Where("course_id = ? AND student_id = ?", courseID, studentID).First(&profile)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{"data": nil, "message": "profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": profile})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Upsert profile
	var profile models.StudentLearningProfile
	result := h.db.Where("course_id = ? AND student_id = ?", req.CourseID, req.StudentID).First(&profile)

	if result.Error == gorm.ErrRecordNotFound {
		// Create new profile
		profile = models.StudentLearningProfile{
			StudentID:         req.StudentID,
			CourseID:          req.CourseID,
			WeakPoints:        req.WeakPoints,
			CompletedTopics:   req.CompletedTopics,
			TotalSessions:     req.TotalSessions,
			TotalStudyMinutes: req.TotalStudyMinutes,
			RecommendedTopics: req.RecommendedTopics,
		}
		if err := h.db.Create(&profile).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"data": profile})
		return
	}

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	// Update existing profile
	profile.WeakPoints = req.WeakPoints
	profile.CompletedTopics = req.CompletedTopics
	profile.TotalSessions = req.TotalSessions
	profile.TotalStudyMinutes = req.TotalStudyMinutes
	profile.RecommendedTopics = req.RecommendedTopics

	if err := h.db.Save(&profile).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": profile})
}

// ListCourseProfiles returns all profiles for a course (teacher only).
// GET /api/v1/courses/:courseId/learning-profiles
func (h *learningProfileHandlers) ListCourseProfiles(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course_id"})
		return
	}

	var profiles []models.StudentLearningProfile
	result := h.db.Where("course_id = ?", courseID).Find(&profiles)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": profiles, "count": len(profiles)})
}
