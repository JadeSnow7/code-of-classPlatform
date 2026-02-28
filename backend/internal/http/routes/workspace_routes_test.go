package routes

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/stretchr/testify/assert"
)

type workspaceHandlersStub struct{}

func (workspaceHandlersStub) ListJobs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (workspaceHandlersStub) GetJob(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (workspaceHandlersStub) SubmitSimulation(c *gin.Context) {
	c.JSON(http.StatusAccepted, gin.H{"ok": true})
}

func makeToken(t *testing.T, role string) string {
	t.Helper()
	token, err := auth.SignToken("test-secret", 1, role, role, time.Hour)
	assert.NoError(t, err)
	return token
}

func setupWorkspaceRoutesTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api/v1")
	RegisterWorkspaceRoutes(api, "test-secret", workspaceHandlersStub{})
	return r
}

func TestWorkspaceRoutes_Unauthorized(t *testing.T) {
	r := setupWorkspaceRoutesTestRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/jobs", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestWorkspaceRoutes_ForbiddenForRoleWithoutPermission(t *testing.T) {
	r := setupWorkspaceRoutesTestRouter()
	token := makeToken(t, "guest")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestWorkspaceRoutes_Authorized(t *testing.T) {
	r := setupWorkspaceRoutesTestRouter()
	token := makeToken(t, "student")

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/jobs", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)
	assert.Equal(t, http.StatusOK, getW.Code)

	postReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/simulations", bytes.NewBufferString(`{"type":"laplace2d","grid_resolution":"coarse","boundary_condition":"pec"}`))
	postReq.Header.Set("Authorization", "Bearer "+token)
	postReq.Header.Set("Content-Type", "application/json")
	postW := httptest.NewRecorder()
	r.ServeHTTP(postW, postReq)
	assert.Equal(t, http.StatusAccepted, postW.Code)
}

func TestWorkspaceRoutes_NotImplementedWhenHandlersMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api/v1")
	RegisterWorkspaceRoutes(api, "test-secret", nil)

	token := makeToken(t, "student")
	requests := []struct {
		method string
		path   string
		body   io.Reader
	}{
		{method: http.MethodGet, path: "/api/v1/workspace/jobs", body: nil},
		{method: http.MethodGet, path: "/api/v1/workspace/jobs/job_1", body: nil},
		{
			method: http.MethodPost,
			path:   "/api/v1/workspace/simulations",
			body:   bytes.NewBufferString(`{"type":"laplace2d","grid_resolution":"coarse","boundary_condition":"pec"}`),
		},
	}

	for _, tc := range requests {
		req := httptest.NewRequest(tc.method, tc.path, tc.body)
		req.Header.Set("Authorization", "Bearer "+token)
		if tc.method == http.MethodPost {
			req.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusNotImplemented, w.Code, tc.path)
	}
}
