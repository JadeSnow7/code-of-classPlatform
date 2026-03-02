package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

const (
	knowledgeVisibilityStudentPublic  = "student_public"
	knowledgeVisibilityTeacherPrivate = "teacher_private"
)

type knowledgeExportService struct {
	db *gorm.DB
}

// NewKnowledgeExportService creates a read-only content export service for AI sync.
func NewKnowledgeExportService(db *gorm.DB) KnowledgeExportService {
	return &knowledgeExportService{db: db}
}

func (s *knowledgeExportService) Bootstrap(ctx context.Context, courseID *uint) (KnowledgeExportBatch, error) {
	items, err := s.collectAll(ctx, courseID)
	if err != nil {
		return KnowledgeExportBatch{}, err
	}
	return KnowledgeExportBatch{
		Cursor: buildKnowledgeCursor(items, time.Now().UTC()),
		Items:  items,
	}, nil
}

func (s *knowledgeExportService) Changes(ctx context.Context, cursor string, courseID *uint) (KnowledgeExportBatch, error) {
	since, err := parseKnowledgeCursor(cursor)
	if err != nil {
		return KnowledgeExportBatch{}, err
	}
	items, err := s.collectChanges(ctx, since, courseID)
	if err != nil {
		return KnowledgeExportBatch{}, err
	}
	return KnowledgeExportBatch{
		Cursor: buildKnowledgeCursor(items, since),
		Items:  items,
	}, nil
}

func (s *knowledgeExportService) Document(ctx context.Context, kind string, id uint) (*KnowledgeExportItem, error) {
	normalizedKind := strings.TrimSpace(strings.ToLower(kind))
	switch normalizedKind {
	case "chapter":
		var chapter models.Chapter
		if err := s.db.WithContext(ctx).Unscoped().First(&chapter, id).Error; err != nil {
			return nil, err
		}
		item := chapterToKnowledgeItem(chapter)
		return &item, nil
	case "resource":
		var resource models.Resource
		if err := s.db.WithContext(ctx).Unscoped().First(&resource, id).Error; err != nil {
			return nil, err
		}
		item := resourceToKnowledgeItem(resource)
		return &item, nil
	case "assignment":
		var assignment models.Assignment
		if err := s.db.WithContext(ctx).Unscoped().First(&assignment, id).Error; err != nil {
			return nil, err
		}
		item := assignmentToKnowledgeItem(assignment)
		return &item, nil
	case "quiz_question":
		var question models.Question
		if err := s.db.WithContext(ctx).Unscoped().First(&question, id).Error; err != nil {
			return nil, err
		}
		quiz, err := s.findQuizUnscoped(ctx, question.QuizID)
		if err != nil {
			return nil, err
		}
		item := quizQuestionToKnowledgeItem(*quiz, question)
		return &item, nil
	default:
		return nil, gorm.ErrRecordNotFound
	}
}

func (s *knowledgeExportService) collectAll(ctx context.Context, courseID *uint) ([]KnowledgeExportItem, error) {
	items := make([]KnowledgeExportItem, 0, 64)

	var chapters []models.Chapter
	chapterQuery := s.db.WithContext(ctx).Order("course_id ASC, order_num ASC, id ASC")
	if courseID != nil {
		chapterQuery = chapterQuery.Where("course_id = ?", *courseID)
	}
	if err := chapterQuery.Find(&chapters).Error; err != nil {
		return nil, err
	}
	for _, chapter := range chapters {
		items = append(items, chapterToKnowledgeItem(chapter))
	}

	var resources []models.Resource
	resourceQuery := s.db.WithContext(ctx).Order("course_id ASC, created_at ASC, id ASC")
	if courseID != nil {
		resourceQuery = resourceQuery.Where("course_id = ?", *courseID)
	}
	if err := resourceQuery.Find(&resources).Error; err != nil {
		return nil, err
	}
	for _, resource := range resources {
		items = append(items, resourceToKnowledgeItem(resource))
	}

	var assignments []models.Assignment
	assignmentQuery := s.db.WithContext(ctx).Order("course_id ASC, created_at ASC, id ASC")
	if courseID != nil {
		assignmentQuery = assignmentQuery.Where("course_id = ?", *courseID)
	}
	if err := assignmentQuery.Find(&assignments).Error; err != nil {
		return nil, err
	}
	for _, assignment := range assignments {
		items = append(items, assignmentToKnowledgeItem(assignment))
	}

	questions, quizzesByID, err := s.listQuizQuestions(ctx, courseID, false)
	if err != nil {
		return nil, err
	}
	for _, question := range questions {
		quiz := quizzesByID[question.QuizID]
		items = append(items, quizQuestionToKnowledgeItem(quiz, question))
	}

	sortKnowledgeItems(items)
	return items, nil
}

func (s *knowledgeExportService) collectChanges(ctx context.Context, since time.Time, courseID *uint) ([]KnowledgeExportItem, error) {
	items := make([]KnowledgeExportItem, 0, 32)

	var chapters []models.Chapter
	chapterQuery := s.db.WithContext(ctx).Unscoped().
		Where("updated_at > ? OR deleted_at > ?", since, since).
		Order("updated_at ASC, id ASC")
	if courseID != nil {
		chapterQuery = chapterQuery.Where("course_id = ?", *courseID)
	}
	if err := chapterQuery.Find(&chapters).Error; err != nil {
		return nil, err
	}
	for _, chapter := range chapters {
		items = append(items, chapterToKnowledgeItem(chapter))
	}

	var resources []models.Resource
	resourceQuery := s.db.WithContext(ctx).Unscoped().
		Where("updated_at > ? OR deleted_at > ?", since, since).
		Order("updated_at ASC, id ASC")
	if courseID != nil {
		resourceQuery = resourceQuery.Where("course_id = ?", *courseID)
	}
	if err := resourceQuery.Find(&resources).Error; err != nil {
		return nil, err
	}
	for _, resource := range resources {
		items = append(items, resourceToKnowledgeItem(resource))
	}

	var assignments []models.Assignment
	assignmentQuery := s.db.WithContext(ctx).Unscoped().
		Where("updated_at > ? OR deleted_at > ?", since, since).
		Order("updated_at ASC, id ASC")
	if courseID != nil {
		assignmentQuery = assignmentQuery.Where("course_id = ?", *courseID)
	}
	if err := assignmentQuery.Find(&assignments).Error; err != nil {
		return nil, err
	}
	for _, assignment := range assignments {
		items = append(items, assignmentToKnowledgeItem(assignment))
	}

	questions, quizzesByID, err := s.listQuizQuestions(ctx, courseID, true)
	if err != nil {
		return nil, err
	}
	for _, question := range questions {
		quiz, ok := quizzesByID[question.QuizID]
		if !ok {
			continue
		}
		if question.UpdatedAt.After(since) || question.DeletedAt.Valid || quiz.UpdatedAt.After(since) || quiz.DeletedAt.Valid {
			items = append(items, quizQuestionToKnowledgeItem(quiz, question))
		}
	}

	sortKnowledgeItems(items)
	return dedupeKnowledgeItems(items), nil
}

func (s *knowledgeExportService) listQuizQuestions(ctx context.Context, courseID *uint, changesOnly bool) ([]models.Question, map[uint]models.Quiz, error) {
	quizQuery := s.db.WithContext(ctx).Unscoped().Order("updated_at ASC, id ASC")
	if courseID != nil {
		quizQuery = quizQuery.Where("course_id = ?", *courseID)
	}
	var quizzes []models.Quiz
	if err := quizQuery.Find(&quizzes).Error; err != nil {
		return nil, nil, err
	}
	quizzesByID := make(map[uint]models.Quiz, len(quizzes))
	quizIDs := make([]uint, 0, len(quizzes))
	for _, quiz := range quizzes {
		quizzesByID[quiz.ID] = quiz
		quizIDs = append(quizIDs, quiz.ID)
	}
	if len(quizIDs) == 0 {
		return []models.Question{}, quizzesByID, nil
	}

	questionQuery := s.db.WithContext(ctx).Unscoped().
		Where("quiz_id IN ?", quizIDs).
		Order("quiz_id ASC, order_num ASC, id ASC")
	if changesOnly {
		// Keep full question set for changed quizzes and changed questions.
	}

	var questions []models.Question
	if err := questionQuery.Find(&questions).Error; err != nil {
		return nil, nil, err
	}
	return questions, quizzesByID, nil
}

func (s *knowledgeExportService) findQuizUnscoped(ctx context.Context, quizID uint) (*models.Quiz, error) {
	var quiz models.Quiz
	if err := s.db.WithContext(ctx).Unscoped().First(&quiz, quizID).Error; err != nil {
		return nil, err
	}
	return &quiz, nil
}

func chapterToKnowledgeItem(chapter models.Chapter) KnowledgeExportItem {
	metadata := map[string]any{
		"chapter_order":    chapter.OrderNum,
		"knowledge_points": parseJSONStringArray(chapter.KnowledgePoints),
	}
	return KnowledgeExportItem{
		Kind:       "chapter",
		ID:         fmt.Sprintf("chapter:%d", chapter.ID),
		SourceID:   fmt.Sprintf("%d", chapter.ID),
		CourseID:   fmt.Sprintf("%d", chapter.CourseID),
		Visibility: knowledgeVisibilityStudentPublic,
		Title:      chapter.Title,
		Content:    joinContent(chapter.Summary, chapter.KnowledgePoints),
		Metadata:   metadata,
		UpdatedAt:  knowledgeTimestamp(chapter.UpdatedAt, chapter.DeletedAt.Time),
		Deleted:    chapter.DeletedAt.Valid,
	}
}

func resourceToKnowledgeItem(resource models.Resource) KnowledgeExportItem {
	metadata := map[string]any{
		"type":          resource.Type,
		"url":           resource.URL,
		"created_by_id": resource.CreatedByID,
	}
	if resource.ChapterID != nil {
		metadata["chapter_id"] = *resource.ChapterID
	}
	return KnowledgeExportItem{
		Kind:       "resource",
		ID:         fmt.Sprintf("resource:%d", resource.ID),
		SourceID:   fmt.Sprintf("%d", resource.ID),
		CourseID:   fmt.Sprintf("%d", resource.CourseID),
		Visibility: knowledgeVisibilityStudentPublic,
		Title:      resource.Title,
		Content:    joinContent(resource.Description, resource.URL),
		Metadata:   metadata,
		UpdatedAt:  knowledgeTimestamp(resource.UpdatedAt, resource.DeletedAt.Time),
		Deleted:    resource.DeletedAt.Valid,
	}
}

func assignmentToKnowledgeItem(assignment models.Assignment) KnowledgeExportItem {
	metadata := map[string]any{
		"teacher_id":    assignment.TeacherID,
		"allow_file":    assignment.AllowFile,
		"max_file_size": assignment.MaxFileSize,
	}
	if assignment.ChapterID != nil {
		metadata["chapter_id"] = *assignment.ChapterID
	}
	if assignment.Deadline != nil {
		metadata["deadline"] = assignment.Deadline.UTC().Format(time.RFC3339)
	}
	return KnowledgeExportItem{
		Kind:       "assignment",
		ID:         fmt.Sprintf("assignment:%d", assignment.ID),
		SourceID:   fmt.Sprintf("%d", assignment.ID),
		CourseID:   fmt.Sprintf("%d", assignment.CourseID),
		Visibility: knowledgeVisibilityStudentPublic,
		Title:      assignment.Title,
		Content:    assignment.Description,
		Metadata:   metadata,
		UpdatedAt:  knowledgeTimestamp(assignment.UpdatedAt, assignment.DeletedAt.Time),
		Deleted:    assignment.DeletedAt.Valid,
	}
}

func quizQuestionToKnowledgeItem(quiz models.Quiz, question models.Question) KnowledgeExportItem {
	metadata := map[string]any{
		"quiz_id":               quiz.ID,
		"quiz_title":            quiz.Title,
		"question_type":         question.Type,
		"points":                question.Points,
		"order_num":             question.OrderNum,
		"is_published":          quiz.IsPublished,
		"show_answer_after_end": quiz.ShowAnswerAfterEnd,
	}
	if quiz.ChapterID != nil {
		metadata["chapter_id"] = *quiz.ChapterID
	}
	options := parseJSONStringArray(question.Options)
	if len(options) > 0 {
		metadata["options"] = options
	}
	visibility := knowledgeVisibilityTeacherPrivate
	if quiz.IsPublished && !quiz.DeletedAt.Valid {
		visibility = knowledgeVisibilityStudentPublic
	}
	content := question.Content
	if len(options) > 0 {
		content = strings.TrimSpace(content + "\n选项: " + strings.Join(options, " | "))
	}
	return KnowledgeExportItem{
		Kind:       "quiz_question",
		ID:         fmt.Sprintf("quiz_question:%d", question.ID),
		SourceID:   fmt.Sprintf("%d", question.ID),
		CourseID:   fmt.Sprintf("%d", quiz.CourseID),
		Visibility: visibility,
		Title:      fmt.Sprintf("%s / 第%d题", quiz.Title, question.OrderNum+1),
		Content:    content,
		Metadata:   metadata,
		UpdatedAt:  knowledgeTimestamp(question.UpdatedAt, question.DeletedAt.Time, quiz.UpdatedAt, quiz.DeletedAt.Time),
		Deleted:    question.DeletedAt.Valid || quiz.DeletedAt.Valid,
	}
}

func joinContent(parts ...string) string {
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		values = append(values, trimmed)
	}
	return strings.Join(values, "\n\n")
}

func parseJSONStringArray(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err == nil {
		cleaned := make([]string, 0, len(items))
		for _, item := range items {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				cleaned = append(cleaned, trimmed)
			}
		}
		return cleaned
	}
	return []string{raw}
}

func parseKnowledgeCursor(cursor string) (time.Time, error) {
	raw := strings.TrimSpace(cursor)
	if raw == "" {
		return time.Time{}, nil
	}
	if idx := strings.Index(raw, "#"); idx >= 0 {
		raw = raw[:idx]
	}
	ts, err := time.Parse(time.RFC3339Nano, raw)
	if err == nil {
		return ts.UTC(), nil
	}
	ts, err = time.Parse(time.RFC3339, raw)
	if err == nil {
		return ts.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("invalid knowledge export cursor: %q", cursor)
}

func buildKnowledgeCursor(items []KnowledgeExportItem, fallback time.Time) string {
	maxTs := fallback.UTC()
	for _, item := range items {
		if item.UpdatedAt.After(maxTs) {
			maxTs = item.UpdatedAt
		}
	}
	return fmt.Sprintf("%s#%d", maxTs.Format(time.RFC3339Nano), maxTs.UnixNano())
}

func knowledgeTimestamp(values ...time.Time) time.Time {
	maxTs := time.Time{}
	for _, value := range values {
		if value.After(maxTs) {
			maxTs = value
		}
	}
	if maxTs.IsZero() {
		return time.Now().UTC()
	}
	return maxTs.UTC()
}

func sortKnowledgeItems(items []KnowledgeExportItem) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt.Equal(items[j].UpdatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].UpdatedAt.Before(items[j].UpdatedAt)
	})
}

func dedupeKnowledgeItems(items []KnowledgeExportItem) []KnowledgeExportItem {
	seen := make(map[string]int, len(items))
	out := make([]KnowledgeExportItem, 0, len(items))
	for _, item := range items {
		if idx, ok := seen[item.ID]; ok {
			if item.UpdatedAt.After(out[idx].UpdatedAt) {
				out[idx] = item
			}
			continue
		}
		seen[item.ID] = len(out)
		out = append(out, item)
	}
	sortKnowledgeItems(out)
	return out
}
