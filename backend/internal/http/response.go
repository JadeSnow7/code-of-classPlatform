package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type apiError struct {
	Code    string      `json:"code,omitempty"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

type envelope[T any] struct {
	Success bool      `json:"success"`
	Data    T         `json:"data,omitempty"`
	Error   *apiError `json:"error,omitempty"`
}

type apiEnvelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *apiError   `json:"error,omitempty"`
}

func respondOK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, apiEnvelope{Success: true, Data: data})
}

func respondCreated(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, apiEnvelope{Success: true, Data: data})
}

func respondError(c *gin.Context, status int, code string, message string, details interface{}) {
	c.JSON(status, apiEnvelope{Success: false, Error: &apiError{Code: code, Message: message, Details: details}})
}
