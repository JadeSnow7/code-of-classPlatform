package http

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type attendanceHandlers struct {
	service services.AttendanceService
}

func NewAttendanceHandlers(service services.AttendanceService) *attendanceHandlers {
	return &attendanceHandlers{service: service}
}

func newAttendanceHandlers(service services.AttendanceService) *attendanceHandlers {
	return NewAttendanceHandlers(service)
}

// GetSummary returns attendance summary for a course
// GET /courses/:id/attendance/summary
func (h *attendanceHandlers) GetSummary(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	summary, err := h.service.GetSummary(c.Request.Context(), uint(courseID), userCtx.ID, userCtx.Role)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.OK(c, summary)
}

// ListSessions returns all attendance sessions for a course
// GET /courses/:id/attendance/sessions
func (h *attendanceHandlers) ListSessions(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	sessions, err := h.service.ListSessions(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, sessions)
}

type startSessionRequest struct {
	TimeoutMinutes int `json:"timeout_minutes"`
}

// StartSession creates a new attendance session
// POST /courses/:id/attendance/start
func (h *attendanceHandlers) StartSession(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	var req startSessionRequest
	c.ShouldBindJSON(&req)
	if req.TimeoutMinutes <= 0 || req.TimeoutMinutes > 60 {
		req.TimeoutMinutes = 15
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	session, err := h.service.StartSession(c.Request.Context(), uint(courseID), userCtx.ID, req.TimeoutMinutes)
	if err != nil {
		if errors.Is(err, services.ErrAttendanceActiveSessionExists) {
			response.Error(c, err)
			return
		}
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"id":      session.ID,
		"code":    session.Code,
		"ends_at": session.EndAt,
	})
}

// EndSession ends an active session
// POST /attendance/:session_id/end
func (h *attendanceHandlers) EndSession(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("session_id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid session ID")
		return
	}

	if err := h.service.EndSession(c.Request.Context(), uint(sessionID)); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Session")
		case errors.Is(err, services.ErrAttendanceSessionAlreadyEnded):
			response.BadRequest(c, "Session already ended")
		default:
			response.Error(c, err)
		}
		return
	}

	response.OK(c, gin.H{"message": "session ended"})
}

type checkinRequest struct {
	Code string `json:"code" binding:"required"`
}

// CheckinResponse is the API response payload for a check-in.
type CheckinResponse struct {
	Success          bool      `json:"success"`
	AlreadyCheckedIn bool      `json:"already_checked_in,omitempty"`
	CheckedInAt      time.Time `json:"checked_in_at"`
}

// Checkin allows a student to check in to a session
// POST /attendance/:session_id/checkin
func (h *attendanceHandlers) Checkin(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("session_id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid session ID")
		return
	}

	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Code is required")
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	result, err := h.service.Checkin(c.Request.Context(), uint(sessionID), userCtx.ID, req.Code, c.ClientIP())
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			response.NotFound(c, "Session")
		case errors.Is(err, services.ErrAttendanceSessionEnded):
			response.BadRequest(c, "Session has ended")
		case errors.Is(err, services.ErrAttendanceSessionExpired):
			response.BadRequest(c, "Session has expired")
		case errors.Is(err, services.ErrAttendanceInvalidCode):
			response.BadRequest(c, "Invalid code")
		default:
			response.Error(c, err)
		}
		return
	}

	response.OK(c, CheckinResponse{
		Success:          true,
		AlreadyCheckedIn: result.AlreadyCheckedIn,
		CheckedInAt:      result.CheckedInAt,
	})
}

// GetRecords returns all check-in records for a session
// GET /attendance/:session_id/records
func (h *attendanceHandlers) GetRecords(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("session_id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid session ID")
		return
	}

	records, err := h.service.GetRecords(c.Request.Context(), uint(sessionID))
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, records)
}
