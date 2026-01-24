package http

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type attendanceHandlers struct {
	db *gorm.DB
}

func newAttendanceHandlers(db *gorm.DB) *attendanceHandlers {
	return &attendanceHandlers{db: db}
}

// --- Summary ---

type AttendanceSummaryResponse struct {
	AttendanceRate float64            `json:"attendance_rate"`
	SessionsCount  int                `json:"sessions_count"`
	LastSessionAt  *time.Time         `json:"last_session_at"`
	ActiveSession  *ActiveSessionInfo `json:"active_session"`
}

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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}
	userID := userCtx.ID
	role := userCtx.Role

	// Count total sessions
	var sessionsCount int64
	h.db.Model(&models.AttendanceSession{}).Where("course_id = ?", courseID).Count(&sessionsCount)

	// Get last session time
	var lastSession models.AttendanceSession
	var lastSessionAt *time.Time
	if err := h.db.Where("course_id = ?", courseID).Order("start_at DESC").First(&lastSession).Error; err == nil {
		lastSessionAt = &lastSession.StartAt
	}

	// Calculate attendance rate for student, or overall for teacher
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

	// Check for active session
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

	respondOK(c, AttendanceSummaryResponse{
		AttendanceRate: attendanceRate,
		SessionsCount:  int(sessionsCount),
		LastSessionAt:  lastSessionAt,
		ActiveSession:  activeSession,
	})
}

// --- List Sessions ---

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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	var sessions []models.AttendanceSession
	if err := h.db.Where("course_id = ?", courseID).Order("start_at DESC").Find(&sessions).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch sessions", nil)
		return
	}

	result := make([]SessionListItem, len(sessions))
	for i, s := range sessions {
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

	respondOK(c, result)
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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid course id", nil)
		return
	}

	// Check if there's already an active session
	var existing models.AttendanceSession
	if err := h.db.Where("course_id = ? AND is_active = ?", courseID, true).First(&existing).Error; err == nil {
		respondError(c, http.StatusConflict, "CONFLICT", "active session already exists", gin.H{"session_id": existing.ID})
		return
	}

	var req startSessionRequest
	c.ShouldBindJSON(&req)
	if req.TimeoutMinutes <= 0 || req.TimeoutMinutes > 60 {
		req.TimeoutMinutes = 15 // default
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}
	userID := userCtx.ID
	now := time.Now()

	session := models.AttendanceSession{
		CourseID:       uint(courseID),
		StartedByID:    userID,
		StartAt:        now,
		EndAt:          now.Add(time.Duration(req.TimeoutMinutes) * time.Minute),
		TimeoutMinutes: req.TimeoutMinutes,
		Code:           generateCode(),
		IsActive:       true,
	}

	if err := h.db.Create(&session).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create session", nil)
		return
	}

	respondCreated(c, gin.H{
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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid session id", nil)
		return
	}

	var session models.AttendanceSession
	if err := h.db.First(&session, sessionID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "session not found", nil)
		return
	}

	if !session.IsActive {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "session already ended", nil)
		return
	}

	session.IsActive = false
	session.EndAt = time.Now()
	h.db.Save(&session)

	respondOK(c, gin.H{"message": "session ended"})
}

// --- Checkin ---

type checkinRequest struct {
	Code string `json:"code" binding:"required"`
}

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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid session id", nil)
		return
	}

	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "code is required", nil)
		return
	}

	userCtx, ok := middleware.GetUser(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized", nil)
		return
	}
	userID := userCtx.ID

	// Get session
	var session models.AttendanceSession
	if err := h.db.First(&session, sessionID).Error; err != nil {
		respondError(c, http.StatusNotFound, "NOT_FOUND", "session not found", nil)
		return
	}

	// Validate session is active
	if !session.IsActive {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "session has ended", nil)
		return
	}

	// Check if session has timed out
	if time.Now().After(session.EndAt) {
		// Auto-close session
		h.db.Model(&session).Update("is_active", false)
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "session has expired", nil)
		return
	}

	// Validate code
	if req.Code != session.Code {
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid code", nil)
		return
	}

	// Check if already checked in
	var existing models.AttendanceRecord
	if err := h.db.Where("session_id = ? AND student_id = ?", sessionID, userID).First(&existing).Error; err == nil {
		respondOK(c, CheckinResponse{
			Success:          true,
			AlreadyCheckedIn: true,
			CheckedInAt:      existing.CheckedInAt,
		})
		return
	}

	// Create record
	now := time.Now()
	record := models.AttendanceRecord{
		SessionID:   uint(sessionID),
		StudentID:   userID,
		CheckedInAt: now,
		IPAddress:   c.ClientIP(),
	}

	if err := h.db.Create(&record).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check in", nil)
		return
	}

	respondOK(c, CheckinResponse{
		Success:     true,
		CheckedInAt: now,
	})
}

// --- Get Session Records ---

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
		respondError(c, http.StatusBadRequest, "BAD_REQUEST", "invalid session id", nil)
		return
	}

	var records []models.AttendanceRecord
	if err := h.db.Where("session_id = ?", sessionID).Find(&records).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch records", nil)
		return
	}

	// Get student names
	studentIDs := make([]uint, len(records))
	for i, r := range records {
		studentIDs[i] = r.StudentID
	}

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

	respondOK(c, result)
}

// generateCode generates a 6-digit random code
func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	num := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", num)
}
