package services

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type fakeWritingRepo struct {
	repositories.WritingRepository
	createdSubmission *models.WritingSubmission
	updatedID         uint
	feedbackJSON      string
	dimensionJSON     string
	events            []*models.LearningEvent
	profiles          []models.StudentLearningProfile
}

func (f *fakeWritingRepo) Create(_ context.Context, submission *models.WritingSubmission) error {
	if submission.ID == 0 {
		submission.ID = 1
	}
	f.createdSubmission = submission
	return nil
}

func (f *fakeWritingRepo) UpdateFeedback(_ context.Context, id uint, feedbackJSON, dimensionJSON string) error {
	f.updatedID = id
	f.feedbackJSON = feedbackJSON
	f.dimensionJSON = dimensionJSON
	return nil
}

func (f *fakeWritingRepo) CreateLearningEvent(_ context.Context, event *models.LearningEvent) error {
	f.events = append(f.events, event)
	return nil
}

func (f *fakeWritingRepo) FindLearningProfilesByCourseID(context.Context, uint) ([]models.StudentLearningProfile, error) {
	return f.profiles, nil
}

type fakeAIForWriting struct {
	clients.AIClientInterface
	resp clients.WritingAnalysisResponse
	err  error
}

func (f *fakeAIForWriting) AnalyzeWriting(context.Context, clients.WritingAnalysisRequest) (clients.WritingAnalysisResponse, error) {
	return f.resp, f.err
}

func TestWritingService_ApplyAIAnalysis_UpdatesFeedbackAndDimensionJSON(t *testing.T) {
	repo := &fakeWritingRepo{}
	ai := &fakeAIForWriting{
		resp: clients.WritingAnalysisResponse{
			OverallScore: 91.5,
			Dimensions: []clients.DimensionScore{
				{Name: "structure", Score: 90, Weight: 0.5, Comment: "good"},
			},
			Summary: "ok",
		},
	}
	svc := NewWritingService(repo, ai)

	submission := &models.WritingSubmission{
		Model:       gorm.Model{ID: 12},
		StudentID:   2,
		CourseID:    3,
		Content:     "content",
		Title:       "title",
		WritingType: "course_paper",
	}
	err := svc.ApplyAIAnalysis(context.Background(), submission, "default", "auto")
	assert.NoError(t, err)
	assert.Equal(t, uint(12), repo.updatedID)
	assert.Contains(t, repo.feedbackJSON, "\"overall_score\":91.5")
	assert.Contains(t, repo.dimensionJSON, "\"name\":\"structure\"")
	assert.NotEmpty(t, repo.events)
}

func TestWritingService_Submit_DoesNotFailOnAIError(t *testing.T) {
	repo := &fakeWritingRepo{}
	ai := &fakeAIForWriting{err: errors.New("upstream timeout")}
	svc := NewWritingService(repo, ai)

	submission := &models.WritingSubmission{
		StudentID:   2,
		CourseID:    3,
		Content:     "content",
		Title:       "title",
		WritingType: "course_paper",
	}

	err := svc.Submit(context.Background(), submission, "default", "auto")
	assert.NoError(t, err)
	assert.NotNil(t, repo.createdSubmission)
	assert.NotEmpty(t, repo.events)
}

func TestWritingService_GetStats_AggregatesWeaknessCount(t *testing.T) {
	repo := &fakeWritingRepo{
		profiles: []models.StudentLearningProfile{
			{WeakPoints: `{"citation":2,"coherence":1}`},
			{WeakPoints: `{"citation":1}`},
		},
	}
	svc := NewWritingService(repo, &fakeAIForWriting{})

	stats, err := svc.GetStats(context.Background(), 5)
	assert.NoError(t, err)
	assert.Equal(t, 2, stats["student_count"])

	raw, marshalErr := json.Marshal(stats["weakness_stats"])
	assert.NoError(t, marshalErr)
	var items []map[string]interface{}
	assert.NoError(t, json.Unmarshal(raw, &items))

	byName := map[string]int{}
	for _, item := range items {
		name, _ := item["name"].(string)
		count, _ := item["count"].(float64)
		byName[name] = int(count)
	}
	assert.Equal(t, 2, byName["citation"])
	assert.Equal(t, 1, byName["coherence"])
}
