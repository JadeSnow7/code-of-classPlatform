package http

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
)

type simHandlers struct {
	sim *clients.SimClient
}

func newSimHandlers(sim *clients.SimClient) *simHandlers {
	return &simHandlers{sim: sim}
}

func (h *simHandlers) Laplace2D(c *gin.Context) {
	var req clients.Laplace2DRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.NX <= 0 {
		req.NX = 60
	}
	if req.NY <= 0 {
		req.NY = 40
	}
	if req.MaxIter <= 0 {
		req.MaxIter = 2000
	}
	if req.Tolerance <= 0 {
		req.Tolerance = 1e-5
	}

	resp, err := h.sim.Laplace2D(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// SimProxy is a generic handler that proxies simulation requests to the Python service
// It reads the request body and forwards it to the specified path
func (h *simHandlers) SimProxy(path string) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}

		resp, err := h.sim.ProxyRequest(c.Request.Context(), path, body)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		c.Data(http.StatusOK, "application/json", resp)
	}
}

// CalcProxy is a generic handler for numerical computation endpoints
func (h *simHandlers) CalcProxy(path string) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}

		resp, err := h.sim.ProxyRequest(c.Request.Context(), path, body)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		c.Data(http.StatusOK, "application/json", resp)
	}
}
