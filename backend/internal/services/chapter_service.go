package services

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

var (
	// ErrChapterNotFound indicates the chapter does not exist.
	ErrChapterNotFound = errors.New("chapter not found")
	// ErrCourseNotFound indicates the course does not exist.
	ErrCourseNotFound  = errors.New("course not found")
	// ErrAccessDenied indicates the user is not authorized for the action.
	ErrAccessDenied    = errors.New("access denied")
)

// ChapterService handles chapter CRUD and study tracking.
type ChapterService struct {
	repo *repositories.ChapterRepository
	db   *gorm.DB
}

// NewChapterService builds a ChapterService with its repository.
func NewChapterService(db *gorm.DB) *ChapterService {
	return &ChapterService{
		repo: repositories.NewChapterRepository(db),
		db:   db,
	}
}

// CreateChapterRequest contains the fields required to create a chapter.
type CreateChapterRequest struct {
	CourseID        uint
	Title           string
	OrderNum        int
	Summary         string
	KnowledgePoints string
}

// UpdateChapterRequest contains the fields that can be updated on a chapter.
type UpdateChapterRequest struct {
	Title           *string
	OrderNum        *int
	Summary         *string
	KnowledgePoints *string
}

// AssignmentStats summarizes assignment progress for a student.
type AssignmentStats struct {
	Total        int     `json:"total"`
	Submitted    int     `json:"submitted"`
	Graded       int     `json:"graded"`
	AvgScore     float64 `json:"avg_score"`
	AccuracyRate float64 `json:"accuracy_rate"`
}

// QuizStats summarizes quiz progress for a student.
type QuizStats struct {
	Total     int     `json:"total"`
	Attempted int     `json:"attempted"`
	AvgScore  float64 `json:"avg_score"`
}

// ChapterStudentStats aggregates stats for a single student's chapter view.
type ChapterStudentStats struct {
	ChapterID              uint              `json:"chapter_id"`
	StudyDurationSeconds   int               `json:"study_duration_seconds"`
	StudyDurationFormatted string            `json:"study_duration_formatted"`
	AssignmentStats        AssignmentStats   `json:"assignment_stats"`
	QuizStats              QuizStats         `json:"quiz_stats"`
	Resources              []models.Resource `json:"resources"`
	KnowledgePoints        []string          `json:"knowledge_points"`
}

// StudentProgress captures per-student progress within a chapter.
type StudentProgress struct {
	StudentID          uint    `json:"student_id"`
	StudentName        string  `json:"student_name"`
	StudyDurationSecs  int     `json:"study_duration_seconds"`
	AssignmentAvgScore float64 `json:"assignment_avg_score"`
}

// ChapterClassStats aggregates class-level statistics for a chapter.
type ChapterClassStats struct {
	ChapterID            uint              `json:"chapter_id"`
	TotalStudents        int               `json:"total_students"`
	AvgStudyDurationSecs int               `json:"avg_study_duration_seconds"`
	AssignmentStats      AssignmentStats   `json:"assignment_stats"`
	QuizStats            QuizStats         `json:"quiz_stats"`
	StudentProgress      []StudentProgress `json:"student_progress"`
}

// HasCourseAccess checks whether the user can access a course.
func (s *ChapterService) HasCourseAccess(ctx context.Context, courseID uint, user UserInfo) (bool, error) {
	if user.Role == "admin" {
		return true, nil
	}
	if user.Role == "teacher" {
		course, err := s.repo.FindCourse(ctx, courseID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return false, ErrCourseNotFound
			}
			return false, err
		}
		return course.TeacherID == user.ID, nil
	}
	return s.repo.HasEnrollment(ctx, courseID, user.ID)
}

// CanManageCourse checks whether the user can manage a course.
func (s *ChapterService) CanManageCourse(ctx context.Context, courseID uint, user UserInfo) (bool, error) {
	if user.Role == "admin" {
		return true, nil
	}
	if user.Role != "teacher" {
		return false, nil
	}
	course, err := s.repo.FindCourse(ctx, courseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, ErrCourseNotFound
		}
		return false, err
	}
	return course.TeacherID == user.ID, nil
}

// ListChapters returns all chapters visible to the user.
func (s *ChapterService) ListChapters(ctx context.Context, courseID uint, user UserInfo) ([]models.Chapter, error) {
	ok, err := s.HasCourseAccess(ctx, courseID, user)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrAccessDenied
	}
	return s.repo.ListByCourse(ctx, courseID)
}

// CreateChapter creates a new chapter in a course.
func (s *ChapterService) CreateChapter(ctx context.Context, user UserInfo, req CreateChapterRequest) (*models.Chapter, error) {
	canManage, err := s.CanManageCourse(ctx, req.CourseID, user)
	if err != nil {
		return nil, err
	}
	if !canManage {
		return nil, ErrAccessDenied
	}
	chapter := &models.Chapter{
		CourseID:        req.CourseID,
		Title:           req.Title,
		OrderNum:        req.OrderNum,
		Summary:         req.Summary,
		KnowledgePoints: req.KnowledgePoints,
	}
	if err := s.repo.Create(ctx, chapter); err != nil {
		return nil, err
	}
	return chapter, nil
}

// GetChapter fetches a chapter by ID with access checks.
func (s *ChapterService) GetChapter(ctx context.Context, chapterID uint, user UserInfo) (*models.Chapter, error) {
	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrChapterNotFound
		}
		return nil, err
	}
	ok, err := s.HasCourseAccess(ctx, chapter.CourseID, user)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrAccessDenied
	}
	return chapter, nil
}

// UpdateChapter updates chapter metadata.
func (s *ChapterService) UpdateChapter(ctx context.Context, chapterID uint, user UserInfo, req UpdateChapterRequest) (*models.Chapter, error) {
	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrChapterNotFound
		}
		return nil, err
	}
	canManage, err := s.CanManageCourse(ctx, chapter.CourseID, user)
	if err != nil {
		return nil, err
	}
	if !canManage {
		return nil, ErrAccessDenied
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
		if err := s.repo.Update(ctx, chapter, updates); err != nil {
			return nil, err
		}
	}
	return s.repo.FindChapter(ctx, chapterID)
}

// DeleteChapter removes a chapter and related data.
func (s *ChapterService) DeleteChapter(ctx context.Context, chapterID uint, user UserInfo) error {
	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrChapterNotFound
		}
		return err
	}
	canManage, err := s.CanManageCourse(ctx, chapter.CourseID, user)
	if err != nil {
		return err
	}
	if !canManage {
		return ErrAccessDenied
	}
	if err := s.repo.ClearChapterReferences(ctx, chapterID); err != nil {
		return err
	}
	if err := s.repo.DeleteProgressByChapter(ctx, chapterID); err != nil {
		return err
	}
	return s.repo.Delete(ctx, chapterID)
}

// GetChapterCourseID returns the course ID for a chapter.
func (s *ChapterService) GetChapterCourseID(ctx context.Context, chapterID uint) (uint, error) {
	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrChapterNotFound
		}
		return 0, err
	}
	return chapter.CourseID, nil
}

// RecordHeartbeat updates study duration based on a heartbeat ping.
func (s *ChapterService) RecordHeartbeat(ctx context.Context, chapterID uint, user UserInfo) (bool, int, error) {
	if user.Role != "student" {
		return false, 0, ErrAccessDenied
	}

	courseID, err := s.GetChapterCourseID(ctx, chapterID)
	if err != nil {
		return false, 0, err
	}
	ok, err := s.HasCourseAccess(ctx, courseID, user)
	if err != nil {
		return false, 0, err
	}
	if !ok {
		return false, 0, ErrAccessDenied
	}

	const heartbeatInterval = 30 // seconds
	const maxGap = 35            // seconds

	now := time.Now()

	var progress models.ChapterProgress
	err = s.db.WithContext(ctx).Where("chapter_id = ? AND student_id = ?", chapterID, user.ID).First(&progress).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		progress = models.ChapterProgress{
			ChapterID:            chapterID,
			StudentID:            user.ID,
			StudyDurationSeconds: 0,
			LastActiveAt:         &now,
		}
		if err := s.db.WithContext(ctx).Create(&progress).Error; err != nil {
			return false, 0, err
		}
		return true, 0, nil
	}
	if err != nil {
		return false, 0, err
	}

	if progress.LastActiveAt != nil {
		gap := now.Sub(*progress.LastActiveAt).Seconds()
		if gap <= float64(maxGap) {
			if err := s.db.WithContext(ctx).Model(&progress).Updates(map[string]interface{}{
				"study_duration_seconds": gorm.Expr("study_duration_seconds + ?", heartbeatInterval),
				"last_active_at":         now,
			}).Error; err != nil {
				return false, 0, err
			}
		} else {
			if err := s.db.WithContext(ctx).Model(&progress).Update("last_active_at", now).Error; err != nil {
				return false, 0, err
			}
		}
	} else {
		if err := s.db.WithContext(ctx).Model(&progress).Update("last_active_at", now).Error; err != nil {
			return false, 0, err
		}
	}

	if err := s.db.WithContext(ctx).First(&progress, progress.ID).Error; err != nil {
		return false, 0, err
	}

	return false, progress.StudyDurationSeconds, nil
}

// GetMyStats returns student-specific stats for a chapter.
func (s *ChapterService) GetMyStats(ctx context.Context, chapterID uint, user UserInfo) (ChapterStudentStats, error) {
	var stats ChapterStudentStats

	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return stats, ErrChapterNotFound
		}
		return stats, err
	}
	ok, err := s.HasCourseAccess(ctx, chapter.CourseID, user)
	if err != nil {
		return stats, err
	}
	if !ok {
		return stats, ErrAccessDenied
	}

	stats = ChapterStudentStats{
		ChapterID:       chapterID,
		KnowledgePoints: []string{},
		Resources:       []models.Resource{},
	}

	if chapter.KnowledgePoints != "" {
		_ = json.Unmarshal([]byte(chapter.KnowledgePoints), &stats.KnowledgePoints)
	}

	var progress models.ChapterProgress
	if err := s.db.WithContext(ctx).Where("chapter_id = ? AND student_id = ?", chapterID, user.ID).First(&progress).Error; err == nil {
		stats.StudyDurationSeconds = progress.StudyDurationSeconds
	}
	stats.StudyDurationFormatted = formatDuration(stats.StudyDurationSeconds)

	_ = s.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Limit(20).Find(&stats.Resources).Error

	var assignments []models.Assignment
	_ = s.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Find(&assignments).Error
	stats.AssignmentStats.Total = len(assignments)

	if len(assignments) > 0 {
		assignmentIDs := make([]uint, len(assignments))
		for i, a := range assignments {
			assignmentIDs[i] = a.ID
		}

		var submittedCount int64
		_ = s.db.WithContext(ctx).Model(&models.Submission{}).
			Where("assignment_id IN ? AND student_id = ?", assignmentIDs, user.ID).
			Count(&submittedCount).Error
		stats.AssignmentStats.Submitted = int(submittedCount)

		var submissions []models.Submission
		_ = s.db.WithContext(ctx).
			Where("assignment_id IN ? AND student_id = ? AND grade IS NOT NULL", assignmentIDs, user.ID).
			Find(&submissions).Error
		stats.AssignmentStats.Graded = len(submissions)

		if len(submissions) > 0 {
			totalScore := 0
			for _, s := range submissions {
				if s.Grade != nil {
					totalScore += *s.Grade
				}
			}
			stats.AssignmentStats.AvgScore = float64(totalScore) / float64(len(submissions))
			stats.AssignmentStats.AccuracyRate = stats.AssignmentStats.AvgScore / 100.0
		}
	}

	var quizzes []models.Quiz
	_ = s.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Find(&quizzes).Error
	stats.QuizStats.Total = len(quizzes)

	if len(quizzes) > 0 {
		quizIDs := make([]uint, len(quizzes))
		for i, q := range quizzes {
			quizIDs[i] = q.ID
		}

		var attempts []models.QuizAttempt
		_ = s.db.WithContext(ctx).
			Where("quiz_id IN ? AND student_id = ? AND submitted_at IS NOT NULL", quizIDs, user.ID).
			Find(&attempts).Error
		stats.QuizStats.Attempted = len(attempts)

		if len(attempts) > 0 {
			var totalScore float64
			count := 0
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

	return stats, nil
}

// GetClassStats returns class-level stats for a chapter.
func (s *ChapterService) GetClassStats(ctx context.Context, chapterID uint, user UserInfo) (ChapterClassStats, error) {
	var response ChapterClassStats

	if user.Role != "admin" && user.Role != "teacher" && user.Role != "assistant" {
		return response, ErrAccessDenied
	}

	chapter, err := s.repo.FindChapter(ctx, chapterID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return response, ErrChapterNotFound
		}
		return response, err
	}

	if user.Role == "teacher" {
		course, err := s.repo.FindCourse(ctx, chapter.CourseID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return response, ErrCourseNotFound
			}
			return response, err
		}
		if course.TeacherID != user.ID {
			return response, ErrAccessDenied
		}
	}

	var enrollments []models.CourseEnrollment
	_ = s.db.WithContext(ctx).Where("course_id = ? AND role = 'student'", chapter.CourseID).Find(&enrollments).Error

	response = ChapterClassStats{
		ChapterID:       chapterID,
		TotalStudents:   len(enrollments),
		StudentProgress: []StudentProgress{},
	}

	var allProgress []models.ChapterProgress
	_ = s.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Find(&allProgress).Error

	totalDuration := 0
	for _, p := range allProgress {
		totalDuration += p.StudyDurationSeconds
	}
	if len(allProgress) > 0 {
		response.AvgStudyDurationSecs = totalDuration / len(allProgress)
	}

	var assignments []models.Assignment
	_ = s.db.WithContext(ctx).Where("chapter_id = ?", chapterID).Find(&assignments).Error
	assignmentIDs := make([]uint, len(assignments))
	for i, a := range assignments {
		assignmentIDs[i] = a.ID
	}

	for _, p := range allProgress {
		var userModel models.User
		if err := s.db.WithContext(ctx).First(&userModel, p.StudentID).Error; err == nil {
			sp := StudentProgress{
				StudentID:         p.StudentID,
				StudentName:       userModel.Name,
				StudyDurationSecs: p.StudyDurationSeconds,
			}

			if len(assignmentIDs) > 0 {
				var submissions []models.Submission
				_ = s.db.WithContext(ctx).
					Where("assignment_id IN ? AND student_id = ? AND grade IS NOT NULL", assignmentIDs, p.StudentID).
					Find(&submissions).Error
				if len(submissions) > 0 {
					total := 0
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

	return response, nil
}

func formatDuration(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	if hours > 0 {
		return strconv.Itoa(hours) + "小时" + strconv.Itoa(minutes) + "分钟"
	}
	return strconv.Itoa(minutes) + "分钟"
}
