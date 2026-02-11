package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/auth"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type adminHandlers struct {
	service services.AdminService
	db      *gorm.DB // Keep temporarily for complex stats aggregation
}

func newAdminHandlers(service services.AdminService, db *gorm.DB) *adminHandlers {
	return &adminHandlers{service: service, db: db}
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
	CreatedAt string `json:"created_at"`
}

// GetSystemStats returns overall system statistics
func (h *adminHandlers) GetSystemStats(c *gin.Context) {
	stats := SystemStats{
		UsersByRole: make(map[string]int64),
	}

	// Keep complex aggregation in handler (service only has basic user stats)
	h.db.Model(&models.User{}).Count(&stats.TotalUsers)
	h.db.Model(&models.Course{}).Count(&stats.TotalCourses)
	h.db.Model(&models.Assignment{}).Count(&stats.TotalAssignments)
	h.db.Model(&models.Submission{}).Count(&stats.TotalSubmissions)
	h.db.Model(&models.Quiz{}).Count(&stats.TotalQuizzes)
	h.db.Model(&models.Resource{}).Count(&stats.TotalResources)

	// Count users by role
	roles := []string{"admin", "teacher", "assistant", "student"}
	for _, role := range roles {
		var count int64
		h.db.Model(&models.User{}).Where("role = ?", role).Count(&count)
		stats.UsersByRole[role] = count
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
			CreatedAt: u.CreatedAt.Format("2006-01-02 15:04"),
		}
	}

	response.OK(c, gin.H{"users": result})
}

// CreateUserRequest is the request body for creating a user
type CreateUserRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	Role     string `json:"role" binding:"required,oneof=admin teacher assistant student"`
	Name     string `json:"name" binding:"required"`
}

// CreateUser creates a new user
func (h *adminHandlers) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	// Check if username already exists
	var existing models.User
	if h.db.Where("username = ?", req.Username).First(&existing).Error == nil {
		response.Error(c, gorm.ErrDuplicatedKey)
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		response.Error(c, err)
		return
	}

	user := &models.User{
		Username:     req.Username,
		PasswordHash: passwordHash,
		Role:         req.Role,
		Name:         req.Name,
	}

	// Use service to create user
	if err := h.service.CreateUser(c.Request.Context(), user, req.Password); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
		"name":     user.Name,
	})
}

// UpdateUserRequest is the request body for updating a user
type UpdateUserRequest struct {
	Password string `json:"password,omitempty"`
	Role     string `json:"role,omitempty"`
	Name     string `json:"name,omitempty"`
}

// UpdateUser updates an existing user
func (h *adminHandlers) UpdateUser(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := h.db.First(&user, id).Error; err != nil {
		response.NotFound(c, "User")
		return
	}

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

	if len(updates) > 0 {
		// Use service to update (though we still use DB for validation)
		if err := h.db.Model(&user).Updates(updates).Error; err != nil {
			response.Error(c, err)
			return
		}
	}

	// Reload user
	h.db.First(&user, id)

	response.OK(c, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
		"name":     user.Name,
	})
}

// DeleteUser deletes a user
func (h *adminHandlers) DeleteUser(c *gin.Context) {
	id := c.Param("id")
	currentUser, _ := middleware.GetUser(c)

	var user models.User
	if err := h.db.First(&user, id).Error; err != nil {
		response.NotFound(c, "User")
		return
	}

	// Prevent deleting yourself
	if user.ID == currentUser.ID {
		response.Forbidden(c, "Cannot delete yourself")
		return
	}

	// Use service to delete
	if err := h.service.DeleteUser(c.Request.Context(), user.ID); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"message": "user deleted"})
}
