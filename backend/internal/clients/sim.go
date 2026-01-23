package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Laplace2DRequest struct {
	NX        int     `json:"nx"`
	NY        int     `json:"ny"`
	VTop      float64 `json:"v_top"`
	VBottom   float64 `json:"v_bottom"`
	VLeft     float64 `json:"v_left"`
	VRight    float64 `json:"v_right"`
	MaxIter   int     `json:"max_iter"`
	Tolerance float64 `json:"tolerance"`
}

type Laplace2DResponse struct {
	PngBase64 string  `json:"png_base64"`
	MinV      float64 `json:"min_v"`
	MaxV      float64 `json:"max_v"`
	Iter      int     `json:"iter"`
}

type SimClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewSimClient(baseURL string) *SimClient {
	return &SimClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 60 * time.Second, // Increased timeout for complex simulations
		},
	}
}

// Laplace2D performs the legacy 2D Laplace equation simulation
func (c *SimClient) Laplace2D(ctx context.Context, req Laplace2DRequest) (Laplace2DResponse, error) {
	if c.baseURL == "" {
		return Laplace2DResponse{}, errors.New("SIM base url is empty")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return Laplace2DResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/sim/laplace2d", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return Laplace2DResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return Laplace2DResponse{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return Laplace2DResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return Laplace2DResponse{}, fmt.Errorf("sim service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	var out Laplace2DResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return Laplace2DResponse{}, err
	}
	return out, nil
}

// ProxyRequest is a generic method to proxy requests to the simulation service
// It forwards the request body and returns the response as raw JSON
func (c *SimClient) ProxyRequest(ctx context.Context, path string, reqBody []byte) (json.RawMessage, error) {
	if c.baseURL == "" {
		return nil, errors.New("SIM base url is empty")
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s%s", c.baseURL, path), bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sim service error: status=%d body=%s", resp.StatusCode, string(b))
	}

	return json.RawMessage(b), nil
}
