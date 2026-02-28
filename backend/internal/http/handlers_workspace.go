package http

import (
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

const (
	workspaceQueuedDuration  = 2 * time.Second
	workspaceRunningDuration = 8 * time.Second
	workspaceMockPNGBase64   = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+KDvJXwAAAABJRU5ErkJggg=="
)

var (
	allowedGridResolutions = map[string]bool{
		"coarse": true,
		"medium": true,
		"fine":   true,
	}
	allowedBoundaryConditions = map[string]bool{
		"pml":      true,
		"pec":      true,
		"periodic": true,
	}
)

type workspaceHandlers struct {
	mu   sync.RWMutex
	jobs map[string]*workspaceJob
	now  func() time.Time
}

type workspaceSimulationRequest struct {
	Type              string   `json:"type"`
	FrequencyMHz      *float64 `json:"frequency_mhz,omitempty"`
	GridResolution    string   `json:"grid_resolution"`
	BoundaryCondition string   `json:"boundary_condition"`
	DurationNS        *float64 `json:"duration_ns,omitempty"`
}

type submitWorkspaceSimulationResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type workspaceJob struct {
	ID        string
	UserID    uint
	Name      string
	Type      string
	CreatedAt time.Time
}

type workspaceJobResult struct {
	ID        string `json:"id,omitempty"`
	PNGBase64 string `json:"png_base64,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

type workspaceJobResponse struct {
	ID               string              `json:"id"`
	Name             string              `json:"name"`
	Status           string              `json:"status"`
	Progress         int                 `json:"progress"`
	CPUUsage         *float64            `json:"cpu_usage,omitempty"`
	GPUUsage         *float64            `json:"gpu_usage,omitempty"`
	MemoryUsed       string              `json:"memory_used,omitempty"`
	EstimatedSeconds *int                `json:"estimated_seconds,omitempty"`
	Result           *workspaceJobResult `json:"result,omitempty"`
	Error            string              `json:"error,omitempty"`
	CreatedAt        string              `json:"created_at"`
	CompletedAt      string              `json:"completed_at,omitempty"`
}

func NewWorkspaceHandlers() *workspaceHandlers {
	return &workspaceHandlers{
		jobs: make(map[string]*workspaceJob),
		now:  time.Now,
	}
}

func (h *workspaceHandlers) SubmitSimulation(c *gin.Context) {
	var req workspaceSimulationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	req.Type = strings.TrimSpace(req.Type)
	req.GridResolution = strings.TrimSpace(req.GridResolution)
	req.BoundaryCondition = strings.TrimSpace(req.BoundaryCondition)

	if req.Type == "" {
		response.BadRequest(c, "type is required")
		return
	}
	if !allowedGridResolutions[req.GridResolution] {
		response.BadRequest(c, "grid_resolution must be one of: coarse, medium, fine")
		return
	}
	if !allowedBoundaryConditions[req.BoundaryCondition] {
		response.BadRequest(c, "boundary_condition must be one of: pml, pec, periodic")
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	createdAt := h.now().UTC()
	jobID := "job_" + uuid.NewString()

	h.mu.Lock()
	h.jobs[jobID] = &workspaceJob{
		ID:        jobID,
		UserID:    user.ID,
		Name:      "Mock " + req.Type + " simulation",
		Type:      req.Type,
		CreatedAt: createdAt,
	}
	h.mu.Unlock()

	c.JSON(http.StatusAccepted, response.Envelope{
		Success: true,
		Data: submitWorkspaceSimulationResponse{
			ID:     jobID,
			Status: "queued",
		},
	})
}

func (h *workspaceHandlers) GetJob(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		response.BadRequest(c, "jobId is required")
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	h.mu.RLock()
	job, ok := h.jobs[jobID]
	h.mu.RUnlock()
	if !ok {
		response.NotFound(c, "workspace job")
		return
	}
	if job.UserID != user.ID {
		response.NotFound(c, "workspace job")
		return
	}

	response.OK(c, projectWorkspaceJob(job, h.now().UTC()))
}

func (h *workspaceHandlers) ListJobs(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	now := h.now().UTC()

	h.mu.RLock()
	jobs := make([]workspaceJobResponse, 0, len(h.jobs))
	for _, job := range h.jobs {
		if job.UserID != user.ID {
			continue
		}
		jobs = append(jobs, projectWorkspaceJob(job, now))
	}
	h.mu.RUnlock()

	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].CreatedAt > jobs[j].CreatedAt
	})

	response.OK(c, jobs)
}

func projectWorkspaceJob(job *workspaceJob, now time.Time) workspaceJobResponse {
	createdAt := job.CreatedAt.UTC()
	elapsed := now.Sub(createdAt)
	if elapsed < 0 {
		elapsed = 0
	}

	resp := workspaceJobResponse{
		ID:        job.ID,
		Name:      job.Name,
		Status:    "queued",
		Progress:  0,
		CreatedAt: createdAt.Format(time.RFC3339),
	}

	totalDuration := workspaceQueuedDuration + workspaceRunningDuration
	if elapsed < workspaceQueuedDuration {
		resp.MemoryUsed = "128 MB"
		return resp
	}

	if elapsed < totalDuration {
		phaseElapsed := elapsed - workspaceQueuedDuration
		ratio := float64(phaseElapsed) / float64(workspaceRunningDuration)
		progress := 10 + int(ratio*80)
		if progress > 95 {
			progress = 95
		}
		cpu := 35.0 + ratio*25.0
		gpu := 30.0 + ratio*30.0
		remaining := int((totalDuration - elapsed).Seconds())
		if remaining < 1 {
			remaining = 1
		}

		resp.Status = "running"
		resp.Progress = progress
		resp.CPUUsage = &cpu
		resp.GPUUsage = &gpu
		resp.MemoryUsed = "512 MB"
		resp.EstimatedSeconds = &remaining
		return resp
	}

	completedAt := createdAt.Add(totalDuration).Format(time.RFC3339)
	resp.Status = "completed"
	resp.Progress = 100
	resp.MemoryUsed = "0 MB"
	resp.CompletedAt = completedAt
	resp.Result = &workspaceJobResult{
		ID:        job.ID,
		PNGBase64: workspaceMockPNGBase64,
		CreatedAt: completedAt,
	}
	return resp
}
