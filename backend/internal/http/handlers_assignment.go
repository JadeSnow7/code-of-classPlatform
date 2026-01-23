package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type assignmentHandlers struct {
	db       *gorm.DB
	aiClient *clients.AIClient
}

func newAssignmentHandlers(db *gorm.DB, aiClient *clients.AIClient) *assignmentHandlers {
	return &assignmentHandlers{db: db, aiClient: aiClient}
}

// --- Assignment CRUD ---

type createAssignmentRequest struct {
	CourseID    uint   `json:"course_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Deadline    string `json:"deadline"` // ISO8601 format
	AllowFile   bool   `json:"allow_file"`
}

func (h *assignmentHandlers) CreateAssignment(c *gin.Context) {
	var req createAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Get current user from context (set by AuthRequired middleware)
	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	// Validate teacher is owner of the course
	var course models.Course
	if err := h.db.First(&course, req.CourseID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.TeacherID != user.ID && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not the course teacher"})
		return
	}

	assignment := models.Assignment{
		CourseID:    req.CourseID,
		TeacherID:   user.ID,
		Title:       req.Title,
		Description: req.Description,
		AllowFile:   req.AllowFile,
	}

	// Parse deadline if provided
	// Simplified: not implemented here, can add time.Parse

	if err := h.db.Create(&assignment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create assignment"})
		return
	}

	c.JSON(http.StatusCreated, assignment)
}

func (h *assignmentHandlers) ListAssignments(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	var assignments []models.Assignment
	if err := h.db.Where("course_id = ?", courseID).Order("created_at DESC").Find(&assignments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list assignments"})
		return
	}

	c.JSON(http.StatusOK, assignments)
}

func (h *assignmentHandlers) GetAssignment(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var assignment models.Assignment
	if err := h.db.First(&assignment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "assignment not found"})
		return
	}

	c.JSON(http.StatusOK, assignment)
}

// --- Submission ---

type submitRequest struct {
	Content string `json:"content"`
	FileURL string `json:"file_url"`
}

func (h *assignmentHandlers) SubmitAssignment(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid assignment id"})
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	// Check if assignment exists
	var assignment models.Assignment
	if err := h.db.First(&assignment, assignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "assignment not found"})
		return
	}

	// Upsert submission (unique constraint on assignment_id + student_id)
	var existing models.Submission
	result := h.db.Where("assignment_id = ? AND student_id = ?", assignmentID, user.ID).First(&existing)

	if result.Error == nil {
		// Update existing
		existing.Content = req.Content
		existing.FileURL = req.FileURL
		if err := h.db.Save(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update submission"})
			return
		}
		c.JSON(http.StatusOK, existing)
		return
	}

	// Create new
	submission := models.Submission{
		AssignmentID: uint(assignmentID),
		StudentID:    user.ID,
		Content:      req.Content,
		FileURL:      req.FileURL,
	}
	if err := h.db.Create(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create submission"})
		return
	}

	c.JSON(http.StatusCreated, submission)
}

// GetMySubmission returns the current user's submission for an assignment
func (h *assignmentHandlers) GetMySubmission(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid assignment id"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var submission models.Submission
	if err := h.db.Where("assignment_id = ? AND student_id = ?", assignmentID, user.ID).First(&submission).Error; err != nil {
		// Return null instead of error if no submission
		c.JSON(http.StatusOK, nil)
		return
	}

	c.JSON(http.StatusOK, submission)
}

// --- Grading ---

type gradeRequest struct {
	Grade    int    `json:"grade" binding:"required,min=0,max=100"`
	Feedback string `json:"feedback"`
}

func (h *assignmentHandlers) GradeSubmission(c *gin.Context) {
	idStr := c.Param("submissionId")
	submissionID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid submission id"})
		return
	}

	var req gradeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var submission models.Submission
	if err := h.db.First(&submission, submissionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}

	// Validate grader is teacher of the course
	var assignment models.Assignment
	if err := h.db.First(&assignment, submission.AssignmentID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "assignment not found"})
		return
	}

	var course models.Course
	if err := h.db.First(&course, assignment.CourseID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "course not found"})
		return
	}

	if course.TeacherID != user.ID && user.Role != "admin" && user.Role != "assistant" {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not authorized to grade this submission"})
		return
	}

	submission.Grade = &req.Grade
	submission.Feedback = req.Feedback
	submission.GradedBy = &user.ID

	if err := h.db.Save(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save grade"})
		return
	}

	c.JSON(http.StatusOK, submission)
}

func (h *assignmentHandlers) ListSubmissions(c *gin.Context) {
	idStr := c.Param("id")
	assignmentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid assignment id"})
		return
	}

	var submissions []models.Submission
	if err := h.db.Where("assignment_id = ?", assignmentID).Order("created_at DESC").Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list submissions"})
		return
	}

	c.JSON(http.StatusOK, submissions)
}

// AIGradeSubmission uses AI to analyze a submission and suggest a grade
// Route: POST /submissions/:submissionId/ai-grade
// Requires: teacher/admin/assistant of the course
func (h *assignmentHandlers) AIGradeSubmission(c *gin.Context) {
	idStr := c.Param("submissionId")
	submissionID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid submission id"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	// Get submission
	var submission models.Submission
	if err := h.db.First(&submission, submissionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}

	// Get assignment and course for authorization
	var assignment models.Assignment
	if err := h.db.First(&assignment, submission.AssignmentID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "assignment not found"})
		return
	}

	var course models.Course
	if err := h.db.First(&course, assignment.CourseID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "course not found"})
		return
	}

	// Only course teacher, admin, or assistant can use AI grading
	if course.TeacherID != user.ID && user.Role != "admin" && user.Role != "assistant" {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not authorized to grade this submission"})
		return
	}

	// Build prompt for AI
	prompt := "请评阅以下学生作业并给出评分建议（0-100分）和详细反馈。\n\n"
	prompt += "作业题目: " + assignment.Title + "\n"
	prompt += "作业要求: " + assignment.Description + "\n\n"
	prompt += "学生提交内容:\n" + submission.Content + "\n\n"
	prompt += "请按以下格式回复:\n建议分数: [0-100]\n评语: [详细反馈]\n改进建议: [如有]"

	// Call AI service
	aiRequest := clients.ChatRequest{
		Mode: "default",
		Messages: []clients.ChatMessage{
			{Role: "user", Content: prompt},
		},
		Stream: false,
	}
	aiResponse, err := h.aiClient.Chat(c.Request.Context(), aiRequest)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI service unavailable"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestion":        aiResponse.Reply,
		"recommended_grade": nil, // Let teacher decide based on AI suggestion
	})
}

// --- Statistics ---

type assignmentStats struct {
	TotalAssignments int     `json:"total_assignments"`
	PendingCount     int     `json:"pending_count"` // For student: assignments not submitted
	SubmittedCount   int     `json:"submitted_count"`
	AverageGrade     float64 `json:"average_grade"` // For student: their avg grade; For teacher: course avg
}

func (h *assignmentHandlers) GetCourseAssignmentStats(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var stats assignmentStats

	// 1. Total assignments count
	var totalAssignments int64
	if err := h.db.Model(&models.Assignment{}).Where("course_id = ?", courseID).Count(&totalAssignments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count assignments"})
		return
	}
	stats.TotalAssignments = int(totalAssignments)

	if user.Role == "student" {
		// 2. Submitted count
		var submittedCount int64
		// Join submissions with assignments to filter by course_id
		err := h.db.Table("submissions").
			Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
			Where("assignments.course_id = ? AND submissions.student_id = ?", courseID, user.ID).
			Count(&submittedCount).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count submissions"})
			return
		}
		stats.SubmittedCount = int(submittedCount)
		stats.PendingCount = int(totalAssignments) - int(submittedCount)

		// 3. Average grade
		var avgGrade float64
		err = h.db.Table("submissions").
			Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
			Where("assignments.course_id = ? AND submissions.student_id = ? AND submissions.grade IS NOT NULL", courseID, user.ID).
			Select("AVG(submissions.grade)").Row().Scan(&avgGrade)

		if err == nil {
			stats.AverageGrade = avgGrade
		}
	} else {
		// For Teachers/Admins: Course-wide stats
		// Pending grading count? Or just leave pending as 0 for now.
		// Let's implement "Pending Grading" as PendingCount for teachers

		var pendingGrading int64
		err := h.db.Table("submissions").
			Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
			Where("assignments.course_id = ? AND submissions.grade IS NULL", courseID).
			Count(&pendingGrading).Error
		if err == nil {
			stats.PendingCount = int(pendingGrading)
		}

		// Course average
		var avgGrade float64
		err = h.db.Table("submissions").
			Joins("JOIN assignments ON submissions.assignment_id = assignments.id").
			Where("assignments.course_id = ? AND submissions.grade IS NOT NULL", courseID).
			Select("AVG(submissions.grade)").Row().Scan(&avgGrade)
		if err == nil {
			stats.AverageGrade = avgGrade
		}
	}

	c.JSON(http.StatusOK, stats)
}
