package http

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	apperrors "github.com/huaodong/llm-teaching-platform/backend/pkg/errors"
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
	if summary.ActiveSession != nil && userCtx.Role != "student" {
		summary.ActiveSession.QRURL = buildAttendanceQRURL(c, uint(courseID), summary.ActiveSession.ID)
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

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	sessions, err := h.service.ListSessions(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}
	if userCtx.Role == "student" {
		for i := range sessions {
			sessions[i].CenterLatitude = 0
			sessions[i].CenterLongitude = 0
			sessions[i].RadiusMeters = 0
		}
	}

	response.OK(c, sessions)
}

type startSessionRequest struct {
	TimeoutMinutes   int     `json:"timeout_minutes"`
	LocationRequired bool    `json:"location_required"`
	CenterLatitude   float64 `json:"center_latitude"`
	CenterLongitude  float64 `json:"center_longitude"`
	RadiusMeters     int     `json:"radius_meters"`
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
	if req.RadiusMeters <= 0 {
		req.RadiusMeters = 100
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	session, err := h.service.StartSession(c.Request.Context(), uint(courseID), userCtx.ID, services.AttendanceStartSessionInput{
		TimeoutMinutes:   req.TimeoutMinutes,
		LocationRequired: req.LocationRequired,
		CenterLatitude:   req.CenterLatitude,
		CenterLongitude:  req.CenterLongitude,
		RadiusMeters:     req.RadiusMeters,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrAttendanceActiveSessionExists):
			response.Error(c, &apperrors.AppError{Code: apperrors.CodeConflict, Message: "Active session already exists", HTTPStatus: http.StatusConflict})
		case errors.Is(err, services.ErrAttendanceLocationRequired):
			response.Error(c, &apperrors.AppError{Code: "LOCATION_REQUIRED", Message: "Valid teacher location is required", HTTPStatus: http.StatusBadRequest})
		default:
			response.Error(c, err)
		}
		return
	}

	response.Created(c, gin.H{
		"id":                session.ID,
		"code":              session.Code,
		"ends_at":           session.EndAt,
		"location_required": session.LocationRequired,
		"radius_meters":     session.RadiusMeters,
		"center_latitude":   session.CenterLatitude,
		"center_longitude":  session.CenterLongitude,
		"qr_url":            buildAttendanceQRURL(c, uint(courseID), session.ID),
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
	Code      string   `json:"code" binding:"required"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

// CheckinResponse is the API response payload for a check-in.
type CheckinResponse struct {
	Success           bool      `json:"success"`
	AlreadyCheckedIn  bool      `json:"already_checked_in,omitempty"`
	CheckedInAt       time.Time `json:"checked_in_at"`
	LocationValidated bool      `json:"location_validated"`
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

	if req.Latitude == nil || req.Longitude == nil {
		response.Error(c, &apperrors.AppError{Code: "LOCATION_REQUIRED", Message: "Location permission is required", HTTPStatus: http.StatusBadRequest})
		return
	}

	result, err := h.service.Checkin(c.Request.Context(), uint(sessionID), userCtx.ID, services.AttendanceCheckinInput{
		Code:      req.Code,
		Location:  c.ClientIP(),
		Latitude:  *req.Latitude,
		Longitude: *req.Longitude,
	})
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
		case errors.Is(err, services.ErrAttendanceLocationRequired):
			response.Error(c, &apperrors.AppError{Code: "LOCATION_REQUIRED", Message: "Location permission is required", HTTPStatus: http.StatusBadRequest})
		case errors.Is(err, services.ErrAttendanceOutOfRange):
			response.Error(c, &apperrors.AppError{Code: "OUT_OF_ATTENDANCE_RANGE", Message: "You are outside the attendance area", HTTPStatus: http.StatusBadRequest})
		default:
			response.Error(c, err)
		}
		return
	}

	response.OK(c, CheckinResponse{
		Success:           true,
		AlreadyCheckedIn:  result.AlreadyCheckedIn,
		CheckedInAt:       result.CheckedInAt,
		LocationValidated: result.LocationValidated,
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

func buildAttendanceQRURL(c *gin.Context, courseID, sessionID uint) string {
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	if forwardedProto := c.GetHeader("X-Forwarded-Proto"); forwardedProto != "" {
		scheme = forwardedProto
	}
	return scheme + "://" + c.Request.Host + "/courses/" + strconv.FormatUint(uint64(courseID), 10) + "/attendance?session=" + strconv.FormatUint(uint64(sessionID), 10)
}
