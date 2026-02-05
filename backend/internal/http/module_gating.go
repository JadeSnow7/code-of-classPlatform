package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var errCourseIDMissing = errors.New("course id missing")

// RequireCourseModule enforces a course module is enabled for the requested course.
func RequireCourseModule(db *gorm.DB, moduleKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		courseID, err := extractCourseID(c)
		if err != nil {
			if errors.Is(err, errCourseIDMissing) {
				respondError(c, http.StatusBadRequest, "COURSE_ID_REQUIRED", "course_id is required", nil)
				return
			}
			respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course_id", nil)
			return
		}

		var course models.Course
		if err := db.First(&course, courseID).Error; err != nil {
			respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
			return
		}

		if !authorizeCourseAccess(c, db, &course) {
			return
		}

		ok, err := isModuleEnabled(course.EnabledModules, moduleKey)
		if err != nil {
			respondError(c, http.StatusInternalServerError, "MODULE_CONFIG_INVALID", "invalid enabled_modules", nil)
			return
		}
		if !ok {
			respondError(c, http.StatusForbidden, "MODULE_DISABLED", "module disabled for this course", nil)
			return
		}

		c.Next()
	}
}

// requireCourseModuleForCourseID checks module gating for handlers that already resolved course ID.
func requireCourseModuleForCourseID(c *gin.Context, db *gorm.DB, courseID uint, moduleKey string) bool {
	var course models.Course
	if err := db.First(&course, courseID).Error; err != nil {
		respondError(c, http.StatusNotFound, "COURSE_NOT_FOUND", "course not found", nil)
		return false
	}
	if !authorizeCourseAccess(c, db, &course) {
		return false
	}
	ok, err := isModuleEnabled(course.EnabledModules, moduleKey)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "MODULE_CONFIG_INVALID", "invalid enabled_modules", nil)
		return false
	}
	if !ok {
		respondError(c, http.StatusForbidden, "MODULE_DISABLED", "module disabled for this course", nil)
		return false
	}
	return true
}

func isModuleEnabled(raw datatypes.JSON, moduleKey string) (bool, error) {
	modules, err := parseEnabledModules(raw)
	if err != nil {
		return false, err
	}
	for _, m := range modules {
		if m == moduleKey {
			return true, nil
		}
	}
	return false, nil
}

func parseEnabledModules(raw datatypes.JSON) ([]string, error) {
	if len(raw) == 0 {
		return []string{}, nil
	}
	var modules []string
	if err := json.Unmarshal(raw, &modules); err != nil {
		return nil, err
	}
	return normalizeModules(modules), nil
}

func parseModuleSettings(raw datatypes.JSON) (map[string]interface{}, error) {
	if len(raw) == 0 {
		return map[string]interface{}{}, nil
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(raw, &settings); err != nil {
		return nil, err
	}
	return settings, nil
}

func normalizeModules(modules []string) []string {
	seen := make(map[string]struct{}, len(modules))
	out := make([]string, 0, len(modules))
	for _, m := range modules {
		m = strings.TrimSpace(m)
		if m == "" {
			continue
		}
		if _, ok := seen[m]; ok {
			continue
		}
		seen[m] = struct{}{}
		out = append(out, m)
	}
	return out
}

func extractCourseID(c *gin.Context) (uint, error) {
	if id := strings.TrimSpace(c.Param("courseId")); id != "" {
		return parseCourseIDString(id)
	}
	if id := strings.TrimSpace(c.Param("course_id")); id != "" {
		return parseCourseIDString(id)
	}
	if id := strings.TrimSpace(c.Query("course_id")); id != "" {
		return parseCourseIDString(id)
	}
	if id := strings.TrimSpace(c.Query("courseId")); id != "" {
		return parseCourseIDString(id)
	}
	if id := strings.TrimSpace(c.GetHeader("X-Course-Id")); id != "" {
		return parseCourseIDString(id)
	}

	// Only attempt body parsing if JSON payload
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(strings.ToLower(contentType), "application/json") {
		id, found, err := extractCourseIDFromBody(c)
		if err != nil {
			return 0, err
		}
		if found {
			return id, nil
		}
	}

	return 0, errCourseIDMissing
}

func extractCourseIDFromBody(c *gin.Context) (uint, bool, error) {
	if c.Request.Body == nil {
		return 0, false, nil
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return 0, false, err
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
	if len(bytes.TrimSpace(body)) == 0 {
		return 0, false, nil
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return 0, false, err
	}
	if v, ok := payload["course_id"]; ok {
		id, err := parseCourseIDValue(v)
		return id, true, err
	}
	if v, ok := payload["courseId"]; ok {
		id, err := parseCourseIDValue(v)
		return id, true, err
	}
	return 0, false, nil
}

func parseCourseIDString(value string) (uint, error) {
	id, err := strconv.ParseUint(value, 10, 64)
	if err != nil || id == 0 {
		return 0, errors.New("invalid course id")
	}
	return uint(id), nil
}

func parseCourseIDValue(value interface{}) (uint, error) {
	switch v := value.(type) {
	case float64:
		if v <= 0 {
			return 0, errors.New("invalid course id")
		}
		return uint(v), nil
	case json.Number:
		parsed, err := v.Int64()
		if err != nil || parsed <= 0 {
			return 0, errors.New("invalid course id")
		}
		return uint(parsed), nil
	case string:
		return parseCourseIDString(v)
	case int:
		if v <= 0 {
			return 0, errors.New("invalid course id")
		}
		return uint(v), nil
	case int64:
		if v <= 0 {
			return 0, errors.New("invalid course id")
		}
		return uint(v), nil
	case uint:
		if v == 0 {
			return 0, errors.New("invalid course id")
		}
		return v, nil
	default:
		return 0, errors.New("invalid course id")
	}
}
