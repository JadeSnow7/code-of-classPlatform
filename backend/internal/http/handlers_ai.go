package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type aiHandlers struct {
	ai *clients.AIClient
}

func NewAIHandlers(ai *clients.AIClient) *aiHandlers {
	return &aiHandlers{ai: ai}
}

func newAIHandlers(ai *clients.AIClient) *aiHandlers {
	return NewAIHandlers(ai)
}

type flexibleString string

func (v *flexibleString) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if bytes.Equal(trimmed, []byte("null")) || len(trimmed) == 0 {
		*v = ""
		return nil
	}

	var stringValue string
	if err := json.Unmarshal(trimmed, &stringValue); err == nil {
		*v = flexibleString(strings.TrimSpace(stringValue))
		return nil
	}

	var numberValue json.Number
	if err := json.Unmarshal(trimmed, &numberValue); err == nil {
		*v = flexibleString(numberValue.String())
		return nil
	}

	return fmt.Errorf("invalid flexible string: %s", string(trimmed))
}

func (v flexibleString) String() string {
	return strings.TrimSpace(string(v))
}

type chatRequest struct {
	Mode     string                `json:"mode"`
	Messages []clients.ChatMessage `json:"messages" binding:"required"`
	Stream   bool                  `json:"stream"`
	CourseID flexibleString        `json:"course_id,omitempty"`
	Privacy  string                `json:"privacy,omitempty"`
	Route    string                `json:"route,omitempty"`
}

type orchestratedChatRequest struct {
	Messages         []clients.ChatMessage     `json:"messages" binding:"required"`
	Attachments      []clients.TaskAttachment  `json:"attachments,omitempty"`
	WorkspaceContext *clients.WorkspaceContext `json:"workspace_context,omitempty"`
	SessionID        string                    `json:"session_id,omitempty"`
	CourseID         string                    `json:"course_id,omitempty"`
	UserID           string                    `json:"user_id,omitempty"`
	Privacy          string                    `json:"privacy,omitempty"`
	Route            string                    `json:"route,omitempty"`
	Stream           bool                      `json:"stream"`
}

type multimodalChatRequest struct {
	Mode        string                          `json:"mode"`
	Messages    []clients.MultimodalChatMessage `json:"messages" binding:"required,min=1"`
	Stream      bool                            `json:"stream"`
	Privacy     string                          `json:"privacy,omitempty"`
	Route       string                          `json:"route,omitempty"`
	ModelFamily string                          `json:"model_family,omitempty"`
}

func (h *aiHandlers) Chat(c *gin.Context) {
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	// Streaming mode
	if req.Stream {
		h.streamChat(c, req)
		return
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	forwardedReq, ok := buildForwardedChatRequest(c, req)
	if !ok {
		return
	}

	// Non-streaming mode
	resp, err := h.ai.Chat(ctx, forwardedReq)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, resp)
}

func (h *aiHandlers) Health(c *gin.Context) {
	if h.ai == nil {
		response.OK(c, gin.H{
			"status": "offline",
			"detail": "ai client is not configured",
		})
		return
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	payload, err := h.ai.Health(ctx)
	if err != nil {
		response.OK(c, gin.H{
			"status": "degraded",
			"detail": err.Error(),
		})
		return
	}

	status, _ := payload["status"].(string)
	if status == "" {
		status = "ready"
	}
	payload["status"] = status
	response.OK(c, payload)
}

func (h *aiHandlers) streamChat(c *gin.Context, req chatRequest) {
	forwardedReq, ok := buildForwardedChatRequest(c, req)
	if !ok {
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable Nginx buffering

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	forwardedReq.Stream = true
	body, err := h.ai.StreamChat(ctx, forwardedReq)
	if err != nil {
		writeSSEData(c, gin.H{"error": err.Error()})
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
				writeSSEData(c, gin.H{"error": "stream read error"})
			}
			break
		}
	}
}

func (h *aiHandlers) ChatOrchestrated(c *gin.Context) {
	if h.ai == nil || !h.ai.SupportsOrchestrated() {
		response.NotFound(c, "orchestrated ai endpoint")
		return
	}

	var req orchestratedChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	body, err := h.ai.StreamOrchestratedChat(ctx, clients.OrchestratedChatRequest{
		Messages:         req.Messages,
		Attachments:      req.Attachments,
		WorkspaceContext: req.WorkspaceContext,
		SessionID:        req.SessionID,
		CourseID:         req.CourseID,
		UserID:           req.UserID,
		Privacy:          req.Privacy,
		Route:            req.Route,
		Stream:           true,
	})
	if err != nil {
		writeSSEData(c, gin.H{"error": err.Error()})
		return
	}
	defer body.Close()

	buf := make([]byte, 4096)
	for {
		n, readErr := body.Read(buf)
		if n > 0 {
			c.Writer.Write(buf[:n])
			c.Writer.Flush()
		}
		if readErr != nil {
			if readErr != io.EOF {
				writeSSEData(c, gin.H{"error": "stream read error"})
			}
			break
		}
	}
}

func writeSSEData(c *gin.Context, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		data = []byte(`{"error":"sse encode error"}`)
	}
	_, _ = c.Writer.WriteString("data: " + string(data) + "\n\n")
	c.Writer.Flush()
}

func buildForwardedChatRequest(c *gin.Context, req chatRequest) (clients.ChatRequest, bool) {
	aclContext, ok := buildChatACLContext(c, req.CourseID)
	if !ok {
		return clients.ChatRequest{}, false
	}

	forwardedReq := clients.ChatRequest{
		Mode:     req.Mode,
		Messages: req.Messages,
		Stream:   req.Stream,
		CourseID: aclContext.CourseID,
		UserRole: aclContext.UserRole,
		Privacy:  req.Privacy,
		Route:    req.Route,
	}
	if shouldForwardChatUserID(req.Mode) {
		forwardedReq.UserID = aclContext.UserID
	}

	return forwardedReq, true
}

func shouldForwardChatUserID(mode string) bool {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "user_artifact", "user_artifact_rag":
		return true
	default:
		return false
	}
}

type chatACLContext struct {
	CourseID string
	UserID   string
	UserRole string
}

func buildChatACLContext(c *gin.Context, courseID flexibleString) (chatACLContext, bool) {
	aclContext := chatACLContext{
		CourseID: courseID.String(),
	}

	if user, ok := middleware.GetUser(c); ok {
		if user.ID != 0 {
			aclContext.UserID = fmt.Sprintf("%d", user.ID)
		}
		aclContext.UserRole = strings.TrimSpace(user.Role)
	}

	if aclContext.UserID == "" {
		aclContext.UserID = contextValueAsString(c, "user_id")
	}
	if aclContext.UserRole == "" {
		aclContext.UserRole = contextValueAsString(c, "role")
	}

	if aclContext.UserID == "" || aclContext.UserRole == "" {
		response.Unauthorized(c, "user not found in context")
		return chatACLContext{}, false
	}

	return aclContext, true
}

func contextValueAsString(c *gin.Context, key string) string {
	value, ok := c.Get(key)
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func (h *aiHandlers) ChatMultimodal(c *gin.Context) {
	var req multimodalChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}
	if req.Stream {
		response.BadRequest(c, "streaming is not supported for /ai/chat/multimodal")
		return
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	resp, err := h.ai.ChatMultimodal(ctx, clients.ChatMultimodalRequest{
		Mode:        req.Mode,
		Messages:    req.Messages,
		Stream:      false,
		Privacy:     req.Privacy,
		Route:       req.Route,
		ModelFamily: req.ModelFamily,
	})
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, resp)
}

func (h *aiHandlers) ChatWithTools(c *gin.Context) {
	var req clients.ChatWithToolsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	resp, err := h.ai.ChatWithTools(ctx, req)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, resp)
}

// guidedChatRequest is the request body for guided chat
type guidedChatRequest struct {
	SessionID string                `json:"session_id,omitempty"`
	Topic     string                `json:"topic,omitempty"`
	Messages  []clients.ChatMessage `json:"messages" binding:"required,min=1"`
	CourseID  string                `json:"course_id,omitempty"`
	Privacy   string                `json:"privacy,omitempty"`
	Route     string                `json:"route,omitempty"`
}

type deriveGraphRAGRequest struct {
	ProblemText      string `json:"problem_text" binding:"required"`
	CourseID         string `json:"course_id,omitempty"`
	Mode             string `json:"mode,omitempty"`
	ResponseStyle    string `json:"response_style,omitempty"`
	VerificationMode string `json:"verification_mode,omitempty"`
	Privacy          string `json:"privacy,omitempty"`
	Route            string `json:"route,omitempty"`
}

// ChatGuided handles guided learning chat requests.
// It injects the user_id from JWT context into the AI service request.
func (h *aiHandlers) ChatGuided(c *gin.Context) {
	var req guidedChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	// Extract user from JWT context (set by AuthRequired middleware)
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}

	// Build AI service request with injected user_id
	aiReq := clients.GuidedChatRequest{
		SessionID: req.SessionID,
		Topic:     req.Topic,
		Messages:  req.Messages,
		UserID:    fmt.Sprintf("%d", user.ID),
		CourseID:  req.CourseID,
		Privacy:   req.Privacy,
		Route:     req.Route,
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	resp, err := h.ai.ChatGuided(ctx, aiReq)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, resp)
}

// Derive handles complete-derivation requests backed by the Neo4j GraphRAG pipeline.
func (h *aiHandlers) Derive(c *gin.Context) {
	var req deriveGraphRAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}

	ctx := clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c))
	resp, err := h.ai.DeriveGraphRAG(ctx, clients.DeriveGraphRAGRequest{
		ProblemText:      req.ProblemText,
		CourseID:         req.CourseID,
		UserID:           fmt.Sprintf("%d", user.ID),
		UserRole:         user.Role,
		Mode:             req.Mode,
		ResponseStyle:    req.ResponseStyle,
		VerificationMode: req.VerificationMode,
		Privacy:          req.Privacy,
		Route:            req.Route,
	})
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, resp)
}
