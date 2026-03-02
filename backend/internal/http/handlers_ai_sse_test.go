package http

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestWriteSSEData_EncodesSpecialCharacters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	expected := "stream \"failed\"\nnew line"
	writeSSEData(c, gin.H{"error": expected})

	body := w.Body.String()
	assert.Contains(t, body, "data: ")
	assert.True(t, strings.HasSuffix(body, "\n\n"))

	trimmed := strings.TrimSpace(body)
	payload := strings.TrimPrefix(trimmed, "data: ")
	var parsed map[string]string
	assert.NoError(t, json.Unmarshal([]byte(payload), &parsed))
	assert.Equal(t, expected, parsed["error"])
}
