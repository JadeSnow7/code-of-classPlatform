package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWorkspaceHandlers_UsesSharedSnakeCaseContract(t *testing.T) {
	h := NewWorkspaceHandlers()
	now := time.Date(2026, 3, 22, 10, 0, 0, 0, time.UTC)
	h.now = func() time.Time { return now }
	r := setupWorkspaceHandlerRouter(h)

	submitReq := httptest.NewRequest(http.MethodPost, "/workspace/simulations", bytes.NewBufferString(`{"type":"laplace2d","grid_resolution":"coarse","boundary_condition":"pec"}`))
	submitReq.Header.Set("Content-Type", "application/json")
	setWorkspaceUser(submitReq, 1)
	submitW := httptest.NewRecorder()
	r.ServeHTTP(submitW, submitReq)

	var submitted envelope[submitWorkspaceSimulationResponse]
	assert.NoError(t, json.Unmarshal(submitW.Body.Bytes(), &submitted))

	now = now.Add(workspaceQueuedDuration + workspaceRunningDuration + time.Second)
	getReq := httptest.NewRequest(http.MethodGet, "/workspace/jobs/"+submitted.Data.ID, nil)
	setWorkspaceUser(getReq, 1)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)

	var raw envelope[map[string]any]
	assert.NoError(t, json.Unmarshal(getW.Body.Bytes(), &raw))
	assert.Contains(t, raw.Data, "created_at")
	assert.Contains(t, raw.Data, "completed_at")
	assert.NotContains(t, raw.Data, "createdAt")
	assert.NotContains(t, raw.Data, "completedAt")

	result, ok := raw.Data["result"].(map[string]any)
	assert.True(t, ok)
	assert.Contains(t, result, "png_base64")
	assert.NotContains(t, result, "pngBase64")
}
