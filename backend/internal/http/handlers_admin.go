package http

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
)

type adminHandlers struct {
	service services.AdminService
}

func NewAdminHandlers(service services.AdminService) *adminHandlers {
	return &adminHandlers{service: service}
}

func newAdminHandlers(service services.AdminService) *adminHandlers {
	return NewAdminHandlers(service)
}

// SystemStats represents overall system statistics
type SystemStats struct {
	TotalUsers       int64            `json:"total_users"`
	TotalCourses     int64            `json:"total_courses"`
	TotalAssignments int64            `json:"total_assignments"`
	TotalSubmissions int64            `json:"total_submissions"`
	TotalQuizzes     int64            `json:"total_quizzes"`
	TotalResources   int64            `json:"total_resources"`
	UsersByRole      map[string]int64 `json:"users_by_role"`
}

// UserListItem represents a user in the admin list
type UserListItem struct {
	ID        uint   `json:"id"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

// GetSystemStats returns overall system statistics
func (h *adminHandlers) GetSystemStats(c *gin.Context) {
	stats, err := h.service.GetSystemStats(c.Request.Context())
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, stats)
}

// ListUsers returns a list of all users
func (h *adminHandlers) ListUsers(c *gin.Context) {
	roleFilter := c.Query("role")

	// Use service to list users
	usersPtr, err := h.service.ListUsers(c.Request.Context(), roleFilter)
	if err != nil {
		response.Error(c, err)
		return
	}

	result := make([]UserListItem, len(usersPtr))
	for i, u := range usersPtr {
		result[i] = UserListItem{
			ID:        u.ID,
			Username:  u.Username,
			Role:      u.Role,
			Name:      u.Name,
			Status:    u.Status,
			CreatedAt: u.CreatedAt.Format("2006-01-02 15:04"),
		}
	}

	response.OK(c, gin.H{"users": result})
}

// CreateUserRequest is the request body for creating a user
type CreateUserRequest struct {
	Username           string `json:"username" binding:"required"`
	Password           string `json:"password,omitempty"`
	Role               string `json:"role" binding:"required,oneof=admin teacher assistant student"`
	Name               string `json:"name" binding:"required"`
	SendInvite         *bool  `json:"send_invite,omitempty"`
	ActivationTTLHours *int   `json:"activation_ttl_hours,omitempty"`
}

// CreateUser creates a new user
func (h *adminHandlers) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	user := &models.User{
		Username: req.Username,
		Role:     req.Role,
		Name:     req.Name,
	}

	currentUser, _ := middleware.GetUser(c)
	sendInvite := true
	if req.SendInvite != nil {
		sendInvite = *req.SendInvite
	}
	if !sendInvite && req.Password == "" {
		response.BadRequest(c, "password is required when send_invite is false")
		return
	}

	result, err := h.service.CreateUser(c.Request.Context(), user, req.Password, services.AdminCreateUserOptions{
		SendInvite:         sendInvite,
		ActivationTTLHours: valueOrZero(req.ActivationTTLHours),
		InvitedBy:          currentUser.ID,
	})
	if err != nil {
		if errors.Is(err, services.ErrUsernameExists) {
			response.Error(c, err)
			return
		}
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"id":         result.User.ID,
		"username":   result.User.Username,
		"role":       result.User.Role,
		"name":       result.User.Name,
		"status":     result.User.Status,
		"invite":     result.Invite,
		"invite_url": result.InviteURL,
	})
}

// UpdateUserRequest is the request body for updating a user
type UpdateUserRequest struct {
	Password string `json:"password,omitempty"`
	Role     string `json:"role,omitempty"`
	Name     string `json:"name,omitempty"`
	Status   string `json:"status,omitempty"`
}

// UpdateUser updates an existing user
func (h *adminHandlers) UpdateUser(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}
	id := uint(id64)

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := map[string]interface{}{}

	if req.Password != "" {
		passwordHash, err := auth.HashPassword(req.Password)
		if err != nil {
			response.Error(c, err)
			return
		}
		updates["password_hash"] = passwordHash
	}

	if req.Role != "" {
		if req.Role != "admin" && req.Role != "teacher" && req.Role != "assistant" && req.Role != "student" {
			response.BadRequest(c, "Invalid role")
			return
		}
		updates["role"] = req.Role
	}

	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Status != "" {
		if req.Status != models.UserStatusPendingActivation && req.Status != models.UserStatusActive && req.Status != models.UserStatusDisabled {
			response.BadRequest(c, "Invalid status")
			return
		}
		updates["status"] = req.Status
	}

	updated, err := h.service.UpdateUser(c.Request.Context(), id, updates)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{
		"id":       updated.ID,
		"username": updated.Username,
		"role":     updated.Role,
		"name":     updated.Name,
		"status":   updated.Status,
	})
}

// DeleteUser deletes a user
func (h *adminHandlers) DeleteUser(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}
	id := uint(id64)
	currentUser, _ := middleware.GetUser(c)

	// Prevent deleting yourself
	if id == currentUser.ID {
		response.Forbidden(c, "Cannot delete yourself")
		return
	}

	if err := h.service.DeleteUser(c.Request.Context(), id); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"message": "user deleted"})
}

func valueOrZero(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}
