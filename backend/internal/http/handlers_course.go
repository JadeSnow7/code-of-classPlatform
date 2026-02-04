package http

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/services"
	"gorm.io/gorm"
)

type courseHandlers struct {
	service *services.CourseService
}

func newCourseHandlers(db *gorm.DB) *courseHandlers {
	return &courseHandlers{service: services.NewCourseService(db)}
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
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	var req createCourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
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
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "CREATE_COURSE_FAILED", "create course failed", nil)
		return
	}
	respondCreated(c, course)
}

func (h *courseHandlers) List(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	courses, err := h.service.ListCourses(c.Request.Context(), user)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "LIST_COURSES_FAILED", "list courses failed", nil)
		return
	}

	respondOK(c, courses)
}

func (h *courseHandlers) Get(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	course, err := h.service.GetCourse(c.Request.Context(), uint(courseID), user)
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFoundService) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "GET_COURSE_FAILED", "get course failed", nil)
		return
	}

	respondOK(c, course)
}

type updateCourseModulesRequest struct {
	EnabledModules []string               `json:"enabled_modules" binding:"required"`
	ModuleSettings map[string]interface{} `json:"module_settings"`
}

func (h *courseHandlers) GetModules(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	user := services.UserInfo{ID: u.ID, Role: u.Role}
	modules, settings, err := h.service.GetModules(c.Request.Context(), uint(courseID), user)
	if err != nil {
		if errors.Is(err, services.ErrCourseNotFoundService) {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "MODULE_CONFIG_INVALID", "invalid module config", nil)
		return
	}

	respondOK(c, gin.H{
		"course_id":       courseID,
		"enabled_modules": modules,
		"module_settings": settings,
	})
}

func (h *courseHandlers) UpdateModules(c *gin.Context) {
	u, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}

	idStr := c.Param("courseId")
	courseID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_COURSE_ID", "invalid course id", nil)
		return
	}

	var req updateCourseModulesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request", nil)
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
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}
		if errors.Is(err, services.ErrAccessDeniedService) {
			respondError(c, http.StatusForbidden, "ACCESS_DENIED", "access denied", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "UPDATE_FAILED", "failed to update modules", nil)
		return
	}

	respondOK(c, gin.H{
		"course_id":       courseID,
		"enabled_modules": modules,
		"module_settings": settings,
	})
}
