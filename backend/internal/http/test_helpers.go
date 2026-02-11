package http

// envelope is used in tests to parse response JSON.
type envelope[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data,omitempty"`
	Error   *struct {
		Code    string      `json:"code,omitempty"`
		Message string      `json:"message"`
		Details interface{} `json:"details,omitempty"`
	} `json:"error,omitempty"`
}
