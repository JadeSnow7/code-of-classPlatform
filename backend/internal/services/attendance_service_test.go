package services

import (
	"context"
	"testing"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

type fakeAttendanceRepo struct {
	repositories.AttendanceRepository
	activeSession *models.AttendanceSession
	sessionByID   map[uint]*models.AttendanceSession
	recordByKey   map[[2]uint]*models.AttendanceRecord
	records       []*models.AttendanceRecord
	updated       *models.AttendanceSession
	created       *models.AttendanceSession
}

func (f *fakeAttendanceRepo) FindActiveSessionByCourseID(context.Context, uint) (*models.AttendanceSession, error) {
	if f.activeSession == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.activeSession, nil
}
func (f *fakeAttendanceRepo) CreateSession(_ context.Context, session *models.AttendanceSession) error {
	f.created = session
	return nil
}
func (f *fakeAttendanceRepo) FindSessionByID(_ context.Context, id uint) (*models.AttendanceSession, error) {
	if f.sessionByID == nil || f.sessionByID[id] == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return f.sessionByID[id], nil
}
func (f *fakeAttendanceRepo) UpdateSession(_ context.Context, session *models.AttendanceSession) error {
	f.updated = session
	return nil
}
func (f *fakeAttendanceRepo) FindRecordBySessionAndStudent(_ context.Context, sessionID, studentID uint) (*models.AttendanceRecord, error) {
	if f.recordByKey == nil {
		return nil, gorm.ErrRecordNotFound
	}
	if r, ok := f.recordByKey[[2]uint{sessionID, studentID}]; ok {
		return r, nil
	}
	return nil, gorm.ErrRecordNotFound
}
func (f *fakeAttendanceRepo) Checkin(_ context.Context, record *models.AttendanceRecord) error {
	f.records = append(f.records, record)
	return nil
}
func (f *fakeAttendanceRepo) GetRecords(context.Context, uint) ([]*models.AttendanceRecord, error) {
	return f.records, nil
}

type fakeAttendanceUserRepo struct {
	repositories.UserRepository
	users []*models.User
}

func (f *fakeAttendanceUserRepo) FindByIDs(context.Context, []uint) ([]*models.User, error) {
	return f.users, nil
}

func TestAttendanceService_StartSession_ActiveExists(t *testing.T) {
	repo := &fakeAttendanceRepo{activeSession: &models.AttendanceSession{Model: gorm.Model{ID: 1}}}
	svc := NewAttendanceService(repo, &fakeAttendanceUserRepo{})

	_, err := svc.StartSession(context.Background(), 10, 5, 15)
	assert.ErrorIs(t, err, ErrAttendanceActiveSessionExists)
}

func TestAttendanceService_Checkin_ExpiredSession(t *testing.T) {
	repo := &fakeAttendanceRepo{
		sessionByID: map[uint]*models.AttendanceSession{
			1: {
				Model:    gorm.Model{ID: 1},
				IsActive: true,
				Code:     "123456",
				EndAt:    time.Now().Add(-time.Minute),
			},
		},
	}
	svc := NewAttendanceService(repo, &fakeAttendanceUserRepo{})

	_, err := svc.Checkin(context.Background(), 1, 99, "123456", "127.0.0.1")
	assert.ErrorIs(t, err, ErrAttendanceSessionExpired)
	assert.NotNil(t, repo.updated)
	assert.False(t, repo.updated.IsActive)
}

func TestAttendanceService_Checkin_AlreadyCheckedIn(t *testing.T) {
	now := time.Now().Add(-time.Minute)
	repo := &fakeAttendanceRepo{
		sessionByID: map[uint]*models.AttendanceSession{
			2: {
				Model:    gorm.Model{ID: 2},
				IsActive: true,
				Code:     "654321",
				EndAt:    time.Now().Add(time.Minute),
			},
		},
		recordByKey: map[[2]uint]*models.AttendanceRecord{
			{2, 88}: {CheckedInAt: now},
		},
	}
	svc := NewAttendanceService(repo, &fakeAttendanceUserRepo{})

	result, err := svc.Checkin(context.Background(), 2, 88, "654321", "127.0.0.1")
	assert.NoError(t, err)
	assert.True(t, result.AlreadyCheckedIn)
	assert.Equal(t, now, result.CheckedInAt)
}

func TestAttendanceService_GetRecords_MapsStudentNames(t *testing.T) {
	repo := &fakeAttendanceRepo{
		records: []*models.AttendanceRecord{
			{StudentID: 1, CheckedInAt: time.Now(), IPAddress: "ip1"},
			{StudentID: 2, CheckedInAt: time.Now(), IPAddress: "ip2"},
		},
	}
	userRepo := &fakeAttendanceUserRepo{
		users: []*models.User{
			{Model: gorm.Model{ID: 1}, Name: "Alice", Username: "alice"},
			{Model: gorm.Model{ID: 2}, Name: "", Username: "bob"},
		},
	}
	svc := NewAttendanceService(repo, userRepo)

	items, err := svc.GetRecords(context.Background(), 1)
	assert.NoError(t, err)
	assert.Len(t, items, 2)
	assert.Equal(t, "Alice", items[0].StudentName)
	assert.Equal(t, "bob", items[1].StudentName)
}
