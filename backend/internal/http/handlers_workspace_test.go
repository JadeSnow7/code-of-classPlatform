package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
)

func setupWorkspaceHandlerRouter(h *workspaceHandlers) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		userID := uint(42)
		if rawUserID := c.GetHeader("X-Test-User-ID"); rawUserID != "" {
			if parsedUserID, err := strconv.ParseUint(rawUserID, 10, 64); err == nil {
				userID = uint(parsedUserID)
			}
		}
		c.Set("user", middleware.UserContext{
			ID:       userID,
			Username: "test-user",
			Role:     "student",
		})
		c.Next()
	})
	r.POST("/workspace/simulations", h.SubmitSimulation)
	r.GET("/workspace/jobs", h.ListJobs)
	r.GET("/workspace/jobs/:jobId", h.GetJob)
	return r
}

func setWorkspaceUser(req *http.Request, userID uint) {
	req.Header.Set("X-Test-User-ID", strconv.FormatUint(uint64(userID), 10))
}

func TestWorkspaceHandlers_SubmitSimulation_Success(t *testing.T) {
	h := NewWorkspaceHandlers()
	r := setupWorkspaceHandlerRouter(h)

	reqBody := []byte(`{"type":"laplace2d","grid_resolution":"medium","boundary_condition":"pec"}`)
	req := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var resp envelope[submitWorkspaceSimulationResponse]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.NotEmpty(t, resp.Data.ID)
	assert.Equal(t, "queued", resp.Data.Status)
}

func TestWorkspaceHandlers_SubmitSimulation_BadRequest(t *testing.T) {
	h := NewWorkspaceHandlers()
	r := setupWorkspaceHandlerRouter(h)

	reqBody := []byte(`{"type":"laplace2d","grid_resolution":"unknown","boundary_condition":"pec"}`)
	req := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.NotNil(t, resp.Error)
	assert.Contains(t, resp.Error.Message, "grid_resolution")
}

func TestWorkspaceHandlers_GetJob_NotFound(t *testing.T) {
	h := NewWorkspaceHandlers()
	r := setupWorkspaceHandlerRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/workspace/jobs/job_missing", nil)
	setWorkspaceUser(req, 1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestWorkspaceHandlers_JobLifecycleAndList(t *testing.T) {
	h := NewWorkspaceHandlers()
	current := time.Date(2026, 2, 27, 12, 0, 0, 0, time.UTC)
	h.now = func() time.Time {
		return current
	}
	r := setupWorkspaceHandlerRouter(h)

	// submit job
	reqBody := []byte(`{"type":"fdtd","grid_resolution":"fine","boundary_condition":"pml"}`)
	submitReq := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewReader(reqBody))
	submitReq.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(submitReq, 1)
	submitW := httptest.NewRecorder()
	r.ServeHTTP(submitW, submitReq)
	assert.Equal(t, http.StatusAccepted, submitW.Code)

	var submitResp envelope[submitWorkspaceSimulationResponse]
	assert.NoError(t, json.Unmarshal(submitW.Body.Bytes(), &submitResp))
	jobID := submitResp.Data.ID
	assert.NotEmpty(t, jobID)

	// queued
	current = current.Add(1 * time.Second)
	getQueuedReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs/"+jobID, nil)
	setWorkspaceUser(getQueuedReq, 1)
	getQueuedW := httptest.NewRecorder()
	r.ServeHTTP(getQueuedW, getQueuedReq)
	assert.Equal(t, http.StatusOK, getQueuedW.Code)

	var queuedResp envelope[workspaceJobResponse]
	assert.NoError(t, json.Unmarshal(getQueuedW.Body.Bytes(), &queuedResp))
	assert.Equal(t, "queued", queuedResp.Data.Status)
	assert.Equal(t, 0, queuedResp.Data.Progress)

	// running
	current = current.Add(3 * time.Second)
	getRunningReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs/"+jobID, nil)
	setWorkspaceUser(getRunningReq, 1)
	getRunningW := httptest.NewRecorder()
	r.ServeHTTP(getRunningW, getRunningReq)
	assert.Equal(t, http.StatusOK, getRunningW.Code)

	var runningResp envelope[workspaceJobResponse]
	assert.NoError(t, json.Unmarshal(getRunningW.Body.Bytes(), &runningResp))
	assert.Equal(t, "running", runningResp.Data.Status)
	assert.Greater(t, runningResp.Data.Progress, 0)
	assert.Less(t, runningResp.Data.Progress, 100)

	// completed
	current = current.Add(10 * time.Second)
	getCompletedReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs/"+jobID, nil)
	setWorkspaceUser(getCompletedReq, 1)
	getCompletedW := httptest.NewRecorder()
	r.ServeHTTP(getCompletedW, getCompletedReq)
	assert.Equal(t, http.StatusOK, getCompletedW.Code)

	var completedResp envelope[workspaceJobResponse]
	assert.NoError(t, json.Unmarshal(getCompletedW.Body.Bytes(), &completedResp))
	assert.Equal(t, "completed", completedResp.Data.Status)
	assert.Equal(t, 100, completedResp.Data.Progress)
	assert.NotNil(t, completedResp.Data.Result)
	assert.NotEmpty(t, completedResp.Data.Result.PNGBase64)

	// list
	listReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs", nil)
	setWorkspaceUser(listReq, 1)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	assert.Equal(t, http.StatusOK, listW.Code)

	var listResp envelope[[]workspaceJobResponse]
	assert.NoError(t, json.Unmarshal(listW.Body.Bytes(), &listResp))
	assert.True(t, listResp.Success)
	assert.Len(t, listResp.Data, 1)
	assert.Equal(t, jobID, listResp.Data[0].ID)
	assert.Equal(t, "completed", listResp.Data[0].Status)
}

func TestWorkspaceHandlers_ListJobs_OnlyReturnsCurrentUsersJobs(t *testing.T) {
	h := NewWorkspaceHandlers()
	current := time.Date(2026, 2, 27, 12, 0, 0, 0, time.UTC)
	h.now = func() time.Time {
		return current
	}
	r := setupWorkspaceHandlerRouter(h)

	userOneReq := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewBufferString(`{"type":"laplace2d","grid_resolution":"coarse","boundary_condition":"pec"}`))
	userOneReq.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(userOneReq, 1)
	userOneW := httptest.NewRecorder()
	r.ServeHTTP(userOneW, userOneReq)
	assert.Equal(t, http.StatusAccepted, userOneW.Code)

	var userOneResp envelope[submitWorkspaceSimulationResponse]
	assert.NoError(t, json.Unmarshal(userOneW.Body.Bytes(), &userOneResp))

	current = current.Add(1 * time.Second)

	userTwoReq := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewBufferString(`{"type":"fdtd","grid_resolution":"medium","boundary_condition":"pml"}`))
	userTwoReq.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(userTwoReq, 2)
	userTwoW := httptest.NewRecorder()
	r.ServeHTTP(userTwoW, userTwoReq)
	assert.Equal(t, http.StatusAccepted, userTwoW.Code)

	listReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs", nil)
	setWorkspaceUser(listReq, 1)
	listW := httptest.NewRecorder()
	r.ServeHTTP(listW, listReq)
	assert.Equal(t, http.StatusOK, listW.Code)

	var listResp envelope[[]workspaceJobResponse]
	assert.NoError(t, json.Unmarshal(listW.Body.Bytes(), &listResp))
	assert.True(t, listResp.Success)
	assert.Len(t, listResp.Data, 1)
	assert.Equal(t, userOneResp.Data.ID, listResp.Data[0].ID)
}

func TestWorkspaceHandlers_GetJob_HidesOtherUsersJob(t *testing.T) {
	h := NewWorkspaceHandlers()
	r := setupWorkspaceHandlerRouter(h)

	submitReq := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewBufferString(`{"type":"laplace2d","grid_resolution":"coarse","boundary_condition":"pec"}`))
	submitReq.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(submitReq, 1)
	submitW := httptest.NewRecorder()
	r.ServeHTTP(submitW, submitReq)
	assert.Equal(t, http.StatusAccepted, submitW.Code)

	var submitResp envelope[submitWorkspaceSimulationResponse]
	assert.NoError(t, json.Unmarshal(submitW.Body.Bytes(), &submitResp))

	getReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs/"+submitResp.Data.ID, nil)
	setWorkspaceUser(getReq, 2)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)

	assert.Equal(t, http.StatusNotFound, getW.Code)
}
