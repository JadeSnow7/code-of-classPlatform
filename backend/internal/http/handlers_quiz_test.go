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

func setupQuizTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(
		&models.User{},
		&models.Course{},
		&models.CourseEnrollment{},
		&models.Quiz{},
		&models.QuizQuestion{},
		&models.QuizAttempt{},
		&models.QuizAnswer{},
	)
	assert.NoError(t, err)

	return db
}

func setupQuizRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hQuiz := newQuizHandlers(db)
	hAuth := newAuthHandlers(db, jwtSecret)

	r := gin.New()
	r.POST("/auth/login", hAuth.Login)

	api := r.Group("/api/v1")
	api.Use(middleware.AuthRequired(jwtSecret))
	{
		api.GET("/courses/:courseId/quizzes", hQuiz.ListQuizzes)
		api.POST("/quizzes", hQuiz.CreateQuiz)
		api.GET("/quizzes/:id", hQuiz.GetQuiz)
		api.POST("/quizzes/:id/start", hQuiz.StartQuiz)
		api.POST("/quizzes/:id/submit", hQuiz.SubmitQuiz)
		api.GET("/quizzes/:id/result", hQuiz.GetQuizResult)
	}

	return r
}

func TestCreateQuiz_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "teacher1", "pass123")

	payload := []byte(`{
		"course_id": 1,
		"title": "Midterm Quiz",
		"time_limit_seconds": 3600
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp envelope[models.Quiz]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, "Midterm Quiz", resp.Data.Title)
}

func TestStartQuiz_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{CourseID: course.ID, Title: "Published Quiz", IsPublished: true}
	db.Create(&quiz)

	// Add a question
	db.Create(&models.QuizQuestion{
		QuizID:       quiz.ID,
		QuestionText: "What is 2+2?",
		QuestionType: "single_choice",
		Options:      `["3","4","5"]`,
		Points:       10,
	})

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/1/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.NotNil(t, resp.Data["attempt_id"])
}

func TestSubmitQuiz_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{CourseID: course.ID, Title: "Quiz", IsPublished: true}
	db.Create(&quiz)

	question := models.QuizQuestion{
		QuizID:        quiz.ID,
		QuestionText:  "What is 2+2?",
		QuestionType:  "single_choice",
		Options:       `["3","4","5"]`,
		CorrectAnswer: "4",
		Points:        10,
	}
	db.Create(&question)

	attempt := models.QuizAttempt{
		QuizID:    quiz.ID,
		StudentID: student.ID,
		MaxScore:  10,
	}
	db.Create(&attempt)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	payload := []byte(`{
		"answers": [
			{"question_id": 1, "answer": "4"}
		]
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/1/submit", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestGetQuizResult_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{CourseID: course.ID, Title: "Quiz", IsPublished: true}
	db.Create(&quiz)

	score := 85
	attempt := models.QuizAttempt{
		QuizID:    quiz.ID,
		StudentID: student.ID,
		Score:     &score,
		MaxScore:  100,
	}
	db.Create(&attempt)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/quizzes/1/result", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}
