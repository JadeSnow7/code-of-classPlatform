package http

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type knowledgeExportHandlers struct {
	service services.KnowledgeExportService
}

func NewKnowledgeExportHandlers(service services.KnowledgeExportService) *knowledgeExportHandlers {
	return &knowledgeExportHandlers{service: service}
}

func newKnowledgeExportHandlers(service services.KnowledgeExportService) *knowledgeExportHandlers {
	return NewKnowledgeExportHandlers(service)
}

func (h *knowledgeExportHandlers) Bootstrap(c *gin.Context) {
	courseID, ok := parseOptionalUintQuery(c, "course_id")
	if !ok {
		return
	}
	batch, err := h.service.Bootstrap(c.Request.Context(), courseID)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, batch)
}

func (h *knowledgeExportHandlers) Changes(c *gin.Context) {
	courseID, ok := parseOptionalUintQuery(c, "course_id")
	if !ok {
		return
	}
	batch, err := h.service.Changes(c.Request.Context(), c.Query("cursor"), courseID)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, batch)
}

func (h *knowledgeExportHandlers) Document(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid document id")
		return
	}
	item, err := h.service.Document(c.Request.Context(), c.Param("kind"), uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "knowledge document")
			return
		}
		response.Error(c, err)
		return
	}
	response.OK(c, item)
}

func parseOptionalUintQuery(c *gin.Context, key string) (*uint, bool) {
	raw := c.Query(key)
	if raw == "" {
		return nil, true
	}
	value, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid "+key)
		return nil, false
	}
	parsed := uint(value)
	return &parsed, true
}
