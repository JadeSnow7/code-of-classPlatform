package http

import (
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/clients"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
)

type aiHandlers struct {
	ai *clients.AIClient
}

func newAIHandlers(ai *clients.AIClient) *aiHandlers {
	return &aiHandlers{ai: ai}
}

type chatRequest struct {
	Mode     string                `json:"mode"`
	Messages []clients.ChatMessage `json:"messages" binding:"required"`
	Stream   bool                  `json:"stream"`
}

func (h *aiHandlers) Chat(c *gin.Context) {
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	// Streaming mode
	if req.Stream {
		h.streamChat(c, req)
		return
	}

	// Non-streaming mode
	resp, err := h.ai.Chat(c.Request.Context(), clients.ChatRequest{
		Mode:     req.Mode,
		Messages: req.Messages,
	})
	if err != nil {
		respondError(c, http.StatusBadGateway, "BAD_GATEWAY", err.Error(), nil)
		return
	}
	respondOK(c, resp)
}

func (h *aiHandlers) streamChat(c *gin.Context, req chatRequest) {
	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable Nginx buffering

	body, err := h.ai.StreamChat(c.Request.Context(), clients.ChatRequest{
		Mode:     req.Mode,
		Messages: req.Messages,
		Stream:   true,
	})
	if err != nil {
		// Write error as SSE event
		c.Writer.WriteString("data: {\"error\":\"" + err.Error() + "\"}\n\n")
		c.Writer.Flush()
		return
	}
	defer body.Close()

	// Stream response body directly to client
	buf := make([]byte, 4096)
	for {
		n, readErr := body.Read(buf)
		if n > 0 {
			c.Writer.Write(buf[:n])
			c.Writer.Flush()
		}
		if readErr != nil {
			if readErr != io.EOF {
				c.Writer.WriteString("data: {\"error\":\"stream read error\"}\n\n")
				c.Writer.Flush()
			}
			break
		}
	}
}

func (h *aiHandlers) ChatWithTools(c *gin.Context) {
	var req clients.ChatWithToolsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	resp, err := h.ai.ChatWithTools(c.Request.Context(), req)
	if err != nil {
		respondError(c, http.StatusBadGateway, "BAD_GATEWAY", err.Error(), nil)
		return
	}
	respondOK(c, resp)
}

// guidedChatRequest is the request body for guided chat
type guidedChatRequest struct {
	SessionID string                `json:"session_id,omitempty"`
	Topic     string                `json:"topic,omitempty"`
	Messages  []clients.ChatMessage `json:"messages" binding:"required,min=1"`
	CourseID  string                `json:"course_id,omitempty"`
}

// ChatGuided handles guided learning chat requests.
// It injects the user_id from JWT context into the AI service request.
func (h *aiHandlers) ChatGuided(c *gin.Context) {
	var req guidedChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid request", nil)
		return
	}

	// Extract user from JWT context (set by AuthRequired middleware)
	user, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not found in context", nil)
		return
	}

	// Build AI service request with injected user_id
	aiReq := clients.GuidedChatRequest{
		SessionID: req.SessionID,
		Topic:     req.Topic,
		Messages:  req.Messages,
		UserID:    fmt.Sprintf("%d", user.ID),
		CourseID:  req.CourseID,
	}

	resp, err := h.ai.ChatGuided(c.Request.Context(), aiReq)
	if err != nil {
		respondError(c, http.StatusBadGateway, "BAD_GATEWAY", err.Error(), nil)
		return
	}
	respondOK(c, resp)
}
