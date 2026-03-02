package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type requestIDContextKey struct{}

// WithRequestID attaches request_id to context for outbound AI requests.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	if requestID == "" {
		return ctx
	}
	return context.WithValue(ctx, requestIDContextKey{}, requestID)
}

// RequestIDFromContext extracts request_id from context.
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v := ctx.Value(requestIDContextKey{})
	requestID, _ := v.(string)
	return requestID
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type MultimodalPart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	URL  string `json:"url,omitempty"`
}

type MultimodalChatMessage struct {
	Role    string           `json:"role"`
	Content string           `json:"content,omitempty"`
	Parts   []MultimodalPart `json:"parts,omitempty"`
}

type ChatRequest struct {
	Mode     string        `json:"mode"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
	CourseID string        `json:"course_id,omitempty"`
	UserID   string        `json:"user_id,omitempty"`
	UserRole string        `json:"user_role,omitempty"`
	Privacy  string        `json:"privacy,omitempty"`
	Route    string        `json:"route,omitempty"`
}

type TaskAttachment struct {
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	MimeType string `json:"mime_type"`
	URI      string `json:"uri,omitempty"`
	Text     string `json:"text,omitempty"`
}

type WorkspaceSnippet struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type WorkspaceContext struct {
	Cwd              string             `json:"cwd,omitempty"`
	OpenFiles        []string           `json:"open_files,omitempty"`
	SelectedSnippets []WorkspaceSnippet `json:"selected_snippets,omitempty"`
}

type OrchestratedChatRequest struct {
	Messages         []ChatMessage     `json:"messages"`
	Attachments      []TaskAttachment  `json:"attachments,omitempty"`
	WorkspaceContext *WorkspaceContext `json:"workspace_context,omitempty"`
	SessionID        string            `json:"session_id,omitempty"`
	CourseID         string            `json:"course_id,omitempty"`
	UserID           string            `json:"user_id,omitempty"`
	Privacy          string            `json:"privacy,omitempty"`
	Route            string            `json:"route,omitempty"`
	Stream           bool              `json:"stream"`
}

type ChatResponse struct {
	Reply string `json:"reply"`
	Model string `json:"model,omitempty"`
}

type ChatMultimodalRequest struct {
	Mode        string                  `json:"mode"`
	Messages    []MultimodalChatMessage `json:"messages"`
	Stream      bool                    `json:"stream"`
	Privacy     string                  `json:"privacy,omitempty"`
	Route       string                  `json:"route,omitempty"`
	ModelFamily string                  `json:"model_family,omitempty"`
}

// AIClientInterface defines the AI client interface for dependency injection
type AIClientInterface interface {
	Chat(ctx context.Context, req ChatRequest) (ChatResponse, error)
	ChatMultimodal(ctx context.Context, req ChatMultimodalRequest) (ChatResponse, error)
	StreamChat(ctx context.Context, req ChatRequest) (io.ReadCloser, error)
	ChatWithTools(ctx context.Context, req ChatWithToolsRequest) (ChatWithToolsResponse, error)
	ChatGuided(ctx context.Context, req GuidedChatRequest) (GuidedChatResponse, error)
	DeriveGraphRAG(ctx context.Context, req DeriveGraphRAGRequest) (map[string]interface{}, error)
	AnalyzeWriting(ctx context.Context, req WritingAnalysisRequest) (WritingAnalysisResponse, error)
}

type AIClient struct {
	baseURL             string
	orchestratedBaseURL string
	gatewayToken        string
	orchestratedEnabled bool
	httpClient          *http.Client
	streamHTTPClient    *http.Client
}

// Ensure *AIClient implements AIClientInterface
var _ AIClientInterface = (*AIClient)(nil)

type AIClientOption func(*AIClient)

func WithOrchestratedBaseURL(baseURL string) AIClientOption {
	return func(client *AIClient) {
		client.orchestratedBaseURL = strings.TrimRight(baseURL, "/")
	}
}

func WithOrchestratedEnabled(enabled bool) AIClientOption {
	return func(client *AIClient) {
		client.orchestratedEnabled = enabled
	}
}

func NewAIClient(baseURL string, gatewayToken string, opts ...AIClientOption) *AIClient {
	client := &AIClient{
		baseURL:      baseURL,
		gatewayToken: gatewayToken,
		httpClient: &http.Client{
			Timeout: 300 * time.Second, // 5 min for complex LLM reasoning
		},
		// Streaming client has no read timeout (context cancellation handles it)
		streamHTTPClient: &http.Client{
			Timeout: 0,
			Transport: &http.Transport{
				ResponseHeaderTimeout: 30 * time.Second, // Wait up to 30s for first byte
			},
		},
	}
	for _, opt := range opts {
		opt(client)
	}
	return client
}

func (c *AIClient) SupportsOrchestrated() bool {
	return c.orchestratedEnabled && c.orchestratedBaseURL != ""
}

func (c *AIClient) setCommonHeaders(httpReq *http.Request) {
	httpReq.Header.Set("Content-Type", "application/json")
	if requestID := RequestIDFromContext(httpReq.Context()); requestID != "" {
		httpReq.Header.Set("X-Request-ID", requestID)
	}
	if c.gatewayToken != "" {
		httpReq.Header.Set("X-AI-Gateway-Token", c.gatewayToken)
	}
}

func (c *AIClient) streamRequest(ctx context.Context, url string, body []byte) (io.ReadCloser, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	c.setCommonHeaders(httpReq)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.streamHTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(body))
	}

	return resp.Body, nil
}

func (c *AIClient) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	if c.baseURL == "" {
		return ChatResponse{}, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/chat", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return ChatResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return ChatResponse{}, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out ChatResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ChatResponse{}, err
	}
	return out, nil
}

func (c *AIClient) ChatMultimodal(ctx context.Context, req ChatMultimodalRequest) (ChatResponse, error) {
	if c.baseURL == "" {
		return ChatResponse{}, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/chat/multimodal", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return ChatResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return ChatResponse{}, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out ChatResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ChatResponse{}, err
	}
	return out, nil
}

// StreamChat initiates a streaming chat request and returns the response body.
// The caller is responsible for closing the returned io.ReadCloser.
func (c *AIClient) StreamChat(ctx context.Context, req ChatRequest) (io.ReadCloser, error) {
	if c.baseURL == "" {
		return nil, errors.New("AI base url is empty")
	}

	req.Stream = true
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	return c.streamRequest(ctx, fmt.Sprintf("%s/v1/chat", c.baseURL), body)
}

func (c *AIClient) StreamOrchestratedChat(ctx context.Context, req OrchestratedChatRequest) (io.ReadCloser, error) {
	if !c.SupportsOrchestrated() {
		return nil, errors.New("orchestrated ai service is disabled")
	}

	req.Stream = true
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	return c.streamRequest(ctx, fmt.Sprintf("%s/v1/chat/orchestrated", c.orchestratedBaseURL), body)
}

type ToolCall struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

type ToolResult struct {
	Name    string      `json:"name"`
	Success bool        `json:"success"`
	Result  interface{} `json:"result,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type ChatWithToolsRequest struct {
	Mode         string                 `json:"mode"`
	Messages     []ChatMessage          `json:"messages"`
	EnableTools  bool                   `json:"enable_tools"`
	MaxToolCalls int                    `json:"max_tool_calls"`
	Context      map[string]interface{} `json:"context,omitempty"`
	Privacy      string                 `json:"privacy,omitempty"`
	Route        string                 `json:"route,omitempty"`
}

type ChatWithToolsResponse struct {
	Reply       string       `json:"reply"`
	Model       string       `json:"model,omitempty"`
	ToolCalls   []ToolCall   `json:"tool_calls"`
	ToolResults []ToolResult `json:"tool_results"`
}

func (c *AIClient) ChatWithTools(ctx context.Context, req ChatWithToolsRequest) (ChatWithToolsResponse, error) {
	if c.baseURL == "" {
		return ChatWithToolsResponse{}, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return ChatWithToolsResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/chat_with_tools", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return ChatWithToolsResponse{}, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return ChatWithToolsResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5MB limit for larger tool outputs
	if err != nil {
		return ChatWithToolsResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return ChatWithToolsResponse{}, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out ChatWithToolsResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ChatWithToolsResponse{}, err
	}
	return out, nil
}

// GuidedChatRequest represents a request to the guided learning endpoint.
type GuidedChatRequest struct {
	SessionID string        `json:"session_id,omitempty"`
	Topic     string        `json:"topic,omitempty"`
	Messages  []ChatMessage `json:"messages"`
	UserID    string        `json:"user_id"`
	CourseID  string        `json:"course_id,omitempty"`
	Privacy   string        `json:"privacy,omitempty"`
	Route     string        `json:"route,omitempty"`
}

// GuidedChatResponse represents a response from the guided learning endpoint.
type GuidedChatResponse struct {
	Reply              string                   `json:"reply"`
	SessionID          string                   `json:"session_id"`
	CurrentStep        int                      `json:"current_step"`
	TotalSteps         int                      `json:"total_steps"`
	ProgressPercentage float64                  `json:"progress_percentage"`
	WeakPoints         []string                 `json:"weak_points"`
	Citations          []map[string]interface{} `json:"citations"`
	ToolResults        []ToolResult             `json:"tool_results"`
	Model              string                   `json:"model,omitempty"`
	LearningPath       []map[string]interface{} `json:"learning_path"`
}

// DeriveGraphRAGRequest represents a structured derivation request.
type DeriveGraphRAGRequest struct {
	ProblemText      string `json:"problem_text"`
	CourseID         string `json:"course_id,omitempty"`
	UserID           string `json:"user_id,omitempty"`
	UserRole         string `json:"user_role,omitempty"`
	Mode             string `json:"mode,omitempty"`
	ResponseStyle    string `json:"response_style,omitempty"`
	VerificationMode string `json:"verification_mode,omitempty"`
	Privacy          string `json:"privacy,omitempty"`
	Route            string `json:"route,omitempty"`
}

// ChatGuided sends a request to the guided learning endpoint.
func (c *AIClient) ChatGuided(ctx context.Context, req GuidedChatRequest) (GuidedChatResponse, error) {
	if c.baseURL == "" {
		return GuidedChatResponse{}, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return GuidedChatResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/chat/guided", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return GuidedChatResponse{}, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return GuidedChatResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5MB limit
	if err != nil {
		return GuidedChatResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return GuidedChatResponse{}, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out GuidedChatResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return GuidedChatResponse{}, err
	}
	return out, nil
}

// DeriveGraphRAG sends a derivation request to the dedicated GraphRAG endpoint.
func (c *AIClient) DeriveGraphRAG(ctx context.Context, req DeriveGraphRAGRequest) (map[string]interface{}, error) {
	if c.baseURL == "" {
		return nil, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/derive/graphrag", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out map[string]interface{}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// WritingAnalysisRequest represents a request to analyze a writing sample.
type WritingAnalysisRequest struct {
	Content        string                 `json:"content"`
	WritingType    string                 `json:"writing_type"` // literature_review, course_paper, thesis, abstract
	Title          string                 `json:"title,omitempty"`
	StudentProfile map[string]interface{} `json:"student_profile,omitempty"`
	Privacy        string                 `json:"privacy,omitempty"`
	Route          string                 `json:"route,omitempty"`
}

// DimensionScore represents a score for a single evaluation dimension.
type DimensionScore struct {
	Name    string  `json:"name"`
	Score   float64 `json:"score"`
	Weight  float64 `json:"weight"`
	Comment string  `json:"comment"`
}

// WritingAnalysisResponse represents a response from the writing analysis endpoint.
type WritingAnalysisResponse struct {
	OverallScore float64          `json:"overall_score"`
	Dimensions   []DimensionScore `json:"dimensions"`
	Strengths    []string         `json:"strengths"`
	Improvements []string         `json:"improvements"`
	Summary      string           `json:"summary"`
	RawFeedback  string           `json:"raw_feedback"`
	WordCount    int              `json:"word_count"`
	WritingType  string           `json:"writing_type"`
	Model        string           `json:"model,omitempty"`
}

// AnalyzeWriting sends a writing sample to the AI service for analysis.
func (c *AIClient) AnalyzeWriting(ctx context.Context, req WritingAnalysisRequest) (WritingAnalysisResponse, error) {
	if c.baseURL == "" {
		return WritingAnalysisResponse{}, errors.New("AI base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return WritingAnalysisResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/writing/analyze", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return WritingAnalysisResponse{}, err
	}
	c.setCommonHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return WritingAnalysisResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5MB limit
	if err != nil {
		return WritingAnalysisResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return WritingAnalysisResponse{}, fmt.Errorf("ai service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out WritingAnalysisResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return WritingAnalysisResponse{}, err
	}
	return out, nil
}
