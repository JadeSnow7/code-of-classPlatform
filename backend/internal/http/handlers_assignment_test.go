package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

func setupAssignmentTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(
		&models.User{},
		&models.Course{},
		&models.CourseEnrollment{},
		&models.Assignment{},
		&models.Submission{},
	)
	assert.NoError(t, err)

	return db
}

func setupAssignmentRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hAssignment := newAssignmentHandlers(db)
	hAuth := newAuthHandlers(db, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthRequired(jwtSecret))
	{
		api.GET("/courses/:courseId/assignments", hAssignment.ListAssignments)
		api.POST("/assignments/:id/submit", hAssignment.SubmitAssignment)
		api.POST("/submissions/:id/grade", hAssignment.GradeSubmission)
	}

	return r
}

func TestListAssignments_Success(t *testing.T) {
	db := setupAssignmentTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	db.Create(&models.Assignment{CourseID: course.ID, Title: "Homework 1"})
	db.Create(&models.Assignment{CourseID: course.ID, Title: "Homework 2"})

	r := setupAssignmentRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses/1/assignments", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[[]models.Assignment]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Len(t, resp.Data, 2)
}

func TestSubmitAssignment_Success(t *testing.T) {
	db := setupAssignmentTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})
	db.Create(&models.Assignment{CourseID: course.ID, Title: "Homework 1"})

	r := setupAssignmentRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	payload := []byte(`{"content":"My submission content"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assignments/1/submit", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// May return 200 or 201 depending on implementation
	assert.True(t, w.Code == http.StatusOK || w.Code == http.StatusCreated)

	var resp envelope[interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestGradeSubmission_Success(t *testing.T) {
	db := setupAssignmentTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	assignment := models.Assignment{CourseID: course.ID, Title: "Homework 1"}
	db.Create(&assignment)

	submission := models.Submission{
		AssignmentID: assignment.ID,
		StudentID:    student.ID,
		Content:      "Student work",
	}
	db.Create(&submission)

	r := setupAssignmentRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	payload := []byte(`{"grade":85,"feedback":"Good job!"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/submissions/1/grade", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}
