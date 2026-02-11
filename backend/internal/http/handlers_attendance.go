package http

import (
	"crypto/rand"
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/huaodong/llm-teaching-platform/backend/pkg/response"
	"gorm.io/gorm"
)

type attendanceHandlers struct {
	service services.AttendanceService
	db      *gorm.DB // Keep temporarily for complex join queries (attendance rate calculation)
}

func newAttendanceHandlers(service services.AttendanceService, db *gorm.DB) *attendanceHandlers {
	return &attendanceHandlers{service: service, db: db}
}

// --- Summary ---

// AttendanceSummaryResponse is the API response for course attendance summary.
type AttendanceSummaryResponse struct {
	AttendanceRate float64            `json:"attendance_rate"`
	SessionsCount  int                `json:"sessions_count"`
	LastSessionAt  *time.Time         `json:"last_session_at"`
	ActiveSession  *ActiveSessionInfo `json:"active_session"`
}

// ActiveSessionInfo describes the currently active attendance session.
type ActiveSessionInfo struct {
	ID     uint      `json:"id"`
	Code   string    `json:"code"`
	EndsAt time.Time `json:"ends_at"`
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
	userID := userCtx.ID
	role := userCtx.Role

	// Count total sessions (keep DB query for now - complex aggregation)
	var sessionsCount int64
	h.db.Model(&models.AttendanceSession{}).Where("course_id = ?", courseID).Count(&sessionsCount)

	// Get last session time
	var lastSession models.AttendanceSession
	var lastSessionAt *time.Time
	if err := h.db.Where("course_id = ?", courseID).Order("start_at DESC").First(&lastSession).Error; err == nil {
		lastSessionAt = &lastSession.StartAt
	}

	// Calculate attendance rate (keep complex join logic in handler)
	var attendanceRate float64
	if sessionsCount > 0 {
		if role == "student" {
			// Student: their own attendance rate
			var attendedCount int64
			h.db.Model(&models.AttendanceRecord{}).
				Joins("JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id").
				Where("attendance_sessions.course_id = ? AND attendance_records.student_id = ?", courseID, userID).
				Count(&attendedCount)
			attendanceRate = float64(attendedCount) / float64(sessionsCount)
		} else {
			// Teacher: average attendance rate across all students
			var totalEnrollments int64
			h.db.Model(&models.CourseEnrollment{}).Where("course_id = ? AND role = 'student'", courseID).Count(&totalEnrollments)
			if totalEnrollments > 0 && sessionsCount > 0 {
				var totalRecords int64
				h.db.Model(&models.AttendanceRecord{}).
					Joins("JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id").
					Where("attendance_sessions.course_id = ?", courseID).
					Count(&totalRecords)
				attendanceRate = float64(totalRecords) / (float64(totalEnrollments) * float64(sessionsCount))
			}
		}
	}

	// Check for active session (keep DB query for now)
	var activeSession *ActiveSessionInfo
	var active models.AttendanceSession
	if err := h.db.Where("course_id = ? AND is_active = ?", courseID, true).First(&active).Error; err == nil {
		code := active.Code
		if role == "student" {
			code = "" // Hide code from students
		}
		activeSession = &ActiveSessionInfo{
			ID:     active.ID,
			Code:   code,
			EndsAt: active.EndAt,
		}
	}

	response.OK(c, AttendanceSummaryResponse{
		AttendanceRate: attendanceRate,
		SessionsCount:  int(sessionsCount),
		LastSessionAt:  lastSessionAt,
		ActiveSession:  activeSession,
	})
}

// --- List Sessions ---

// SessionListItem is a summary row for an attendance session.
type SessionListItem struct {
	ID            uint      `json:"id"`
	StartAt       time.Time `json:"start_at"`
	EndAt         time.Time `json:"end_at"`
	IsActive      bool      `json:"is_active"`
	AttendeeCount int       `json:"attendee_count"`
}

// ListSessions returns all attendance sessions for a course
// GET /courses/:id/attendance/sessions
func (h *attendanceHandlers) ListSessions(c *gin.Context) {
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid course ID")
		return
	}

	// Use service to list sessions
	sessionsPtr, err := h.service.ListSessions(c.Request.Context(), uint(courseID))
	if err != nil {
		response.Error(c, err)
		return
	}

	// Convert and add attendee counts (keep count query in handler)
	result := make([]SessionListItem, len(sessionsPtr))
	for i, s := range sessionsPtr {
		var count int64
		h.db.Model(&models.AttendanceRecord{}).Where("session_id = ?", s.ID).Count(&count)
		result[i] = SessionListItem{
			ID:            s.ID,
			StartAt:       s.StartAt,
			EndAt:         s.EndAt,
			IsActive:      s.IsActive,
			AttendeeCount: int(count),
		}
	}

	response.OK(c, result)
}

// --- Start Session ---

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

	// Check if there's already an active session (keep in handler - validation)
	var existing models.AttendanceSession
	if err := h.db.Where("course_id = ? AND is_active = ?", courseID, true).First(&existing).Error; err == nil {
		response.Error(c, fmt.Errorf("active session already exists"))
		return
	}

	var req startSessionRequest
	c.ShouldBindJSON(&req)
	if req.TimeoutMinutes <= 0 || req.TimeoutMinutes > 60 {
		req.TimeoutMinutes = 15 // default
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	userID := userCtx.ID
	now := time.Now()

	session := &models.AttendanceSession{
		CourseID:       uint(courseID),
		StartedByID:    userID,
		StartAt:        now,
		EndAt:          now.Add(time.Duration(req.TimeoutMinutes) * time.Minute),
		TimeoutMinutes: req.TimeoutMinutes,
		Code:           generateCode(),
		IsActive:       true,
	}

	// Use service to create session
	if err := h.service.StartSession(c.Request.Context(), session); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"id":      session.ID,
		"code":    session.Code,
		"ends_at": session.EndAt,
	})
}

// --- End Session ---

// EndSession ends an active session
// POST /attendance/:session_id/end
func (h *attendanceHandlers) EndSession(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("session_id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid session ID")
		return
	}

	// Check session exists and is active (keep in handler - validation)
	var session models.AttendanceSession
	if err := h.db.First(&session, sessionID).Error; err != nil {
		response.NotFound(c, "Session")
		return
	}

	if !session.IsActive {
		response.BadRequest(c, "Session already ended")
		return
	}

	// Use service to end session
	if err := h.service.EndSession(c.Request.Context(), uint(sessionID)); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{"message": "session ended"})
}

// --- Checkin ---

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
	userID := userCtx.ID

	// Get session (keep validation in handler)
	var session models.AttendanceSession
	if err := h.db.First(&session, sessionID).Error; err != nil {
		response.NotFound(c, "Session")
		return
	}

	// Validate session is active
	if !session.IsActive {
		response.BadRequest(c, "Session has ended")
		return
	}

	// Check if session has timed out
	if time.Now().After(session.EndAt) {
		// Auto-close session
		h.db.Model(&session).Update("is_active", false)
		response.BadRequest(c, "Session has expired")
		return
	}

	// Validate code
	if req.Code != session.Code {
		response.BadRequest(c, "Invalid code")
		return
	}

	// Check if already checked in
	var existing models.AttendanceRecord
	if err := h.db.Where("session_id = ? AND student_id = ?", sessionID, userID).First(&existing).Error; err == nil {
		response.OK(c, CheckinResponse{
			Success:          true,
			AlreadyCheckedIn: true,
			CheckedInAt:      existing.CheckedInAt,
		})
		return
	}

	// Use service to check in
	now := time.Now()
	if err := h.service.Checkin(c.Request.Context(), uint(sessionID), userID, c.ClientIP()); err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, CheckinResponse{
		Success:     true,
		CheckedInAt: now,
	})
}

// --- Get Session Records ---

// RecordListItem is a single attendance record in the session list.
type RecordListItem struct {
	StudentID   uint      `json:"student_id"`
	StudentName string    `json:"student_name"`
	CheckedInAt time.Time `json:"checked_in_at"`
	IPAddress   string    `json:"ip_address"`
}

// GetRecords returns all check-in records for a session
// GET /attendance/:session_id/records
func (h *attendanceHandlers) GetRecords(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("session_id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "Invalid session ID")
		return
	}

	// Use service to get records
	recordsPtr, err := h.service.GetRecords(c.Request.Context(), uint(sessionID))
	if err != nil {
		response.Error(c, err)
		return
	}

	// Convert to pointers
	records := make([]models.AttendanceRecord, len(recordsPtr))
	studentIDs := make([]uint, len(recordsPtr))
	for i, r := range recordsPtr {
		records[i] = *r
		studentIDs[i] = r.StudentID
	}

	// Get student names (keep in handler - requires user lookup)
	var users []models.User
	h.db.Where("id IN ?", studentIDs).Find(&users)
	userMap := make(map[uint]string)
	for _, u := range users {
		name := u.Name
		if name == "" {
			name = u.Username
		}
		userMap[u.ID] = name
	}

	result := make([]RecordListItem, len(records))
	for i, r := range records {
		result[i] = RecordListItem{
			StudentID:   r.StudentID,
			StudentName: userMap[r.StudentID],
			CheckedInAt: r.CheckedInAt,
			IPAddress:   r.IPAddress,
		}
	}

	response.OK(c, result)
}

// generateCode generates a 6-digit random code
func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	num := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", num)
}
