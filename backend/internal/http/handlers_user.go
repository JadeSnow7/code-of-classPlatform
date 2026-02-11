package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type userHandlers struct {
	service services.UserService
}

func NewUserHandlers(service services.UserService) *userHandlers {
	return &userHandlers{service: service}
}

func newUserHandlers(service services.UserService) *userHandlers {
	return NewUserHandlers(service)
}

// GetStats returns user statistics based on role
func (h *userHandlers) GetStats(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	switch u.Role {
	case "student":
		stats, err := h.service.GetStudentStats(c.Request.Context(), u.ID)
		if err != nil {
			response.Error(c, err)
			return
		}
		response.OK(c, stats)
	case "teacher", "admin", "assistant":
		stats, err := h.service.GetTeacherStats(c.Request.Context(), u.ID, u.Role)
		if err != nil {
			response.Error(c, err)
			return
		}
		response.OK(c, stats)
	default:
		response.OK(c, gin.H{})
	}
}
