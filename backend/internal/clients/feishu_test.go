package clients

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestFeishuGetAccessTokenCachesToken(t *testing.T) {
	var tokenCalls int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/open-apis/auth/v3/tenant_access_token/internal":
			if r.Method != http.MethodPost {
				t.Fatalf("unexpected method: %s", r.Method)
			}
			if got := atomic.AddInt32(&tokenCalls, 1); got > 1 {
				t.Fatalf("token endpoint called too many times: %d", got)
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]string
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["app_id"]; got != "cli-test" {
				t.Fatalf("unexpected app_id: %q", got)
			}
			if got := payload["app_secret"]; got != "secret-test" {
				t.Fatalf("unexpected app_secret: %q", got)
			}

			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"msg":"ok","tenant_access_token":"tenant-token","expire":7200}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewFeishuClientWithBase(FeishuConfig{
		AppID:     "cli-test",
		AppSecret: "secret-test",
	}, server.URL)

	ctx := context.Background()
	first, err := client.GetAccessToken(ctx)
	if err != nil {
		t.Fatalf("first token fetch failed: %v", err)
	}
	second, err := client.GetAccessToken(ctx)
	if err != nil {
		t.Fatalf("second token fetch failed: %v", err)
	}

	if first != "tenant-token" || second != "tenant-token" {
		t.Fatalf("unexpected tokens: %q %q", first, second)
	}
	if got := atomic.LoadInt32(&tokenCalls); got != 1 {
		t.Fatalf("expected 1 token request, got %d", got)
	}
}

func TestFeishuGetUserInfoByCode(t *testing.T) {
	var tokenCalls int32
	var userCalls int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/open-apis/auth/v3/tenant_access_token/internal":
			atomic.AddInt32(&tokenCalls, 1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"msg":"ok","tenant_access_token":"tenant-token","expire":7200}`))
		case "/open-apis/authen/v1/access_token":
			if got := r.Header.Get("Authorization"); got != "Bearer tenant-token" {
				t.Fatalf("unexpected authorization header: %q", got)
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body failed: %v", err)
			}
			var payload map[string]string
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("unmarshal body failed: %v", err)
			}
			if got := payload["grant_type"]; got != "authorization_code" {
				t.Fatalf("unexpected grant_type: %q", got)
			}
			if got := payload["code"]; got != "oauth-code-123" {
				t.Fatalf("unexpected code: %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"msg":"ok","data":{"access_token":"user-token","expires_in":7200}}`))
		case "/open-apis/authen/v1/user_info":
			if got := r.Header.Get("Authorization"); got != "Bearer user-token" {
				t.Fatalf("unexpected authorization header: %q", got)
			}
			atomic.AddInt32(&userCalls, 1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"msg":"ok","data":{"name":"Zhang San","en_name":"Zhang San","avatar_url":"https://example.com/avatar.png","open_id":"ou_123","union_id":"on_456","email":"zhangsan@example.com","user_id":"u_789","mobile":"13800000000"}}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewFeishuClientWithBase(FeishuConfig{
		AppID:     "cli-test",
		AppSecret: "secret-test",
	}, server.URL)

	info, err := client.GetUserInfoByCode(context.Background(), "oauth-code-123")
	if err != nil {
		t.Fatalf("get user info failed: %v", err)
	}

	if info == nil {
		t.Fatal("expected user info")
	}
	if info.Name != "Zhang San" {
		t.Fatalf("unexpected name: %q", info.Name)
	}
	if info.OpenID != "ou_123" {
		t.Fatalf("unexpected open_id: %q", info.OpenID)
	}
	if info.UserID != "u_789" {
		t.Fatalf("unexpected user_id: %q", info.UserID)
	}
	if got := atomic.LoadInt32(&tokenCalls); got != 1 {
		t.Fatalf("expected 1 token request, got %d", got)
	}
	if got := atomic.LoadInt32(&userCalls); got != 1 {
		t.Fatalf("expected 1 user info request, got %d", got)
	}
}

func TestFeishuSendBotTextMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/open-apis/bot/v2/hook/test-webhook" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body failed: %v", err)
		}
		gotBody := strings.TrimSpace(string(body))
		wantBody := `{"msg_type":"text","content":{"text":"Hello Feishu"}}`
		if gotBody != wantBody {
			t.Fatalf("unexpected body: %s", gotBody)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"msg":"ok"}`))
	}))
	defer server.Close()

	client := NewFeishuClientWithBase(FeishuConfig{
		BotWebhook: server.URL + "/open-apis/bot/v2/hook/test-webhook",
	}, server.URL)

	if err := client.SendBotTextMessage(context.Background(), "Hello Feishu"); err != nil {
		t.Fatalf("send bot message failed: %v", err)
	}
}
