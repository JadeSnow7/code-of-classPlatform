package clients

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestChatPropagatesHeadersAndRoutingFields(t *testing.T) {
	t.Parallel()

	client := NewAIClient("http://ai.local", "gateway-token")
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/chat" {
				t.Fatalf("unexpected path: %s", r.URL.Path)
			}
			if got := r.Header.Get("X-Request-ID"); got != "req-123" {
				t.Fatalf("unexpected X-Request-ID: %q", got)
			}
			if got := r.Header.Get("X-AI-Gateway-Token"); got != "gateway-token" {
				t.Fatalf("unexpected X-AI-Gateway-Token: %q", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["privacy"]; got != "public" {
				t.Fatalf("unexpected privacy: %#v", got)
			}
			if got := payload["route"]; got != "auto" {
				t.Fatalf("unexpected route: %#v", got)
			}
			if got := payload["course_id"]; got != "em-101" {
				t.Fatalf("unexpected course_id: %#v", got)
			}
			if got := payload["user_id"]; got != "student-1" {
				t.Fatalf("unexpected user_id: %#v", got)
			}
			if got := payload["user_role"]; got != "student" {
				t.Fatalf("unexpected user_role: %#v", got)
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"reply":"ok","model":"local-model"}`)),
				Header:     make(http.Header),
				Request:    r,
			}
			resp.Header.Set("Content-Type", "application/json")
			return resp, nil
		}),
	}

	ctx := WithRequestID(context.Background(), "req-123")
	_, err := client.Chat(ctx, ChatRequest{
		Mode: "tutor",
		Messages: []ChatMessage{
			{Role: "user", Content: "hello"},
		},
		CourseID: "em-101",
		UserID:   "student-1",
		UserRole: "student",
		Privacy:  "public",
		Route:    "auto",
	})
	if err != nil {
		t.Fatalf("chat failed: %v", err)
	}
}

func TestStreamChatPropagatesACLFields(t *testing.T) {
	t.Parallel()

	client := NewAIClient("http://ai.local", "gateway-token")
	client.streamHTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/chat" {
				t.Fatalf("unexpected path: %s", r.URL.Path)
			}
			if got := r.Header.Get("X-Request-ID"); got != "req-stream-123" {
				t.Fatalf("unexpected X-Request-ID: %q", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["stream"]; got != true {
				t.Fatalf("unexpected stream flag: %#v", got)
			}
			if got := payload["course_id"]; got != "em-202" {
				t.Fatalf("unexpected course_id: %#v", got)
			}
			if got := payload["user_id"]; got != "teacher-7" {
				t.Fatalf("unexpected user_id: %#v", got)
			}
			if got := payload["user_role"]; got != "teacher" {
				t.Fatalf("unexpected user_role: %#v", got)
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("data: {\"type\":\"done\"}\n\n")),
				Header:     make(http.Header),
				Request:    r,
			}
			resp.Header.Set("Content-Type", "text/event-stream")
			return resp, nil
		}),
	}

	ctx := WithRequestID(context.Background(), "req-stream-123")
	body, err := client.StreamChat(ctx, ChatRequest{
		Mode:     "tutor",
		Messages: []ChatMessage{{Role: "user", Content: "stream me"}},
		CourseID: "em-202",
		UserID:   "teacher-7",
		UserRole: "teacher",
	})
	if err != nil {
		t.Fatalf("stream chat failed: %v", err)
	}
	defer body.Close()
}

func TestChatMultimodalPropagatesHeadersAndBody(t *testing.T) {
	t.Parallel()

	client := NewAIClient("http://ai.local", "gateway-token")
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/chat/multimodal" {
				t.Fatalf("unexpected path: %s", r.URL.Path)
			}
			if got := r.Header.Get("X-Request-ID"); got != "req-mm-123" {
				t.Fatalf("unexpected X-Request-ID: %q", got)
			}
			if got := r.Header.Get("X-AI-Gateway-Token"); got != "gateway-token" {
				t.Fatalf("unexpected X-AI-Gateway-Token: %q", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["model_family"]; got != "qwen3_vl" {
				t.Fatalf("unexpected model_family: %#v", got)
			}
			if got := payload["privacy"]; got != "public" {
				t.Fatalf("unexpected privacy: %#v", got)
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"reply":"ok-mm","model":"qwen3-vl"}`)),
				Header:     make(http.Header),
				Request:    r,
			}
			resp.Header.Set("Content-Type", "application/json")
			return resp, nil
		}),
	}

	ctx := WithRequestID(context.Background(), "req-mm-123")
	_, err := client.ChatMultimodal(ctx, ChatMultimodalRequest{
		Mode: "tutor",
		Messages: []MultimodalChatMessage{
			{
				Role:    "user",
				Content: "请解释这张图",
				Parts: []MultimodalPart{
					{Type: "image_url", URL: "https://example.com/test.png"},
				},
			},
		},
		Privacy:     "public",
		Route:       "local",
		ModelFamily: "qwen3_vl",
	})
	if err != nil {
		t.Fatalf("chat multimodal failed: %v", err)
	}
}

func TestAnalyzeWritingPropagatesHeaders(t *testing.T) {
	t.Parallel()

	client := NewAIClient("http://ai.local", "gateway-token")
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/writing/analyze" {
				t.Fatalf("unexpected path: %s", r.URL.Path)
			}
			if got := r.Header.Get("X-Request-ID"); got != "req-writing" {
				t.Fatalf("unexpected X-Request-ID: %q", got)
			}
			if got := r.Header.Get("X-AI-Gateway-Token"); got != "gateway-token" {
				t.Fatalf("unexpected X-AI-Gateway-Token: %q", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["privacy"]; got != "private" {
				t.Fatalf("unexpected privacy: %#v", got)
			}
			if got := payload["route"]; got != "local" {
				t.Fatalf("unexpected route: %#v", got)
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"overall_score":8.1,"dimensions":[],"strengths":[],"improvements":[],"summary":"ok","raw_feedback":"ok","word_count":100,"writing_type":"course_paper","model":"m"}`)),
				Header:     make(http.Header),
				Request:    r,
			}
			resp.Header.Set("Content-Type", "application/json")
			return resp, nil
		}),
	}

	ctx := WithRequestID(context.Background(), "req-writing")
	_, err := client.AnalyzeWriting(ctx, WritingAnalysisRequest{
		Content:     "test content",
		WritingType: "course_paper",
		Privacy:     "private",
		Route:       "local",
	})
	if err != nil {
		t.Fatalf("analyze writing failed: %v", err)
	}
}

func TestStreamOrchestratedChatUsesMultiAgentBaseURL(t *testing.T) {
	t.Parallel()

	client := NewAIClient(
		"http://ai.local",
		"gateway-token",
		WithOrchestratedBaseURL("http://multi-agent.local"),
		WithOrchestratedEnabled(true),
	)
	client.streamHTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "http://multi-agent.local/v1/chat/orchestrated" {
				t.Fatalf("unexpected url: %s", r.URL.String())
			}
			if got := r.Header.Get("X-Request-ID"); got != "req-orchestrated" {
				t.Fatalf("unexpected X-Request-ID: %q", got)
			}
			if got := r.Header.Get("X-AI-Gateway-Token"); got != "gateway-token" {
				t.Fatalf("unexpected X-AI-Gateway-Token: %q", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["stream"]; got != true {
				t.Fatalf("unexpected stream flag: %#v", got)
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("data: {\"type\":\"start\",\"request_id\":\"req-orchestrated\"}\n\n")),
				Header:     make(http.Header),
				Request:    r,
			}
			resp.Header.Set("Content-Type", "text/event-stream")
			return resp, nil
		}),
	}

	ctx := WithRequestID(context.Background(), "req-orchestrated")
	body, err := client.StreamOrchestratedChat(ctx, OrchestratedChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "test"}},
	})
	if err != nil {
		t.Fatalf("stream orchestrated chat failed: %v", err)
	}
	defer body.Close()
}
