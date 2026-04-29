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
	"sync"
	"time"
)

const feishuBaseURL = "https://open.feishu.cn"

// FeishuConfig holds Feishu Open Platform configuration.
type FeishuConfig struct {
	AppID      string
	AppSecret  string
	BotWebhook string
}

// FeishuClient handles Feishu Open Platform API interactions.
type FeishuClient struct {
	appID       string
	appSecret   string
	botWebhook  string
	baseURL     string
	httpClient  *http.Client
	accessToken string
	tokenExpiry time.Time
	tokenMu     sync.RWMutex
}

// NewFeishuClient creates a Feishu client using the production base URL.
func NewFeishuClient(cfg FeishuConfig) *FeishuClient {
	return NewFeishuClientWithBase(cfg, feishuBaseURL)
}

// NewFeishuClientWithBase creates a Feishu client with a custom base URL for tests.
func NewFeishuClientWithBase(cfg FeishuConfig, baseURL string) *FeishuClient {
	return &FeishuClient{
		appID:      cfg.AppID,
		appSecret:  cfg.AppSecret,
		botWebhook: cfg.BotWebhook,
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// IsConfigured returns true when the OAuth configuration is present.
func (c *FeishuClient) IsConfigured() bool {
	return c.appID != "" && c.appSecret != ""
}

// HasBotWebhook returns true when a bot webhook is configured.
func (c *FeishuClient) HasBotWebhook() bool {
	return strings.TrimSpace(c.botWebhook) != ""
}

type feishuTenantAccessTokenResponse struct {
	Code              int    `json:"code"`
	Msg               string `json:"msg"`
	TenantAccessToken string `json:"tenant_access_token"`
	Expire            int    `json:"expire"`
}

// GetAccessToken retrieves or refreshes the tenant access token.
func (c *FeishuClient) GetAccessToken(ctx context.Context) (string, error) {
	c.tokenMu.RLock()
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		token := c.accessToken
		c.tokenMu.RUnlock()
		return token, nil
	}
	c.tokenMu.RUnlock()

	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.accessToken, nil
	}

	body, err := json.Marshal(map[string]string{
		"app_id":     c.appID,
		"app_secret": c.appSecret,
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/open-apis/auth/v3/tenant_access_token/internal",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request access token: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var result feishuTenantAccessTokenResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}
	if result.Code != 0 {
		return "", fmt.Errorf("feishu error %d: %s", result.Code, result.Msg)
	}

	c.accessToken = result.TenantAccessToken
	c.tokenExpiry = time.Now().Add(tokenLifetime(result.Expire))
	return c.accessToken, nil
}

// FeishuUserInfo is the normalized user profile returned from Feishu login.
type FeishuUserInfo struct {
	OpenID  string `json:"open_id"`
	UnionID string `json:"union_id"`
	UserID  string `json:"user_id"`
	Name    string `json:"name"`
	Avatar  string `json:"avatar_url"`
	Mobile  string `json:"mobile"`
	Email   string `json:"email"`
}

type feishuUserAccessTokenResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	} `json:"data"`
}

type feishuUserInfoResponse struct {
	Code int            `json:"code"`
	Msg  string         `json:"msg"`
	Data FeishuUserInfo `json:"data"`
}

// GetUserInfoByCode exchanges an OAuth code for Feishu user information.
func (c *FeishuClient) GetUserInfoByCode(ctx context.Context, code string) (*FeishuUserInfo, error) {
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("code is required")
	}

	tenantToken, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get access token: %w", err)
	}

	userToken, err := c.exchangeCodeForUserToken(ctx, tenantToken, code)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/open-apis/authen/v1/user_info", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+userToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request user info: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result feishuUserInfoResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("feishu error %d: %s", result.Code, result.Msg)
	}

	return &result.Data, nil
}

func (c *FeishuClient) exchangeCodeForUserToken(ctx context.Context, tenantToken, code string) (string, error) {
	body, err := json.Marshal(map[string]string{
		"grant_type": "authorization_code",
		"code":       code,
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/open-apis/authen/v1/access_token",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tenantToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request user token: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var result feishuUserAccessTokenResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}
	if result.Code != 0 {
		return "", fmt.Errorf("feishu error %d: %s", result.Code, result.Msg)
	}
	if strings.TrimSpace(result.Data.AccessToken) == "" {
		return "", errors.New("feishu user access token is empty")
	}

	return result.Data.AccessToken, nil
}

type feishuBotMessageRequest struct {
	MsgType string `json:"msg_type"`
	Content struct {
		Text string `json:"text"`
	} `json:"content"`
}

type feishuBotMessageResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

// SendBotTextMessage posts a text message to the configured Feishu bot webhook.
func (c *FeishuClient) SendBotTextMessage(ctx context.Context, content string) error {
	if strings.TrimSpace(c.botWebhook) == "" {
		return errors.New("feishu bot webhook is not configured")
	}
	if strings.TrimSpace(content) == "" {
		return errors.New("content is required")
	}

	var payload feishuBotMessageRequest
	payload.MsgType = "text"
	payload.Content.Text = content

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.botWebhook, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send bot message: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	var result feishuBotMessageResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("parse response: %w", err)
	}
	if result.Code != 0 {
		return fmt.Errorf("feishu error %d: %s", result.Code, result.Msg)
	}

	return nil
}

func tokenLifetime(expiresIn int) time.Duration {
	if expiresIn <= 300 {
		if expiresIn <= 0 {
			return time.Minute
		}
		return time.Duration(expiresIn) * time.Second
	}
	return time.Duration(expiresIn-300) * time.Second
}
