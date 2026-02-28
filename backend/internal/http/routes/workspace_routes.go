package routes

import (
	"net/http"
	"reflect"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// WorkspaceHandlers interface for workspace handler methods.
type WorkspaceHandlers interface {
	ListJobs(c *gin.Context)
	GetJob(c *gin.Context)
	SubmitSimulation(c *gin.Context)
}

// RegisterWorkspaceRoutes registers workspace routes.
func RegisterWorkspaceRoutes(api *gin.RouterGroup, jwtSecret string, h WorkspaceHandlers) {
	workspace := api.Group("/workspace")
	workspace.Use(middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermSimUse))

	listJobs := workspaceNotImplementedHandler
	getJob := workspaceNotImplementedHandler
	submitSimulation := workspaceNotImplementedHandler

	if !isNilWorkspaceHandlers(h) {
		listJobs = h.ListJobs
		getJob = h.GetJob
		submitSimulation = h.SubmitSimulation
	}

	workspace.GET("/jobs", listJobs)
	workspace.GET("/jobs/:jobId", getJob)
	workspace.POST("/simulations", submitSimulation)
}

func isNilWorkspaceHandlers(h WorkspaceHandlers) bool {
	if h == nil {
		return true
	}
	v := reflect.ValueOf(h)
	switch v.Kind() {
	case reflect.Ptr, reflect.Map, reflect.Slice, reflect.Interface, reflect.Func:
		return v.IsNil()
	default:
		return false
	}
}

func workspaceNotImplementedHandler(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"success": false,
		"error": gin.H{
			"message": "workspace API is not implemented",
		},
	})
}
