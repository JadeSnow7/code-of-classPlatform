package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
	apperrors "github.com/huaodong/llm-teaching-platform/backend/pkg/errors"
)

// Envelope wraps all API responses in a consistent structure
type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *ErrorInfo  `json:"error,omitempty"`
}

type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// OK sends a successful response with data
func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Envelope{
		Success: true,
		Data:    data,
	})
}

// Created sends a 201 response for resource creation
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Envelope{
		Success: true,
		Data:    data,
	})
}

// NoContent sends a 204 response with no body
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// Error sends an error response based on AppError
func Error(c *gin.Context, err error) {
	switch e := err.(type) {
	case *apperrors.AppError:
		c.JSON(e.HTTPStatus, Envelope{
			Success: false,
			Error: &ErrorInfo{
				Code:    e.Code,
				Message: e.Message,
				Details: e.Details,
			},
		})
	default:
		// Fallback for non-AppError types
		c.JSON(http.StatusInternalServerError, Envelope{
			Success: false,
			Error: &ErrorInfo{
				Code:    apperrors.CodeInternalError,
				Message: "Internal server error",
				Details: err.Error(),
			},
		})
	}
}

// BadRequest is a shorthand for common 400 errors
func BadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, Envelope{
		Success: false,
		Error: &ErrorInfo{
			Code:    apperrors.CodeInvalidInput,
			Message: message,
		},
	})
}

// Unauthorized is a shorthand for 401 errors
func Unauthorized(c *gin.Context, message string) {
	c.JSON(http.StatusUnauthorized, Envelope{
		Success: false,
		Error: &ErrorInfo{
			Code:    apperrors.CodeUnauthorized,
			Message: message,
		},
	})
}

// Forbidden is a shorthand for 403 errors
func Forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, Envelope{
		Success: false,
		Error: &ErrorInfo{
			Code:    apperrors.CodeAccessDenied,
			Message: message,
		},
	})
}

// NotFound is a shorthand for 404 errors
func NotFound(c *gin.Context, resource string) {
	c.JSON(http.StatusNotFound, Envelope{
		Success: false,
		Error: &ErrorInfo{
			Code:    apperrors.CodeNotFound,
			Message: resource + " not found",
		},
	})
}
