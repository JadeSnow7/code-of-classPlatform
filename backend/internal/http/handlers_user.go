package http

import (
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type userHandlers struct {
	db *gorm.DB
}

func newUserHandlers(db *gorm.DB) *userHandlers {
	return &userHandlers{db: db}
}

// Activity represents a recent activity item
type Activity struct {
	Type      string    `json:"type"` // "assignment_submit", "quiz_submit"
	Title     string    `json:"title"`
	CourseID  uint      `json:"course_id"`
	Score     *float64  `json:"score,omitempty"`
	MaxScore  *float64  `json:"max_score,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// PendingItem represents a pending task
type PendingItem struct {
	Type     string    `json:"type"` // "assignment", "quiz"
	ID       uint      `json:"id"`
	Title    string    `json:"title"`
	CourseID uint      `json:"course_id"`
	Deadline time.Time `json:"deadline"`
}

// StudentStats represents statistics for a student
type StudentStats struct {
	CoursesCount         int           `json:"courses_count"`
	AssignmentsTotal     int           `json:"assignments_total"`
	AssignmentsSubmitted int           `json:"assignments_submitted"`
	QuizzesTaken         int           `json:"quizzes_taken"`
	QuizzesAvgScore      float64       `json:"quizzes_avg_score"`
	PendingCount         int           `json:"pending_count"`
	Pending              []PendingItem `json:"pending"`
	RecentActivity       []Activity    `json:"recent_activity"`
}

// TeacherStats represents statistics for a teacher
type TeacherStats struct {
	CoursesCreated     int        `json:"courses_created"`
	AssignmentsCreated int        `json:"assignments_created"`
	QuizzesCreated     int        `json:"quizzes_created"`
	PendingGrades      int        `json:"pending_grades"`
	RecentSubmissions  []Activity `json:"recent_submissions"`
}

// GetStats returns user statistics based on role
func (h *userHandlers) GetStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	switch u.Role {
	case "student":
		stats := h.getStudentStats(u.ID)
		c.JSON(http.StatusOK, stats)
	case "teacher", "admin", "assistant":
		stats := h.getTeacherStats(u.ID, u.Role)
		c.JSON(http.StatusOK, stats)
	default:
		c.JSON(http.StatusOK, gin.H{})
	}
}

func (h *userHandlers) getStudentStats(userID uint) StudentStats {
	stats := StudentStats{
		Pending:        []PendingItem{},
		RecentActivity: []Activity{},
	}

	// Count courses (all courses for now, since no enrollment table)
	var coursesCount int64
	h.db.Model(&models.Course{}).Count(&coursesCount)
	stats.CoursesCount = int(coursesCount)

	// Count assignments
	var assignmentsTotal int64
	h.db.Model(&models.Assignment{}).Count(&assignmentsTotal)
	stats.AssignmentsTotal = int(assignmentsTotal)

	// Count submitted assignments
	var assignmentsSubmitted int64
	h.db.Model(&models.Submission{}).
		Where("student_id = ?", userID).
		Distinct("assignment_id").
		Count(&assignmentsSubmitted)
	stats.AssignmentsSubmitted = int(assignmentsSubmitted)

	// Quiz statistics
	var quizAttempts []models.QuizAttempt
	h.db.Where("student_id = ? AND submitted_at IS NOT NULL", userID).Find(&quizAttempts)

	stats.QuizzesTaken = len(quizAttempts)
	if stats.QuizzesTaken > 0 {
		var totalScore float64
		for _, a := range quizAttempts {
			if a.MaxScore > 0 && a.Score != nil {
				totalScore += float64(*a.Score) / float64(a.MaxScore) * 100
			}
		}
		stats.QuizzesAvgScore = totalScore / float64(stats.QuizzesTaken)
	}

	// Pending assignments (not submitted, deadline in future)
	var assignments []models.Assignment
	h.db.Where("deadline > ?", time.Now()).Find(&assignments)

	var submittedAssignmentIDs []uint
	h.db.Model(&models.Submission{}).
		Where("student_id = ?", userID).
		Pluck("assignment_id", &submittedAssignmentIDs)

	submittedMap := make(map[uint]bool)
	for _, id := range submittedAssignmentIDs {
		submittedMap[id] = true
	}

	for _, a := range assignments {
		if !submittedMap[a.ID] && a.Deadline != nil {
			stats.Pending = append(stats.Pending, PendingItem{
				Type:     "assignment",
				ID:       a.ID,
				Title:    a.Title,
				CourseID: a.CourseID,
				Deadline: *a.Deadline,
			})
		}
	}

	// Pending quizzes (published, not ended, not submitted or can retry)
	var quizzes []models.Quiz
	h.db.Where("is_published = ? AND end_time > ?", true, time.Now()).Find(&quizzes)

	for _, q := range quizzes {
		var attemptCount int64
		h.db.Model(&models.QuizAttempt{}).
			Where("quiz_id = ? AND student_id = ? AND submitted_at IS NOT NULL", q.ID, userID).
			Count(&attemptCount)

		if int(attemptCount) < q.MaxAttempts && q.EndTime != nil {
			stats.Pending = append(stats.Pending, PendingItem{
				Type:     "quiz",
				ID:       q.ID,
				Title:    q.Title,
				CourseID: q.CourseID,
				Deadline: *q.EndTime,
			})
		}
	}

	// Sort pending by deadline
	sort.Slice(stats.Pending, func(i, j int) bool {
		return stats.Pending[i].Deadline.Before(stats.Pending[j].Deadline)
	})

	stats.PendingCount = len(stats.Pending)
	if len(stats.Pending) > 5 {
		stats.Pending = stats.Pending[:5]
	}

	// Recent activity - assignment submissions
	var submissions []models.Submission
	h.db.Where("student_id = ?", userID).
		Order("created_at DESC").
		Limit(10).
		Find(&submissions)

	for _, s := range submissions {
		var assignment models.Assignment
		if h.db.First(&assignment, s.AssignmentID).Error == nil {
			var score, maxScore float64
			if s.Grade != nil {
				score = float64(*s.Grade)
			}
			maxScore = 100
			stats.RecentActivity = append(stats.RecentActivity, Activity{
				Type:      "assignment_submit",
				Title:     assignment.Title,
				CourseID:  assignment.CourseID,
				Score:     &score,
				MaxScore:  &maxScore,
				CreatedAt: s.CreatedAt,
			})
		}
	}

	// Recent activity - quiz attempts
	for _, a := range quizAttempts {
		var quiz models.Quiz
		if h.db.First(&quiz, a.QuizID).Error == nil && a.SubmittedAt != nil {
			var score, maxScore float64
			if a.Score != nil {
				score = float64(*a.Score)
			}
			maxScore = float64(a.MaxScore)
			stats.RecentActivity = append(stats.RecentActivity, Activity{
				Type:      "quiz_submit",
				Title:     quiz.Title,
				CourseID:  quiz.CourseID,
				Score:     &score,
				MaxScore:  &maxScore,
				CreatedAt: *a.SubmittedAt,
			})
		}
	}

	// Sort by time and limit
	sort.Slice(stats.RecentActivity, func(i, j int) bool {
		return stats.RecentActivity[i].CreatedAt.After(stats.RecentActivity[j].CreatedAt)
	})
	if len(stats.RecentActivity) > 10 {
		stats.RecentActivity = stats.RecentActivity[:10]
	}

	return stats
}

func (h *userHandlers) getTeacherStats(userID uint, role string) TeacherStats {
	stats := TeacherStats{
		RecentSubmissions: []Activity{},
	}

	// For admin, count all; for teacher, count own courses
	var coursesCount int64
	courseQuery := h.db.Model(&models.Course{})
	if role == "teacher" {
		courseQuery = courseQuery.Where("teacher_id = ?", userID)
	}
	courseQuery.Count(&coursesCount)
	stats.CoursesCreated = int(coursesCount)

	// Get course IDs for this teacher
	var courseIDs []uint
	if role == "teacher" {
		h.db.Model(&models.Course{}).Where("teacher_id = ?", userID).Pluck("id", &courseIDs)
	} else {
		h.db.Model(&models.Course{}).Pluck("id", &courseIDs)
	}

	if len(courseIDs) > 0 {
		// Count assignments in these courses
		var assignmentsCount int64
		h.db.Model(&models.Assignment{}).
			Where("course_id IN ?", courseIDs).
			Count(&assignmentsCount)
		stats.AssignmentsCreated = int(assignmentsCount)

		// Count quizzes in these courses
		var quizzesCount int64
		h.db.Model(&models.Quiz{}).
			Where("course_id IN ?", courseIDs).
			Count(&quizzesCount)
		stats.QuizzesCreated = int(quizzesCount)

		// Count pending grades (submissions without grade)
		var pendingGrades int64
		h.db.Model(&models.Submission{}).
			Joins("JOIN assignments ON assignments.id = submissions.assignment_id").
			Where("assignments.course_id IN ? AND submissions.grade IS NULL", courseIDs).
			Count(&pendingGrades)
		stats.PendingGrades = int(pendingGrades)

		// Recent submissions for grading
		var submissions []models.Submission
		h.db.Joins("JOIN assignments ON assignments.id = submissions.assignment_id").
			Where("assignments.course_id IN ?", courseIDs).
			Order("submissions.created_at DESC").
			Limit(10).
			Find(&submissions)

		for _, s := range submissions {
			var assignment models.Assignment
			if h.db.First(&assignment, s.AssignmentID).Error == nil {
				var student models.User
				h.db.First(&student, s.StudentID)
				stats.RecentSubmissions = append(stats.RecentSubmissions, Activity{
					Type:      "assignment_submit",
					Title:     assignment.Title + " - " + student.Name,
					CourseID:  assignment.CourseID,
					CreatedAt: s.CreatedAt,
				})
			}
		}
	}

	return stats
}
