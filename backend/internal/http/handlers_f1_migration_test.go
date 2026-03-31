package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
)

type fakeUserStatsService struct {
	services.UserService
	studentStats services.StudentStats
	teacherStats services.TeacherStats
}

func (f *fakeUserStatsService) GetStudentStats(context.Context, uint) (services.StudentStats, error) {
	return f.studentStats, nil
}

func (f *fakeUserStatsService) GetTeacherStats(context.Context, uint, string) (services.TeacherStats, error) {
	return f.teacherStats, nil
}

type fakeAttendanceHandlerService struct {
	services.AttendanceService
	checkinErr error
}

func (f *fakeAttendanceHandlerService) Checkin(context.Context, uint, uint, services.AttendanceCheckinInput) (services.AttendanceCheckinResult, error) {
	return services.AttendanceCheckinResult{}, f.checkinErr
}

type fakeUploadHandlerService struct {
	services.UploadService
	authAssignmentErr error
}

func (f *fakeUploadHandlerService) AuthorizeAssignmentUpload(context.Context, uint, uint, string) error {
	return f.authAssignmentErr
}

type fakeAnnouncementHandlerService struct {
	services.AnnouncementService
	summary services.AnnouncementSummary
}

func (f *fakeAnnouncementHandlerService) GetSummary(context.Context, uint, uint) (services.AnnouncementSummary, error) {
	return f.summary, nil
}

func TestUserHandlers_GetStats_StudentRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newUserHandlers(&fakeUserStatsService{
		studentStats: services.StudentStats{
			CoursesCount: 2,
		},
	})

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 10, Role: "student"})
		c.Next()
	})
	r.GET("/stats", h.GetStats)

	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp envelope[services.StudentStats]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, 2, resp.Data.CoursesCount)
}

func TestAttendanceHandlers_Checkin_InvalidCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAttendanceHandlers(&fakeAttendanceHandlerService{checkinErr: services.ErrAttendanceInvalidCode})

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 20, Role: "student"})
		c.Next()
	})
	r.POST("/attendance/:session_id/checkin", h.Checkin)

	req := httptest.NewRequest(http.MethodPost, "/attendance/1/checkin", bytes.NewBufferString(`{"code":"bad","latitude":30.5,"longitude":114.3}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid code")
}

func TestUploadHandlers_UploadAssignmentFile_Forbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newUploadHandlers(&fakeUploadHandlerService{authAssignmentErr: services.ErrAccessDeniedService})

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 30, Role: "teacher"})
		c.Next()
	})
	r.POST("/upload/assignment/:assignmentId", h.UploadAssignmentFile)

	req := httptest.NewRequest(http.MethodPost, "/upload/assignment/1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAnnouncementHandlers_GetSummary_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newAnnouncementHandlers(&fakeAnnouncementHandlerService{
		summary: services.AnnouncementSummary{
			UnreadCount: 1,
			TotalCount:  3,
			Latest: &services.AnnouncementLatestInfo{
				ID:        9,
				Title:     "Notice",
				CreatedAt: time.Now(),
			},
		},
	})

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", middleware.UserContext{ID: 40, Role: "student"})
		c.Next()
	})
	r.GET("/courses/:courseId/announcements/summary", h.GetSummary)

	req := httptest.NewRequest(http.MethodGet, "/courses/7/announcements/summary", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	unread, unreadOK := resp.Data["unread_count"].(float64)
	total, totalOK := resp.Data["total_count"].(float64)
	assert.True(t, unreadOK)
	assert.True(t, totalOK)
	assert.Equal(t, 1.0, unread)
	assert.Equal(t, 3.0, total)
}
