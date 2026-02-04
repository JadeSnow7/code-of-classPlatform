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

func setupChapterTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(
		&models.User{},
		&models.Course{},
		&models.CourseEnrollment{},
		&models.Chapter{},
		&models.ChapterProgress{},
	)
	assert.NoError(t, err)

	return db
}

func setupChapterRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hChapter := newChapterHandlers(db)
	hAuth := newAuthHandlers(db, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthRequired(jwtSecret))
	{
		api.GET("/courses/:courseId/chapters", hChapter.ListChapters)
		api.POST("/courses/:courseId/chapters", hChapter.CreateChapter)
		api.GET("/chapters/:id", hChapter.GetChapter)
	}

	return r
}

func TestListChapters_Success(t *testing.T) {
	db := setupChapterTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	db.Create(&models.Chapter{CourseID: course.ID, Title: "Chapter 1", OrderNum: 1})
	db.Create(&models.Chapter{CourseID: course.ID, Title: "Chapter 2", OrderNum: 2})

	r := setupChapterRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses/1/chapters", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[[]models.Chapter]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Len(t, resp.Data, 2)
	assert.Equal(t, "Chapter 1", resp.Data[0].Title)
}

func TestCreateChapter_Success(t *testing.T) {
	db := setupChapterTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	r := setupChapterRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	payload := []byte(`{"title":"New Chapter","order_num":1}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/courses/1/chapters", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp envelope[models.Chapter]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "New Chapter", resp.Data.Title)
}
