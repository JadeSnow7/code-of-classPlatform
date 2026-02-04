package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

func setupCourseTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(&models.User{}, &models.Course{}, &models.CourseEnrollment{})
	assert.NoError(t, err)

	return db
}

func setupCourseRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hCourse := newCourseHandlers(db)
	hAuth := newAuthHandlers(db, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthRequired(jwtSecret))
	{
		api.GET("/courses", hCourse.List)
		api.POST("/courses", hCourse.Create)
		api.GET("/courses/:courseId", hCourse.Get)
		api.GET("/courses/:courseId/modules", hCourse.GetModules)
		api.PUT("/courses/:courseId/modules", hCourse.UpdateModules)
	}

	return r
}

func createCourseTestUser(t *testing.T, db *gorm.DB, username string, password string, role string) models.User {
	passwordHash, err := auth.HashPassword(password)
	assert.NoError(t, err)

	user := models.User{
		Username:     username,
		PasswordHash: passwordHash,
		Role:         role,
		Name:         "Test " + username,
	}
	assert.NoError(t, db.Create(&user).Error)
	return user
}

func loginAndGetToken(t *testing.T, r *gin.Engine, username, password string) string {
	payload := []byte(`{"username":"` + username + `","password":"` + password + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[loginData]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	return resp.Data.AccessToken
}

func TestListCourses_AsTeacher(t *testing.T) {
	db := setupCourseTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	// Create course owned by this teacher
	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[[]models.Course]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Len(t, resp.Data, 1)
	assert.Equal(t, "Test Course", resp.Data[0].Name)
}

func TestListCourses_AsStudent(t *testing.T) {
	db := setupCourseTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	// Create course and enroll student
	course := models.Course{Name: "Enrolled Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	// Create another course student is NOT enrolled in
	db.Create(&models.Course{Name: "Other Course", TeacherID: teacher.ID})

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[[]models.Course]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Len(t, resp.Data, 1)
	assert.Equal(t, "Enrolled Course", resp.Data[0].Name)
}

func TestCreateCourse_Success(t *testing.T) {
	db := setupCourseTestDB(t)
	createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	payload := []byte(`{"name":"New Course","code":"CS101","semester":"2026 Spring"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/courses", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp envelope[models.Course]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "New Course", resp.Data.Name)
	assert.Equal(t, "CS101", resp.Data.Code)
}

func TestCreateCourse_Forbidden(t *testing.T) {
	db := setupCourseTestDB(t)
	createCourseTestUser(t, db, "student1", "pass123", "student")

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	payload := []byte(`{"name":"New Course"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/courses", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)

	var resp envelope[interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, "ACCESS_DENIED", resp.Error.Code)
}

func TestGetCourse_Success(t *testing.T) {
	db := setupCourseTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "My Course", TeacherID: teacher.ID}
	db.Create(&course)

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses/1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[models.Course]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "My Course", resp.Data.Name)
}

func TestUpdateModules_Success(t *testing.T) {
	db := setupCourseTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "My Course", TeacherID: teacher.ID}
	db.Create(&course)

	r := setupCourseRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	payload := []byte(`{"enabled_modules":["core.ai","simulation"]}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/courses/1/modules", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)

	modules := resp.Data["enabled_modules"].([]interface{})
	assert.Len(t, modules, 2)
}
