package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"gorm.io/gorm"
)

var (
	// ErrAttendanceActiveSessionExists indicates an active session already exists for the course.
	ErrAttendanceActiveSessionExists = errors.New("active session already exists")
	// ErrAttendanceSessionAlreadyEnded indicates the session was already ended.
	ErrAttendanceSessionAlreadyEnded = errors.New("session already ended")
	// ErrAttendanceSessionEnded indicates the session is not active anymore.
	ErrAttendanceSessionEnded = errors.New("session has ended")
	// ErrAttendanceSessionExpired indicates the session has expired by timeout.
	ErrAttendanceSessionExpired = errors.New("session has expired")
	// ErrAttendanceInvalidCode indicates the submitted check-in code is invalid.
	ErrAttendanceInvalidCode      = errors.New("invalid code")
	ErrAttendanceLocationRequired = errors.New("location required")
	ErrAttendanceOutOfRange       = errors.New("out of attendance range")
)

type attendanceService struct {
	repo     repositories.AttendanceRepository
	userRepo repositories.UserRepository
}

// NewAttendanceService 创建考勤服务实例
func NewAttendanceService(repo repositories.AttendanceRepository, userRepo repositories.UserRepository) AttendanceService {
	return &attendanceService{repo: repo, userRepo: userRepo}
}

func (s *attendanceService) GetSummary(ctx context.Context, courseID, userID uint, role string) (AttendanceSummary, error) {
	summary := AttendanceSummary{}

	sessionsCount, err := s.repo.CountSessionsByCourseID(ctx, courseID)
	if err != nil {
		return summary, err
	}
	summary.SessionsCount = int(sessionsCount)

	lastSession, err := s.repo.FindLatestSessionByCourseID(ctx, courseID)
	if err == nil {
		summary.LastSessionAt = &lastSession.StartAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return summary, err
	}

	if sessionsCount > 0 {
		if role == "student" {
			attendedCount, countErr := s.repo.CountRecordsByCourseAndStudent(ctx, courseID, userID)
			if countErr != nil {
				return summary, countErr
			}
			summary.AttendanceRate = float64(attendedCount) / float64(sessionsCount)
		} else {
			totalEnrollments, enrollErr := s.repo.CountEnrollmentsByCourseAndRole(ctx, courseID, "student")
			if enrollErr != nil {
				return summary, enrollErr
			}
			if totalEnrollments > 0 {
				totalRecords, recordsErr := s.repo.CountRecordsByCourseID(ctx, courseID)
				if recordsErr != nil {
					return summary, recordsErr
				}
				summary.AttendanceRate = float64(totalRecords) / (float64(totalEnrollments) * float64(sessionsCount))
			}
		}
	}

	activeSession, err := s.repo.FindActiveSessionByCourseID(ctx, courseID)
	if err == nil {
		code := activeSession.Code
		if role == "student" {
			code = ""
		}
		summary.ActiveSession = &ActiveSessionInfo{
			ID:               activeSession.ID,
			Code:             code,
			EndsAt:           activeSession.EndAt,
			LocationRequired: activeSession.LocationRequired,
			RadiusMeters:     activeSession.RadiusMeters,
		}
		if role != "student" {
			summary.ActiveSession.CenterLatitude = activeSession.CenterLatitude
			summary.ActiveSession.CenterLongitude = activeSession.CenterLongitude
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return summary, err
	}

	return summary, nil
}

func (s *attendanceService) ListSessions(ctx context.Context, courseID uint) ([]AttendanceSessionListItem, error) {
	sessions, err := s.repo.FindSessionsByCourseID(ctx, courseID)
	if err != nil {
		return nil, err
	}

	result := make([]AttendanceSessionListItem, len(sessions))
	for i, session := range sessions {
		count, countErr := s.repo.CountRecordsBySessionID(ctx, session.ID)
		if countErr != nil {
			return nil, countErr
		}
		result[i] = AttendanceSessionListItem{
			ID:               session.ID,
			StartAt:          session.StartAt,
			EndAt:            session.EndAt,
			IsActive:         session.IsActive,
			AttendeeCount:    int(count),
			LocationRequired: session.LocationRequired,
			CenterLatitude:   session.CenterLatitude,
			CenterLongitude:  session.CenterLongitude,
			RadiusMeters:     session.RadiusMeters,
		}
	}
	return result, nil
}

func (s *attendanceService) StartSession(ctx context.Context, courseID, startedByID uint, input AttendanceStartSessionInput) (*models.AttendanceSession, error) {
	_, err := s.repo.FindActiveSessionByCourseID(ctx, courseID)
	if err == nil {
		return nil, ErrAttendanceActiveSessionExists
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if input.TimeoutMinutes <= 0 || input.TimeoutMinutes > 60 {
		input.TimeoutMinutes = 15
	}
	if input.RadiusMeters <= 0 {
		input.RadiusMeters = 100
	}
	if input.RadiusMeters < 30 || input.RadiusMeters > 500 {
		return nil, ErrAttendanceLocationRequired
	}
	if !isValidCoordinate(input.CenterLatitude, input.CenterLongitude) {
		return nil, ErrAttendanceLocationRequired
	}
	now := time.Now()
	session := &models.AttendanceSession{
		CourseID:         courseID,
		StartedByID:      startedByID,
		StartAt:          now,
		EndAt:            now.Add(time.Duration(input.TimeoutMinutes) * time.Minute),
		TimeoutMinutes:   input.TimeoutMinutes,
		Code:             generateAttendanceCode(),
		IsActive:         true,
		LocationRequired: input.LocationRequired,
		CenterLatitude:   input.CenterLatitude,
		CenterLongitude:  input.CenterLongitude,
		RadiusMeters:     input.RadiusMeters,
	}
	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *attendanceService) EndSession(ctx context.Context, sessionID uint) error {
	session, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}
	if !session.IsActive {
		return ErrAttendanceSessionAlreadyEnded
	}
	session.IsActive = false
	return s.repo.UpdateSession(ctx, session)
}

func (s *attendanceService) Checkin(ctx context.Context, sessionID, studentID uint, input AttendanceCheckinInput) (AttendanceCheckinResult, error) {
	result := AttendanceCheckinResult{}
	session, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return result, err
	}

	if !session.IsActive {
		return result, ErrAttendanceSessionEnded
	}

	if time.Now().After(session.EndAt) {
		session.IsActive = false
		_ = s.repo.UpdateSession(ctx, session)
		return result, ErrAttendanceSessionExpired
	}

	if input.Code != session.Code {
		return result, ErrAttendanceInvalidCode
	}
	if session.LocationRequired {
		if !isValidCoordinate(input.Latitude, input.Longitude) {
			return result, ErrAttendanceLocationRequired
		}
		if distanceMeters(session.CenterLatitude, session.CenterLongitude, input.Latitude, input.Longitude) > float64(session.RadiusMeters) {
			return result, ErrAttendanceOutOfRange
		}
	}

	existing, err := s.repo.FindRecordBySessionAndStudent(ctx, sessionID, studentID)
	if err == nil {
		return AttendanceCheckinResult{
			AlreadyCheckedIn:  true,
			CheckedInAt:       existing.CheckedInAt,
			LocationValidated: existing.LocationValidated,
		}, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}

	now := time.Now()
	record := &models.AttendanceRecord{
		SessionID:         sessionID,
		StudentID:         studentID,
		CheckedInAt:       now,
		IPAddress:         input.Location,
		Latitude:          input.Latitude,
		Longitude:         input.Longitude,
		LocationValidated: !session.LocationRequired || isWithinRange(session, input.Latitude, input.Longitude),
	}
	if err := s.repo.Checkin(ctx, record); err != nil {
		return result, err
	}
	return AttendanceCheckinResult{
		AlreadyCheckedIn:  false,
		CheckedInAt:       now,
		LocationValidated: record.LocationValidated,
	}, nil
}

func (s *attendanceService) GetRecords(ctx context.Context, sessionID uint) ([]AttendanceRecordWithStudent, error) {
	records, err := s.repo.GetRecords(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return []AttendanceRecordWithStudent{}, nil
	}

	studentIDs := make([]uint, 0, len(records))
	for _, record := range records {
		studentIDs = append(studentIDs, record.StudentID)
	}
	users, err := s.userRepo.FindByIDs(ctx, studentIDs)
	if err != nil {
		return nil, err
	}

	userMap := make(map[uint]string, len(users))
	for _, user := range users {
		name := user.Name
		if name == "" {
			name = user.Username
		}
		userMap[user.ID] = name
	}

	result := make([]AttendanceRecordWithStudent, len(records))
	for i, record := range records {
		result[i] = AttendanceRecordWithStudent{
			StudentID:         record.StudentID,
			StudentName:       userMap[record.StudentID],
			CheckedInAt:       record.CheckedInAt,
			IPAddress:         record.IPAddress,
			Latitude:          record.Latitude,
			Longitude:         record.Longitude,
			LocationValidated: record.LocationValidated,
		}
	}
	return result, nil
}

func isValidCoordinate(latitude, longitude float64) bool {
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

func isWithinRange(session *models.AttendanceSession, latitude, longitude float64) bool {
	return distanceMeters(session.CenterLatitude, session.CenterLongitude, latitude, longitude) <= float64(session.RadiusMeters)
}

func distanceMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusMeters = 6371000.0
	toRadians := func(v float64) float64 {
		return v * math.Pi / 180
	}

	latDelta := toRadians(lat2 - lat1)
	lngDelta := toRadians(lng2 - lng1)
	lat1Rad := toRadians(lat1)
	lat2Rad := toRadians(lat2)

	a := math.Sin(latDelta/2)*math.Sin(latDelta/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(lngDelta/2)*math.Sin(lngDelta/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusMeters * c
}

func generateAttendanceCode() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	num := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", num)
}
