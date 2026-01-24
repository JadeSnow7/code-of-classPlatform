package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type chapterHandlers struct {
	db *gorm.DB
}

func newChapterHandlers(db *gorm.DB) *chapterHandlers {
	return &chapterHandlers{db: db}
}

// ============ Request/Response Types ============

type createChapterRequest struct {
	CourseID        uint   `json:"course_id" binding:"required"`
	Title           string `json:"title" binding:"required"`
	OrderNum        int    `json:"order_num"`
	Summary         string `json:"summary"`
	KnowledgePoints string `json:"knowledge_points"` // JSON array string
}

type updateChapterRequest struct {
	Title           *string `json:"title"`
	OrderNum        *int    `json:"order_num"`
	Summary         *string `json:"summary"`
	KnowledgePoints *string `json:"knowledge_points"`
}

type AssignmentStats struct {
	Total        int     `json:"total"`
	Submitted    int     `json:"submitted"`
	Graded       int     `json:"graded"`
	AvgScore     float64 `json:"avg_score"`
	AccuracyRate float64 `json:"accuracy_rate"`
}

type QuizStats struct {
	Total     int     `json:"total"`
	Attempted int     `json:"attempted"`
	AvgScore  float64 `json:"avg_score"`
}

type ChapterStudentStats struct {
	ChapterID              uint              `json:"chapter_id"`
	StudyDurationSeconds   int               `json:"study_duration_seconds"`
	StudyDurationFormatted string            `json:"study_duration_formatted"`
	AssignmentStats        AssignmentStats   `json:"assignment_stats"`
	QuizStats              QuizStats         `json:"quiz_stats"`
	Resources              []models.Resource `json:"resources"`
	KnowledgePoints        []string          `json:"knowledge_points"`
}

// ============ Helper Functions ============

// checkCourseMembership verifies user has access to the course
func (h *chapterHandlers) checkCourseMembership(c *gin.Context, courseID uint) bool {
	u, ok := middleware.GetUser(c)
	if !ok {
		return false
	}

	// Admin has access to all
	if u.Role == "admin" {
		return true
	}

	// Teacher has access to their own courses
	if u.Role == "teacher" {
		var course models.Course
		if h.db.First(&course, courseID).Error == nil && course.TeacherID == u.ID {
			return true
		}
	}

	// Students/Assistants: check enrollment
	var enrollment models.CourseEnrollment
	err := h.db.Where("course_id = ? AND user_id = ?", courseID, u.ID).First(&enrollment).Error
	return err == nil
}

// getChapterCourseID returns the course ID for a chapter
func (h *chapterHandlers) getChapterCourseID(chapterID uint) (uint, error) {
	var chapter models.Chapter
	if err := h.db.First(&chapter, chapterID).Error; err != nil {
		return 0, err
	}
	return chapter.CourseID, nil
}

// formatDuration converts seconds to human-readable string
func formatDuration(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	if hours > 0 {
		return strconv.Itoa(hours) + "小时" + strconv.Itoa(minutes) + "分钟"
	}
	return strconv.Itoa(minutes) + "分钟"
}

// ============ CRUD Handlers ============

// ListChapters returns all chapters for a course
func (h *chapterHandlers) ListChapters(c *gin.Context) {
	courseIDStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(courseIDStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	if !h.checkCourseMembership(c, uint(courseID)) {
		respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
		return
	}

	var chapters []models.Chapter
	if err := h.db.Where("course_id = ?", courseID).
		Order("order_num ASC, id ASC").
		Find(&chapters).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "LIST_CHAPTERS_FAILED", "list chapters failed", nil)
		return
	}

	respondOK(c, chapters)
}

// CreateChapter creates a new chapter
func (h *chapterHandlers) CreateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	var req createChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
		return
	}

	// Verify user can write to this course
	if u.Role != "admin" {
		var course models.Course
		if err := h.db.First(&course, req.CourseID).Error; err != nil {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if u.Role == "teacher" && course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	}

	chapter := models.Chapter{
		CourseID:        req.CourseID,
		Title:           req.Title,
		OrderNum:        req.OrderNum,
		Summary:         req.Summary,
		KnowledgePoints: req.KnowledgePoints,
	}

	if err := h.db.Create(&chapter).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "CREATE_CHAPTER_FAILED", "create chapter failed", nil)
		return
	}

	respondOK(c, chapter)
}

// GetChapter returns a single chapter
func (h *chapterHandlers) GetChapter(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var chapter models.Chapter
	if err := h.db.First(&chapter, id).Error; err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	if !h.checkCourseMembership(c, chapter.CourseID) {
		respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
		return
	}

	respondOK(c, chapter)
}

// UpdateChapter updates a chapter
func (h *chapterHandlers) UpdateChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var chapter models.Chapter
	if err := h.db.First(&chapter, id).Error; err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	// Verify write permission
	if u.Role != "admin" {
		var course models.Course
		if err := h.db.First(&course, chapter.CourseID).Error; err != nil {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if u.Role == "teacher" && course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	}

	var req updateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
		return
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.OrderNum != nil {
		updates["order_num"] = *req.OrderNum
	}
	if req.Summary != nil {
		updates["summary"] = *req.Summary
	}
	if req.KnowledgePoints != nil {
		updates["knowledge_points"] = *req.KnowledgePoints
	}

	if len(updates) > 0 {
		if err := h.db.Model(&chapter).Updates(updates).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "UPDATE_CHAPTER_FAILED", "update chapter failed", nil)
			return
		}
	}

	h.db.First(&chapter, id)
	respondOK(c, chapter)
}

// DeleteChapter deletes a chapter
func (h *chapterHandlers) DeleteChapter(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var chapter models.Chapter
	if err := h.db.First(&chapter, id).Error; err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	// Verify write permission
	if u.Role != "admin" {
		var course models.Course
		if err := h.db.First(&course, chapter.CourseID).Error; err != nil {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if u.Role == "teacher" && course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	}

	// Set chapter_id to NULL for related resources and assignments
	h.db.Model(&models.Resource{}).Where("chapter_id = ?", id).Update("chapter_id", nil)
	h.db.Model(&models.Assignment{}).Where("chapter_id = ?", id).Update("chapter_id", nil)
	h.db.Model(&models.Quiz{}).Where("chapter_id = ?", id).Update("chapter_id", nil)

	// Delete progress records
	h.db.Where("chapter_id = ?", id).Delete(&models.ChapterProgress{})

	// Delete chapter
	if err := h.db.Delete(&chapter).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "DELETE_CHAPTER_FAILED", "delete chapter failed", nil)
		return
	}

	respondOK(c, gin.H{"message": "deleted"})
}

// ============ Heartbeat Handler ============

// Heartbeat records student study time with idempotent logic
func (h *chapterHandlers) Heartbeat(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	// Only students can record study time
	if u.Role != "student" {
		respondError(c, http.StatusForbidden, "ROLE_NOT_ALLOWED", "only students can record study time", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	courseID, err := h.getChapterCourseID(uint(chapterID))
	if err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	if !h.checkCourseMembership(c, courseID) {
		respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
		return
	}

	const heartbeatInterval = 30 // seconds
	const maxGap = 35            // seconds

	now := time.Now()

	// Get or create progress record
	var progress models.ChapterProgress
	err = h.db.Where("chapter_id = ? AND student_id = ?", chapterID, u.ID).First(&progress).Error

	if err == gorm.ErrRecordNotFound {
		// First visit: create record
		progress = models.ChapterProgress{
			ChapterID:            uint(chapterID),
			StudentID:            u.ID,
			StudyDurationSeconds: 0,
			LastActiveAt:         &now,
		}
		h.db.Create(&progress)
		respondOK(c, gin.H{"message": "started", "duration": 0})
		return
	} else if err != nil {
		respondError(c, http.StatusInternalServerError, "DATABASE_ERROR", "database error", nil)
		return
	}

	// Check time gap for idempotency
	if progress.LastActiveAt != nil {
		gap := now.Sub(*progress.LastActiveAt).Seconds()
		if gap <= float64(maxGap) {
			// Within valid interval: add fixed increment atomically
			h.db.Model(&progress).Updates(map[string]interface{}{
				"study_duration_seconds": gorm.Expr("study_duration_seconds + ?", heartbeatInterval),
				"last_active_at":         now,
			})
		} else {
			// New session: only update last_active_at, don't add time
			h.db.Model(&progress).Update("last_active_at", now)
		}
	} else {
		h.db.Model(&progress).Update("last_active_at", now)
	}

	// Reload to get updated value
	h.db.First(&progress, progress.ID)
	respondOK(c, gin.H{
		"message":  "recorded",
		"duration": progress.StudyDurationSeconds,
	})
}

// ============ Stats Handlers ============

// GetMyStats returns student's personal stats for a chapter
func (h *chapterHandlers) GetMyStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var chapter models.Chapter
	if err := h.db.First(&chapter, chapterID).Error; err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	if !h.checkCourseMembership(c, chapter.CourseID) {
		respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
		return
	}

	stats := ChapterStudentStats{
		ChapterID:       uint(chapterID),
		KnowledgePoints: []string{},
		Resources:       []models.Resource{},
	}

	// Parse knowledge points
	if chapter.KnowledgePoints != "" {
		json.Unmarshal([]byte(chapter.KnowledgePoints), &stats.KnowledgePoints)
	}

	// Get study duration
	var progress models.ChapterProgress
	if err := h.db.Where("chapter_id = ? AND student_id = ?", chapterID, u.ID).First(&progress).Error; err == nil {
		stats.StudyDurationSeconds = progress.StudyDurationSeconds
	}
	stats.StudyDurationFormatted = formatDuration(stats.StudyDurationSeconds)

	// Get resources (limit 20)
	h.db.Where("chapter_id = ?", chapterID).Limit(20).Find(&stats.Resources)

	// Calculate assignment stats
	var assignments []models.Assignment
	h.db.Where("chapter_id = ?", chapterID).Find(&assignments)
	stats.AssignmentStats.Total = len(assignments)

	if len(assignments) > 0 {
		assignmentIDs := make([]uint, len(assignments))
		for i, a := range assignments {
			assignmentIDs[i] = a.ID
		}

		// Count submitted
		var submittedCount int64
		h.db.Model(&models.Submission{}).
			Where("assignment_id IN ? AND student_id = ?", assignmentIDs, u.ID).
			Count(&submittedCount)
		stats.AssignmentStats.Submitted = int(submittedCount)

		// Count graded and calculate avg score
		var submissions []models.Submission
		h.db.Where("assignment_id IN ? AND student_id = ? AND grade IS NOT NULL", assignmentIDs, u.ID).
			Find(&submissions)
		stats.AssignmentStats.Graded = len(submissions)

		if len(submissions) > 0 {
			var totalScore int
			for _, s := range submissions {
				if s.Grade != nil {
					totalScore += *s.Grade
				}
			}
			stats.AssignmentStats.AvgScore = float64(totalScore) / float64(len(submissions))
			stats.AssignmentStats.AccuracyRate = stats.AssignmentStats.AvgScore / 100.0
		}
	}

	// Calculate quiz stats
	var quizzes []models.Quiz
	h.db.Where("chapter_id = ?", chapterID).Find(&quizzes)
	stats.QuizStats.Total = len(quizzes)

	if len(quizzes) > 0 {
		quizIDs := make([]uint, len(quizzes))
		for i, q := range quizzes {
			quizIDs[i] = q.ID
		}

		var attempts []models.QuizAttempt
		h.db.Where("quiz_id IN ? AND student_id = ? AND submitted_at IS NOT NULL", quizIDs, u.ID).
			Find(&attempts)
		stats.QuizStats.Attempted = len(attempts)

		if len(attempts) > 0 {
			var totalScore float64
			var count int
			for _, a := range attempts {
				if a.Score != nil && a.MaxScore > 0 {
					totalScore += float64(*a.Score) / float64(a.MaxScore) * 100
					count++
				}
			}
			if count > 0 {
				stats.QuizStats.AvgScore = totalScore / float64(count)
			}
		}
	}

	respondOK(c, stats)
}

// GetClassStats returns class-wide stats for a chapter (teachers only)
func (h *chapterHandlers) GetClassStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	// Only teachers/admin can view class stats
	if u.Role != "admin" && u.Role != "teacher" && u.Role != "assistant" {
		respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
		return
	}

	idStr := c.Param("id")
	chapterID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID", "invalid id", nil)
		return
	}

	var chapter models.Chapter
	if err := h.db.First(&chapter, chapterID).Error; err != nil {
		respondError(c, http.StatusNotFound, "CHAPTER_NOT_FOUND", "chapter not found", nil)
		return
	}

	// Verify teacher owns this course
	if u.Role == "teacher" {
		var course models.Course
		if err := h.db.First(&course, chapter.CourseID).Error; err != nil || course.TeacherID != u.ID {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
	}

	// Get all enrolled students
	var enrollments []models.CourseEnrollment
	h.db.Where("course_id = ? AND role = 'student'", chapter.CourseID).Find(&enrollments)

	type StudentProgress struct {
		StudentID          uint    `json:"student_id"`
		StudentName        string  `json:"student_name"`
		StudyDurationSecs  int     `json:"study_duration_seconds"`
		AssignmentAvgScore float64 `json:"assignment_avg_score"`
	}

	response := struct {
		ChapterID            uint              `json:"chapter_id"`
		TotalStudents        int               `json:"total_students"`
		AvgStudyDurationSecs int               `json:"avg_study_duration_seconds"`
		AssignmentStats      AssignmentStats   `json:"assignment_stats"`
		QuizStats            QuizStats         `json:"quiz_stats"`
		StudentProgress      []StudentProgress `json:"student_progress"`
	}{
		ChapterID:       uint(chapterID),
		TotalStudents:   len(enrollments),
		StudentProgress: []StudentProgress{},
	}

	// Get all progress records for this chapter
	var allProgress []models.ChapterProgress
	h.db.Where("chapter_id = ?", chapterID).Find(&allProgress)

	totalDuration := 0
	for _, p := range allProgress {
		totalDuration += p.StudyDurationSeconds
	}
	if len(allProgress) > 0 {
		response.AvgStudyDurationSecs = totalDuration / len(allProgress)
	}

	// Get student details
	for _, p := range allProgress {
		var user models.User
		if h.db.First(&user, p.StudentID).Error == nil {
			sp := StudentProgress{
				StudentID:         p.StudentID,
				StudentName:       user.Name,
				StudyDurationSecs: p.StudyDurationSeconds,
			}

			// Calculate student's assignment avg score
			var assignments []models.Assignment
			h.db.Where("chapter_id = ?", chapterID).Find(&assignments)
			if len(assignments) > 0 {
				assignmentIDs := make([]uint, len(assignments))
				for i, a := range assignments {
					assignmentIDs[i] = a.ID
				}
				var submissions []models.Submission
				h.db.Where("assignment_id IN ? AND student_id = ? AND grade IS NOT NULL", assignmentIDs, p.StudentID).Find(&submissions)
				if len(submissions) > 0 {
					var total int
					for _, s := range submissions {
						if s.Grade != nil {
							total += *s.Grade
						}
					}
					sp.AssignmentAvgScore = float64(total) / float64(len(submissions))
				}
			}
			response.StudentProgress = append(response.StudentProgress, sp)
		}
	}

	respondOK(c, response)
}
