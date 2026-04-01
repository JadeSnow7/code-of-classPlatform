package http

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/clients"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type aiHandlers struct {
	ai *clients.AIClient
	db *gorm.DB
}

func NewAIHandlers(ai *clients.AIClient, db *gorm.DB) *aiHandlers {
	return &aiHandlers{ai: ai, db: db}
}

func newAIHandlers(ai *clients.AIClient, db *gorm.DB) *aiHandlers {
	return NewAIHandlers(ai, db)
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

func (h *aiHandlers) CreateSession(c *gin.Context) {
	if h.db == nil {
		response.BadRequest(c, "ai sessions are not available")
		return
	}
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}
	var req struct {
		Mode                   string `json:"mode" binding:"required"`
		OverriddenSystemPrompt string `json:"overriddenSystemPrompt"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}
	session := models.AISession{
		SessionID:              fmt.Sprintf("session_%d", time.Now().UnixNano()),
		UserID:                 user.ID,
		Mode:                   req.Mode,
		OverriddenSystemPrompt: req.OverriddenSystemPrompt,
	}
	if err := h.db.WithContext(c.Request.Context()).Create(&session).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{
		"session_id": session.SessionID,
		"mode":       session.Mode,
	})
}

func (h *aiHandlers) ListSessionMessages(c *gin.Context) {
	if h.db == nil {
		response.BadRequest(c, "ai sessions are not available")
		return
	}
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	var session models.AISession
	if err := h.db.WithContext(c.Request.Context()).Where("session_id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.NotFound(c, "ai session")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	var total int64
	query := h.db.WithContext(c.Request.Context()).Model(&models.AIMessage{}).Where("session_id = ? AND user_id = ?", sessionID, user.ID)
	if err := query.Count(&total).Error; err != nil {
		response.Error(c, err)
		return
	}
	cursor := strings.TrimSpace(c.Query("cursor"))
	baseQuery := query.Order("created_at ASC").Order("id ASC")
	var messages []models.AIMessage
	hasMore := false
	nextCursor := ""

	if cursor != "" {
		var anchor models.AIMessage
		if err := h.db.WithContext(c.Request.Context()).
			Where("session_id = ? AND user_id = ? AND message_id = ?", sessionID, user.ID, cursor).
			First(&anchor).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				response.BadRequest(c, "invalid cursor")
				return
			}
			response.Error(c, err)
			return
		}

		cursorQuery := baseQuery.Where(
			"(created_at > ?) OR (created_at = ? AND id > ?)",
			anchor.CreatedAt,
			anchor.CreatedAt,
			anchor.ID,
		)
		if err := cursorQuery.Limit(pageSize + 1).Find(&messages).Error; err != nil {
			response.Error(c, err)
			return
		}
		if len(messages) > pageSize {
			hasMore = true
			messages = messages[:pageSize]
		}
		page = 1
	} else {
		if err := baseQuery.Offset((page - 1) * pageSize).Limit(pageSize + 1).Find(&messages).Error; err != nil {
			response.Error(c, err)
			return
		}
		if len(messages) > pageSize {
			hasMore = true
			messages = messages[:pageSize]
		}
		if !hasMore {
			hasMore = int64(page*pageSize) < total
		}
	}

	items := make([]gin.H, 0, len(messages))
	for _, message := range messages {
		items = append(items, gin.H{
			"id":         message.MessageID,
			"role":       message.Role,
			"content":    message.Content,
			"created_at": message.CreatedAt.Format(time.RFC3339),
		})
	}
	if len(messages) > 0 {
		nextCursor = messages[len(messages)-1].MessageID
	}
	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))
	response.OK(c, gin.H{
		"items":       items,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": totalPages,
		"has_more":    hasMore,
		"cursor":      cursor,
		"next_cursor": nextCursor,
	})
}

func (h *aiHandlers) RunSession(c *gin.Context) {
	if h.db == nil {
		response.BadRequest(c, "ai sessions are not available")
		return
	}
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	var session models.AISession
	if err := h.db.WithContext(c.Request.Context()).Where("session_id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.NotFound(c, "ai session")
		return
	}
	var req struct {
		Input []struct {
			ID      string `json:"id"`
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"input" binding:"required"`
		Tools  []map[string]interface{} `json:"tools"`
		Stream bool                     `json:"stream"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}
	runID := fmt.Sprintf("run_%d", time.Now().UnixNano())
	run := models.AIRun{RunID: runID, SessionID: sessionID, UserID: user.ID, Status: "queued"}
	if err := h.db.WithContext(c.Request.Context()).Create(&run).Error; err != nil {
		response.Error(c, err)
		return
	}
	for _, message := range req.Input {
		msgID := message.ID
		if strings.TrimSpace(msgID) == "" {
			msgID = fmt.Sprintf("msg_%d", time.Now().UnixNano())
		}
		_ = h.db.WithContext(c.Request.Context()).Create(&models.AIMessage{
			MessageID: msgID,
			SessionID: sessionID,
			UserID:    user.ID,
			Role:      message.Role,
			Content:   message.Content,
		}).Error
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	emitAIEvent(c, "run_status", gin.H{"status": "queued"})
	emitAIEvent(c, "run_status", gin.H{"status": "running"})
	_ = h.db.WithContext(c.Request.Context()).Model(&run).Updates(map[string]interface{}{"status": "running"}).Error

	if h.ai == nil {
		h.finishAIRun(c, &run, sessionID, user.ID, "", "AI_UNAVAILABLE", "ai client is not configured")
		return
	}

	messages := make([]clients.ChatMessage, 0, len(req.Input))
	for _, message := range req.Input {
		messages = append(messages, clients.ChatMessage{Role: message.Role, Content: message.Content})
	}
	body, err := h.ai.StreamChat(clients.WithRequestID(c.Request.Context(), middleware.GetRequestID(c)), clients.ChatRequest{
		Mode:     session.Mode,
		Messages: messages,
		Stream:   true,
		UserID:   fmt.Sprintf("%d", user.ID),
		UserRole: user.Role,
	})
	if err != nil {
		h.finishAIRun(c, &run, sessionID, user.ID, "", "UPSTREAM_ERROR", err.Error())
		return
	}
	defer body.Close()

	var assistantText strings.Builder
	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
			continue
		}
		if content := extractAIContent(parsed); content != "" {
			assistantText.WriteString(content)
			emitAIEvent(c, "token", gin.H{"text": content})
		}
	}
	if err := scanner.Err(); err != nil {
		h.finishAIRun(c, &run, sessionID, user.ID, assistantText.String(), "STREAM_ERROR", err.Error())
		return
	}
	h.finishAIRun(c, &run, sessionID, user.ID, assistantText.String(), "", "")
}

func (h *aiHandlers) ListSessions(c *gin.Context) {
	if h.db == nil {
		response.BadRequest(c, "ai sessions are not available")
		return
	}
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}
	var sessions []models.AISession
	if err := h.db.WithContext(c.Request.Context()).
		Where("user_id = ?", user.ID).
		Order("created_at DESC").
		Find(&sessions).Error; err != nil {
		response.Error(c, err)
		return
	}
	items := make([]gin.H, 0, len(sessions))
	for _, s := range sessions {
		items = append(items, gin.H{
			"session_id": s.SessionID,
			"mode":       s.Mode,
			"created_at": s.CreatedAt,
		})
	}
	response.OK(c, gin.H{"items": items, "total": len(items)})
}

func (h *aiHandlers) DeleteSession(c *gin.Context) {
	if h.db == nil {
		response.BadRequest(c, "ai sessions are not available")
		return
	}
	user, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "user not found in context")
		return
	}
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	var session models.AISession
	if err := h.db.WithContext(c.Request.Context()).
		Where("session_id = ? AND user_id = ?", sessionID, user.ID).
		First(&session).Error; err != nil {
		response.NotFound(c, "ai session")
		return
	}
	if err := h.db.WithContext(c.Request.Context()).
		Where("session_id = ? AND user_id = ?", sessionID, user.ID).
		Delete(&models.AIMessage{}).Error; err != nil {
		response.Error(c, err)
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Delete(&session).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

func emitAIEvent(c *gin.Context, event string, data interface{}) {
	body, _ := json.Marshal(data)
	_, _ = c.Writer.WriteString("event: " + event + "\n")
	_, _ = c.Writer.WriteString("data: " + string(body) + "\n\n")
	c.Writer.Flush()
}

func extractAIContent(parsed map[string]interface{}) string {
	if content, ok := parsed["content"].(string); ok && content != "" {
		return content
	}
	choices, ok := parsed["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return ""
	}
	first, ok := choices[0].(map[string]interface{})
	if !ok {
		return ""
	}
	delta, ok := first["delta"].(map[string]interface{})
	if !ok {
		return ""
	}
	content, _ := delta["content"].(string)
	return content
}

func (h *aiHandlers) finishAIRun(c *gin.Context, run *models.AIRun, sessionID string, userID uint, assistantContent, errorCode, errorMessage string) {
	status := "completed"
	if errorCode != "" {
		status = "failed"
		emitAIEvent(c, "error", gin.H{"code": errorCode, "message": errorMessage})
		emitAIEvent(c, "run_status", gin.H{"status": "failed", "code": errorCode, "message": errorMessage})
	} else {
		messageID := fmt.Sprintf("msg_%d", time.Now().UnixNano())
		if strings.TrimSpace(assistantContent) != "" && h.db != nil {
			_ = h.db.WithContext(c.Request.Context()).Create(&models.AIMessage{
				MessageID: messageID,
				SessionID: sessionID,
				UserID:    userID,
				Role:      "assistant",
				Content:   assistantContent,
			}).Error
			emitAIEvent(c, "message", gin.H{
				"message_id": messageID,
				"role":       "assistant",
				"content":    assistantContent,
			})
		}
	}
	if h.db != nil {
		_ = h.db.WithContext(c.Request.Context()).Model(run).Updates(map[string]interface{}{
			"status":        status,
			"error_code":    errorCode,
			"error_message": errorMessage,
		}).Error
	}
	emitAIEvent(c, "done", gin.H{"run_id": run.RunID})
}
