package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type adminHandlers struct {
	db *gorm.DB
}

func newAdminHandlers(db *gorm.DB) *adminHandlers {
	return &adminHandlers{db: db}
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

	c.JSON(http.StatusOK, stats)
}

// ListUsers returns a list of all users
func (h *adminHandlers) ListUsers(c *gin.Context) {
	roleFilter := c.Query("role")

	var users []models.User
	query := h.db.Model(&models.User{})
	if roleFilter != "" {
		query = query.Where("role = ?", roleFilter)
	}
	query.Order("id ASC").Find(&users)

	result := make([]UserListItem, len(users))
	for i, u := range users {
		result[i] = UserListItem{
			ID:        u.ID,
			Username:  u.Username,
			Role:      u.Role,
			Name:      u.Name,
			CreatedAt: u.CreatedAt.Format("2006-01-02 15:04"),
		}
	}

	c.JSON(http.StatusOK, gin.H{"users": result})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if username already exists
	var existing models.User
	if h.db.Where("username = ?", req.Username).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user := models.User{
		Username:     req.Username,
		PasswordHash: passwordHash,
		Role:         req.Role,
		Name:         req.Name,
	}

	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
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
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}

	if req.Password != "" {
		passwordHash, err := auth.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		updates["password_hash"] = passwordHash
	}

	if req.Role != "" {
		if req.Role != "admin" && req.Role != "teacher" && req.Role != "assistant" && req.Role != "student" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
			return
		}
		updates["role"] = req.Role
	}

	if req.Name != "" {
		updates["name"] = req.Name
	}

	if len(updates) > 0 {
		if err := h.db.Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			return
		}
	}

	// Reload user
	h.db.First(&user, id)

	c.JSON(http.StatusOK, gin.H{
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
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Prevent deleting yourself
	if user.ID == currentUser.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot delete yourself"})
		return
	}

	if err := h.db.Delete(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}
