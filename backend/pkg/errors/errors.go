package errors

import "net/http"

// AppError represents a structured application error with HTTP context
type AppError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"-"`
	Details    string `json:"details,omitempty"`
}

func (e *AppError) Error() string {
	if e.Details != "" {
		return e.Message + ": " + e.Details
	}
	return e.Message
}

// Constructor helpers for common error types

func NotFound(resource string) *AppError {
	return &AppError{
		Code:       CodeNotFound,
		Message:    resource + " not found",
		HTTPStatus: http.StatusNotFound,
	}
}

func Forbidden(action string) *AppError {
	return &AppError{
		Code:       CodeAccessDenied,
		Message:    "You do not have permission to " + action,
		HTTPStatus: http.StatusForbidden,
	}
}

func BadRequest(message string) *AppError {
	return &AppError{
		Code:       CodeInvalidInput,
		Message:    message,
		HTTPStatus: http.StatusBadRequest,
	}
}

func Unauthorized(message string) *AppError {
	return &AppError{
		Code:       CodeUnauthorized,
		Message:    message,
		HTTPStatus: http.StatusUnauthorized,
	}
}

func Internal(err error) *AppError {
	return &AppError{
		Code:       CodeInternalError,
		Message:    "Internal server error",
		HTTPStatus: http.StatusInternalServerError,
		Details:    err.Error(),
	}
}

func Conflict(resource string) *AppError {
	return &AppError{
		Code:       CodeConflict,
		Message:    resource + " already exists",
		HTTPStatus: http.StatusConflict,
	}
}
