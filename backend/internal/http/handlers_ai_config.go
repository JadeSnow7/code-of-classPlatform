package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type aiConfigHandlers struct {
	service services.AIConfigService
}

func NewAIConfigHandlers(service services.AIConfigService) *aiConfigHandlers {
	return &aiConfigHandlers{service: service}
}

func newAIConfigHandlers(service services.AIConfigService) *aiConfigHandlers {
	return NewAIConfigHandlers(service)
}

func (h *aiConfigHandlers) GetMyAIConfig(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	profile, err := h.service.GetProfile(c.Request.Context(), u.ID)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, profile)
}

func (h *aiConfigHandlers) PatchMyAIConfig(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	var req services.UpdateAIConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	profile, err := h.service.PatchProfile(c.Request.Context(), u.ID, req)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, profile)
}
