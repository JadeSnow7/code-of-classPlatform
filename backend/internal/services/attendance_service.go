package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
)

type attendanceService struct {
	repo repositories.AttendanceRepository
}

// NewAttendanceService 创建考勤服务实例
func NewAttendanceService(repo repositories.AttendanceRepository) AttendanceService {
	return &attendanceService{repo: repo}
}

func (s *attendanceService) GetSummary(ctx context.Context, courseID, userID uint) (map[string]interface{}, error) {
	rate, err := s.repo.GetAttendanceRate(ctx, courseID, userID)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"attendance_rate": rate,
	}, nil
}

func (s *attendanceService) ListSessions(ctx context.Context, courseID uint) ([]*models.AttendanceSession, error) {
	return s.repo.FindSessionsByCourseID(ctx, courseID)
}

func (s *attendanceService) StartSession(ctx context.Context, session *models.AttendanceSession) error {
	// Generate random 6-digit code
	bytes := make([]byte, 3)
	if _, err := rand.Read(bytes); err != nil {
		return err
	}
	session.Code = hex.EncodeToString(bytes)
	session.IsActive = true

	return s.repo.CreateSession(ctx, session)
}

func (s *attendanceService) EndSession(ctx context.Context, sessionID uint) error {
	session, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}

	session.IsActive = false
	return s.repo.UpdateSession(ctx, session)
}

func (s *attendanceService) Checkin(ctx context.Context, sessionID, studentID uint, location string) error {
	session, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}

	if !session.IsActive {
		return errors.New("session is not active")
	}

	record := &models.AttendanceRecord{
		SessionID: sessionID,
		StudentID: studentID,
	}

	return s.repo.Checkin(ctx, record)
}

func (s *attendanceService) GetRecords(ctx context.Context, sessionID uint) ([]*models.AttendanceRecord, error) {
	return s.repo.GetRecords(ctx, sessionID)
}
