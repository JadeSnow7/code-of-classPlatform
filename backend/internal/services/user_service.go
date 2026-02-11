package services

import (
	"context"
	"sort"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type userService struct {
	userRepo       repositories.UserRepository
	courseRepo     repositories.CourseRepository
	assignmentRepo repositories.AssignmentRepository
	quizRepo       repositories.QuizRepository
}

// NewUserService 创建用户服务实例
func NewUserService(
	userRepo repositories.UserRepository,
	courseRepo repositories.CourseRepository,
	assignmentRepo repositories.AssignmentRepository,
	quizRepo repositories.QuizRepository,
) UserService {
	return &userService{
		userRepo:       userRepo,
		courseRepo:     courseRepo,
		assignmentRepo: assignmentRepo,
		quizRepo:       quizRepo,
	}
}

func (s *userService) GetStats(ctx context.Context, userID uint) (map[string]interface{}, error) {
	stats, err := s.GetStudentStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"enrolled_courses":      stats.CoursesCount,
		"submitted_assignments": stats.AssignmentsSubmitted,
		"completed_quizzes":     stats.QuizzesTaken,
	}, nil
}

func (s *userService) GetStudentStats(ctx context.Context, userID uint) (StudentStats, error) {
	stats := StudentStats{
		Pending:        []PendingItem{},
		RecentActivity: []Activity{},
	}

	coursesCount, err := s.courseRepo.Count(ctx)
	if err != nil {
		return stats, err
	}
	stats.CoursesCount = int(coursesCount)

	assignmentsTotal, err := s.assignmentRepo.Count(ctx)
	if err != nil {
		return stats, err
	}
	stats.AssignmentsTotal = int(assignmentsTotal)

	submittedAssignmentIDs, err := s.assignmentRepo.FindSubmittedAssignmentIDsByStudent(ctx, userID)
	if err != nil {
		return stats, err
	}
	stats.AssignmentsSubmitted = len(submittedAssignmentIDs)

	quizAttempts, err := s.quizRepo.FindSubmittedAttemptsByStudent(ctx, userID)
	if err != nil {
		return stats, err
	}
	stats.QuizzesTaken = len(quizAttempts)
	if stats.QuizzesTaken > 0 {
		var totalScore float64
		for _, attempt := range quizAttempts {
			if attempt.MaxScore > 0 && attempt.Score != nil {
				totalScore += float64(*attempt.Score) / float64(attempt.MaxScore) * 100
			}
		}
		stats.QuizzesAvgScore = totalScore / float64(stats.QuizzesTaken)
	}

	submittedMap := make(map[uint]bool, len(submittedAssignmentIDs))
	for _, id := range submittedAssignmentIDs {
		submittedMap[id] = true
	}

	upcomingAssignments, err := s.assignmentRepo.FindUpcoming(ctx, time.Now())
	if err != nil {
		return stats, err
	}
	for _, assignment := range upcomingAssignments {
		if !submittedMap[assignment.ID] && assignment.Deadline != nil {
			stats.Pending = append(stats.Pending, PendingItem{
				Type:     "assignment",
				ID:       assignment.ID,
				Title:    assignment.Title,
				CourseID: assignment.CourseID,
				Deadline: *assignment.Deadline,
			})
		}
	}

	openQuizzes, err := s.quizRepo.FindPublishedActive(ctx, time.Now())
	if err != nil {
		return stats, err
	}
	for _, quiz := range openQuizzes {
		submittedCount, countErr := s.quizRepo.CountSubmittedAttemptsByQuizAndStudent(ctx, quiz.ID, userID)
		if countErr != nil {
			return stats, countErr
		}
		if int(submittedCount) < quiz.MaxAttempts && quiz.EndTime != nil {
			stats.Pending = append(stats.Pending, PendingItem{
				Type:     "quiz",
				ID:       quiz.ID,
				Title:    quiz.Title,
				CourseID: quiz.CourseID,
				Deadline: *quiz.EndTime,
			})
		}
	}

	sort.Slice(stats.Pending, func(i, j int) bool {
		return stats.Pending[i].Deadline.Before(stats.Pending[j].Deadline)
	})
	stats.PendingCount = len(stats.Pending)
	if len(stats.Pending) > 5 {
		stats.Pending = stats.Pending[:5]
	}

	recentSubmissions, err := s.assignmentRepo.FindRecentSubmissionsByStudent(ctx, userID, 10)
	if err != nil {
		return stats, err
	}
	for _, submission := range recentSubmissions {
		assignment, assErr := s.assignmentRepo.FindAssignment(ctx, submission.AssignmentID)
		if assErr != nil {
			continue
		}
		var score, maxScore float64
		if submission.Grade != nil {
			score = float64(*submission.Grade)
		}
		maxScore = 100
		stats.RecentActivity = append(stats.RecentActivity, Activity{
			Type:      "assignment_submit",
			Title:     assignment.Title,
			CourseID:  assignment.CourseID,
			Score:     &score,
			MaxScore:  &maxScore,
			CreatedAt: submission.CreatedAt,
		})
	}

	for _, attempt := range quizAttempts {
		quiz, quizErr := s.quizRepo.FindByID(ctx, attempt.QuizID)
		if quizErr != nil || attempt.SubmittedAt == nil {
			continue
		}
		var score, maxScore float64
		if attempt.Score != nil {
			score = float64(*attempt.Score)
		}
		maxScore = float64(attempt.MaxScore)
		stats.RecentActivity = append(stats.RecentActivity, Activity{
			Type:      "quiz_submit",
			Title:     quiz.Title,
			CourseID:  quiz.CourseID,
			Score:     &score,
			MaxScore:  &maxScore,
			CreatedAt: *attempt.SubmittedAt,
		})
	}

	sort.Slice(stats.RecentActivity, func(i, j int) bool {
		return stats.RecentActivity[i].CreatedAt.After(stats.RecentActivity[j].CreatedAt)
	})
	if len(stats.RecentActivity) > 10 {
		stats.RecentActivity = stats.RecentActivity[:10]
	}

	return stats, nil
}

func (s *userService) GetTeacherStats(ctx context.Context, userID uint, role string) (TeacherStats, error) {
	stats := TeacherStats{
		RecentSubmissions: []Activity{},
	}

	var courseIDs []uint
	if role == "teacher" {
		courses, err := s.courseRepo.FindByTeacherID(ctx, userID)
		if err != nil {
			return stats, err
		}
		for _, course := range courses {
			courseIDs = append(courseIDs, course.ID)
		}
	} else {
		courses, err := s.courseRepo.FindAll(ctx)
		if err != nil {
			return stats, err
		}
		for _, course := range courses {
			courseIDs = append(courseIDs, course.ID)
		}
	}
	stats.CoursesCreated = len(courseIDs)

	for _, courseID := range courseIDs {
		assignmentsCount, err := s.assignmentRepo.CountAssignmentsByCourse(ctx, courseID)
		if err != nil {
			return stats, err
		}
		stats.AssignmentsCreated += int(assignmentsCount)

		quizzes, err := s.quizRepo.ListByCourse(ctx, courseID, false)
		if err != nil {
			return stats, err
		}
		stats.QuizzesCreated += len(quizzes)

		pendingGrades, err := s.assignmentRepo.CountPendingGradingByCourse(ctx, courseID)
		if err != nil {
			return stats, err
		}
		stats.PendingGrades += int(pendingGrades)
	}

	recentSubmissions, err := s.assignmentRepo.FindRecentSubmissionsByCourseIDs(ctx, courseIDs, 10)
	if err != nil {
		return stats, err
	}
	for _, submission := range recentSubmissions {
		assignment, assErr := s.assignmentRepo.FindAssignment(ctx, submission.AssignmentID)
		if assErr != nil {
			continue
		}
		student, stuErr := s.userRepo.FindByID(ctx, submission.StudentID)
		if stuErr != nil {
			continue
		}
		name := student.Name
		if name == "" {
			name = student.Username
		}
		stats.RecentSubmissions = append(stats.RecentSubmissions, Activity{
			Type:      "assignment_submit",
			Title:     assignment.Title + " - " + name,
			CourseID:  assignment.CourseID,
			CreatedAt: submission.CreatedAt,
		})
	}

	return stats, nil
}
