package clients

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// WecomClient handles WeChat Work API interactions
type WecomClient struct {
	corpID      string
	agentID     string
	secret      string
	httpClient  *http.Client
	accessToken string
	tokenExpiry time.Time
	tokenMu     sync.RWMutex
}

// WecomConfig holds WeChat Work configuration
type WecomConfig struct {
	CorpID  string
	AgentID string
	Secret  string
}

// NewWecomClient creates a new WeChat Work API client
func NewWecomClient(cfg WecomConfig) *WecomClient {
	return &WecomClient{
		corpID:  cfg.CorpID,
		agentID: cfg.AgentID,
		secret:  cfg.Secret,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// IsConfigured returns true if WeChat Work is properly configured
func (c *WecomClient) IsConfigured() bool {
	return c.corpID != "" && c.secret != ""
}

// GetCorpID returns the configured Corp ID
func (c *WecomClient) GetCorpID() string {
	return c.corpID
}

// GetAgentID returns the configured Agent ID
func (c *WecomClient) GetAgentID() string {
	return c.agentID
}

// accessTokenResponse is the response from gettoken API
type accessTokenResponse struct {
	ErrCode     int    `json:"errcode"`
	ErrMsg      string `json:"errmsg"`
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

// GetAccessToken retrieves or refreshes the access token
func (c *WecomClient) GetAccessToken(ctx context.Context) (string, error) {
	c.tokenMu.RLock()
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		token := c.accessToken
		c.tokenMu.RUnlock()
		return token, nil
	}
	c.tokenMu.RUnlock()

	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	// Double-check after acquiring write lock
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.accessToken, nil
	}

	url := fmt.Sprintf(
		"https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
		c.corpID, c.secret,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request access token: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var result accessTokenResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if result.ErrCode != 0 {
		return "", fmt.Errorf("wecom error %d: %s", result.ErrCode, result.ErrMsg)
	}

	c.accessToken = result.AccessToken
	// Refresh 5 minutes before expiry
	c.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-300) * time.Second)

	return c.accessToken, nil
}

// UserInfo represents user information from WeChat Work
type UserInfo struct {
	UserID     string `json:"userid"`
	OpenUserID string `json:"open_userid"`
	DeviceID   string `json:"deviceid"`
}

// userInfoResponse is the response from getuserinfo API
type userInfoResponse struct {
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
	UserID     string `json:"userid"`
	OpenUserID string `json:"open_userid"`
	DeviceID   string `json:"deviceid"`
}

// GetUserInfoByCode exchanges OAuth code for user info
func (c *WecomClient) GetUserInfoByCode(ctx context.Context, code string) (*UserInfo, error) {
	if code == "" {
		return nil, errors.New("code is required")
	}

	accessToken, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get access token: %w", err)
	}

	url := fmt.Sprintf(
		"https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
		accessToken, code,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request user info: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result userInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if result.ErrCode != 0 {
		return nil, fmt.Errorf("wecom error %d: %s", result.ErrCode, result.ErrMsg)
	}

	return &UserInfo{
		UserID:     result.UserID,
		OpenUserID: result.OpenUserID,
		DeviceID:   result.DeviceID,
	}, nil
}

// UserDetail represents detailed user information
type UserDetail struct {
	UserID     string `json:"userid"`
	Name       string `json:"name"`
	Department []int  `json:"department"`
	Position   string `json:"position"`
	Mobile     string `json:"mobile"`
	Email      string `json:"email"`
	Avatar     string `json:"avatar"`
	Status     int    `json:"status"`
}

// userDetailResponse is the response from user/get API
type userDetailResponse struct {
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
	UserID     string `json:"userid"`
	Name       string `json:"name"`
	Department []int  `json:"department"`
	Position   string `json:"position"`
	Mobile     string `json:"mobile"`
	Email      string `json:"email"`
	Avatar     string `json:"avatar"`
	Status     int    `json:"status"`
}

// GetUserDetail retrieves detailed user information by user ID
func (c *WecomClient) GetUserDetail(ctx context.Context, userID string) (*UserDetail, error) {
	if userID == "" {
		return nil, errors.New("userID is required")
	}

	accessToken, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get access token: %w", err)
	}

	url := fmt.Sprintf(
		"https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=%s&userid=%s",
		accessToken, userID,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request user detail: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result userDetailResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if result.ErrCode != 0 {
		return nil, fmt.Errorf("wecom error %d: %s", result.ErrCode, result.ErrMsg)
	}

	return &UserDetail{
		UserID:     result.UserID,
		Name:       result.Name,
		Department: result.Department,
		Position:   result.Position,
		Mobile:     result.Mobile,
		Email:      result.Email,
		Avatar:     result.Avatar,
		Status:     result.Status,
	}, nil
}

// JSSDKSignature represents JS-SDK signature info
type JSSDKSignature struct {
	Timestamp int64  `json:"timestamp"`
	NonceStr  string `json:"noncestr"`
	Signature string `json:"signature"`
}

// jsapiTicketResponse is the response from get_jsapi_ticket API
type jsapiTicketResponse struct {
	ErrCode   int    `json:"errcode"`
	ErrMsg    string `json:"errmsg"`
	Ticket    string `json:"ticket"`
	ExpiresIn int    `json:"expires_in"`
}

var (
	jsapiTicket       string
	jsapiTicketExpiry time.Time
	jsapiTicketMu     sync.RWMutex
)

// GetJSAPITicket retrieves the jsapi_ticket for JS-SDK
func (c *WecomClient) GetJSAPITicket(ctx context.Context) (string, error) {
	jsapiTicketMu.RLock()
	if jsapiTicket != "" && time.Now().Before(jsapiTicketExpiry) {
		ticket := jsapiTicket
		jsapiTicketMu.RUnlock()
		return ticket, nil
	}
	jsapiTicketMu.RUnlock()

	jsapiTicketMu.Lock()
	defer jsapiTicketMu.Unlock()

	// Double-check
	if jsapiTicket != "" && time.Now().Before(jsapiTicketExpiry) {
		return jsapiTicket, nil
	}

	accessToken, err := c.GetAccessToken(ctx)
	if err != nil {
		return "", fmt.Errorf("get access token: %w", err)
	}

	url := fmt.Sprintf(
		"https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=%s",
		accessToken,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request jsapi ticket: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var result jsapiTicketResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if result.ErrCode != 0 {
		return "", fmt.Errorf("wecom error %d: %s", result.ErrCode, result.ErrMsg)
	}

	jsapiTicket = result.Ticket
	jsapiTicketExpiry = time.Now().Add(time.Duration(result.ExpiresIn-300) * time.Second)

	return jsapiTicket, nil
}
