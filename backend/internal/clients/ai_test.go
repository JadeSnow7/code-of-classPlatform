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
		Privacy: "public",
		Route:   "auto",
	})
	if err != nil {
		t.Fatalf("chat failed: %v", err)
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
