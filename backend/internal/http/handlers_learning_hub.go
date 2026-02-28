package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type learningHubHandlers struct{}

type learningHubHeatmapCell struct {
	Date  string  `json:"date"`
	Hours float64 `json:"hours"`
}

type learningHubDashboardResponse struct {
	ActivityHeatmap         []learningHubHeatmapCell `json:"activity_heatmap"`
	KnowledgeBasesCount     int                      `json:"knowledge_bases_count"`
	PendingAssignmentsCount int                      `json:"pending_assignments_count"`
	WritingRadar            map[string]float64       `json:"writing_radar"`
}

type learningHubKnowledgeBaseSummary struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	FileCount int    `json:"file_count"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

func NewLearningHubHandlers() *learningHubHandlers {
	return &learningHubHandlers{}
}

func (h *learningHubHandlers) GetDashboard(c *gin.Context) {
	response.OK(c, learningHubDashboardResponse{
		ActivityHeatmap:         []learningHubHeatmapCell{},
		KnowledgeBasesCount:     0,
		PendingAssignmentsCount: 0,
		WritingRadar:            map[string]float64{},
	})
}

func (h *learningHubHandlers) ListKnowledgeBases(c *gin.Context) {
	response.OK(c, []learningHubKnowledgeBaseSummary{})
}
