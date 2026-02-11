package http

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type courseHandlers struct {
	service *services.CourseService
}

func NewCourseHandlers(db *gorm.DB) *courseHandlers {
	return &courseHandlers{service: services.NewCourseService(db)}
}

func newCourseHandlers(db *gorm.DB) *courseHandlers {
	return NewCourseHandlers(db)
}

type createCourseRequest struct {
	Name           string                 `json:"name" binding:"required"`
	Code           string                 `json:"code"`
	Semester       string                 `json:"semester"`
	EnabledModules []string               `json:"enabled_modules"`
	ModuleSettings map[string]interface{} `json:"module_settings"`
}

func (h *courseHandlers) Create(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	var req createCourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	svcReq := services.CreateCourseRequest{
		Name:           req.Name,
		Code:           req.Code,
		Semester:       req.Semester,
		EnabledModules: req.EnabledModules,
		ModuleSettings: req.ModuleSettings,
	}

	course, err := h.service.CreateCourse(c.Request.Context(), user, svcReq)
	if err != nil {
		if errors.Is(err, services.ErrAccessDeniedService) {
			response.Forbidden(c, "create course")
			return
		}
		response.BadRequest(c, "Failed to create course")
		return
	}
	response.Created(c, course)
}

func (h *courseHandlers) List(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	courses, err := h.service.ListCourses(c.Request.Context(), user)
	if err != nil {
		response.BadRequest(c, "Failed to list courses")
		return
	}

	response.OK(c, courses)
}

func (h *courseHandlers) Get(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	course, err := h.service.GetCourse(c.Request.Context(), uint(courseID), user)
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFoundService) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			response.Forbidden(c, "access course")
			return
		}
		response.BadRequest(c, "Failed to get course")
		return
	}

	response.OK(c, course)
}

type updateCourseModulesRequest struct {
	EnabledModules []string               `json:"enabled_modules" binding:"required"`
	ModuleSettings map[string]interface{} `json:"module_settings"`
}

func (h *courseHandlers) GetModules(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	modules, settings, err := h.service.GetModules(c.Request.Context(), uint(courseID), user)
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFoundService) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			response.Forbidden(c, "access course modules")
			return
		}
		response.BadRequest(c, "Invalid module config")
		return
	}

	response.OK(c, gin.H{
		"course_id":       courseID,
		"enabled_modules": modules,
		"module_settings": settings,
	})
}

func (h *courseHandlers) UpdateModules(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	var req updateCourseModulesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request")
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	svcReq := services.UpdateModulesRequest{
		EnabledModules: req.EnabledModules,
		ModuleSettings: req.ModuleSettings,
	}

	modules, settings, err := h.service.UpdateModules(c.Request.Context(), uint(courseID), user, svcReq)
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFoundService) {
			response.NotFound(c, "Course")
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			response.Forbidden(c, "update course modules")
			return
		}
		response.BadRequest(c, "Failed to update modules")
		return
	}

	response.OK(c, gin.H{
		"course_id":       courseID,
		"enabled_modules": modules,
		"module_settings": settings,
	})
}
