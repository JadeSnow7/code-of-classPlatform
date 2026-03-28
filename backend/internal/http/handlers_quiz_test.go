package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"github.com/huaodong/llm-teaching-platform/backend/internal/repositories"
	"github.com/huaodong/llm-teaching-platform/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupQuizTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	migrateAuthTables(t, db)
	err = db.AutoMigrate(
		&models.Course{},
		&models.CourseEnrollment{},
		&models.Quiz{},
		&models.Question{},
		&models.QuizAttempt{},
	)
	assert.NoError(t, err)

	return db
}

func setupQuizRouter(db *gorm.DB, jwtSecret string) *gin.Engine {
	hQuiz := newQuizHandlers(db)
	userRepo := repositories.NewUserRepository(db)
	authService := services.NewAuthService(userRepo, newAuthTestConfig(jwtSecret))
	hAuth := newAuthHandlers(authService, jwtSecret)

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
		api.POST("/quizzes/:id/attempts", hQuiz.CreateAttempt)
		api.GET("/quiz-attempts/:attemptId", hQuiz.GetAttempt)
		api.PATCH("/quiz-attempts/:attemptId/answers", hQuiz.UpdateAttemptAnswers)
		api.POST("/quiz-attempts/:attemptId/submit", hQuiz.SubmitAttempt)
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
		"time_limit": 60
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

func TestListQuizzes_ReturnsPaginatedFrontendContract(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher-list", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student-list", "pass123", "student")

	course := models.Course{Name: "Quiz Contract Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	for i, title := range []string{"Quiz A", "Quiz B", "Quiz C"} {
		quiz := models.Quiz{
			CourseID:    course.ID,
			CreatedByID: teacher.ID,
			Title:       title,
			IsPublished: true,
			MaxAttempts: 2,
			TotalPoints: 10 + i,
		}
		assert.NoError(t, db.Create(&quiz).Error)
	}

	score := 8
	assert.NoError(t, db.Create(&models.QuizAttempt{
		QuizID:        3,
		StudentID:     student.ID,
		AttemptNumber: 1,
		Score:         &score,
		MaxScore:      12,
	}).Error)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student-list", "pass123")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/courses/1/quizzes?page=1&page_size=2", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp envelope[struct {
		Items      []map[string]any `json:"items"`
		Total      int              `json:"total"`
		Page       int              `json:"page"`
		PageSize   int              `json:"page_size"`
		TotalPages int              `json:"total_pages"`
		HasMore    bool             `json:"has_more"`
	}]
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Data.Items, 2)
	assert.Equal(t, 3, resp.Data.Total)
	assert.Equal(t, 1, resp.Data.Page)
	assert.Equal(t, 2, resp.Data.PageSize)
	assert.Equal(t, 2, resp.Data.TotalPages)
	assert.True(t, resp.Data.HasMore)
	assert.Equal(t, "Quiz C", resp.Data.Items[0]["title"])
	assert.Equal(t, float64(1), resp.Data.Items[0]["attempt_count"])
	assert.Equal(t, float64(8), resp.Data.Items[0]["best_score"])
}

func TestStartQuiz_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{
		CourseID:    course.ID,
		CreatedByID: teacher.ID,
		Title:       "Published Quiz",
		IsPublished: true,
		MaxAttempts: 1,
		TotalPoints: 10,
	}
	db.Create(&quiz)

	// Add a question
	db.Create(&models.Question{
		QuizID:  quiz.ID,
		Content: "What is 2+2?",
		Type:    "single_choice",
		Options: `["3","4","5"]`,
		Answer:  "4",
		Points:  10,
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
	assert.NotNil(t, resp.Data["attempt"])
}

func TestSubmitQuiz_Success(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher1", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student1", "pass123", "student")

	course := models.Course{Name: "Test Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{
		CourseID:    course.ID,
		CreatedByID: teacher.ID,
		Title:       "Quiz",
		IsPublished: true,
		MaxAttempts: 1,
		TotalPoints: 10,
	}
	db.Create(&quiz)

	question := models.Question{
		QuizID:  quiz.ID,
		Content: "What is 2+2?",
		Type:    "single_choice",
		Options: `["3","4","5"]`,
		Answer:  "4",
		Points:  10,
	}
	db.Create(&question)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student1", "pass123")

	// Start quiz to create an in-progress attempt
	startReq := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/1/start", nil)
	startReq.Header.Set("Authorization", "Bearer "+token)
	startW := httptest.NewRecorder()
	r.ServeHTTP(startW, startReq)
	assert.Equal(t, http.StatusOK, startW.Code)

	answers := map[string]interface{}{
		strconv.FormatUint(uint64(question.ID), 10): "4",
	}
	payloadBytes, err := json.Marshal(map[string]interface{}{"answers": answers})
	assert.NoError(t, err)

	payload := payloadBytes
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

	quiz := models.Quiz{
		CourseID:    course.ID,
		CreatedByID: teacher.ID,
		Title:       "Quiz",
		IsPublished: true,
		MaxAttempts: 1,
		TotalPoints: 100,
	}
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

func TestQuizAttemptEndpoints_NewContract(t *testing.T) {
	db := setupQuizTestDB(t)
	teacher := createCourseTestUser(t, db, "teacher2", "pass123", "teacher")
	student := createCourseTestUser(t, db, "student2", "pass123", "student")

	course := models.Course{Name: "Attempt Course", TeacherID: teacher.ID}
	db.Create(&course)
	db.Create(&models.CourseEnrollment{CourseID: course.ID, UserID: student.ID})

	quiz := models.Quiz{
		CourseID:    course.ID,
		CreatedByID: teacher.ID,
		Title:       "Attempt Quiz",
		IsPublished: true,
		MaxAttempts: 1,
		TotalPoints: 10,
	}
	db.Create(&quiz)
	question := models.Question{
		QuizID:  quiz.ID,
		Content: "What is 2+2?",
		Type:    "single_choice",
		Options: `["3","4","5"]`,
		Answer:  "4",
		Points:  10,
	}
	db.Create(&question)

	r := setupQuizRouter(db, "test-secret")
	token := loginAndGetToken(t, r, "student2", "pass123")

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/1/attempts", nil)
	createReq.Header.Set("Authorization", "Bearer "+token)
	createW := httptest.NewRecorder()
	r.ServeHTTP(createW, createReq)
	assert.Equal(t, http.StatusOK, createW.Code)

	var created envelope[map[string]interface{}]
	assert.NoError(t, json.Unmarshal(createW.Body.Bytes(), &created))
	attemptID := int(created.Data["id"].(float64))

	patchBody := []byte(`{"answers":[{"question_id":"1","answer":"4"}]}`)
	patchReq := httptest.NewRequest(http.MethodPatch, "/api/v1/quiz-attempts/"+strconv.Itoa(attemptID)+"/answers", bytes.NewReader(patchBody))
	patchReq.Header.Set("Authorization", "Bearer "+token)
	patchReq.Header.Set("Content-Type", "application/json")
	patchW := httptest.NewRecorder()
	r.ServeHTTP(patchW, patchReq)
	assert.Equal(t, http.StatusOK, patchW.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/quiz-attempts/"+strconv.Itoa(attemptID), nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)
	assert.Equal(t, http.StatusOK, getW.Code)
	assert.Contains(t, getW.Body.String(), "\"elapsedTime\"")
	assert.Contains(t, getW.Body.String(), "\"questionId\":\"1\"")

	submitReq := httptest.NewRequest(http.MethodPost, "/api/v1/quiz-attempts/"+strconv.Itoa(attemptID)+"/submit", nil)
	submitReq.Header.Set("Authorization", "Bearer "+token)
	submitW := httptest.NewRecorder()
	r.ServeHTTP(submitW, submitReq)
	assert.Equal(t, http.StatusOK, submitW.Code)
	assert.Contains(t, submitW.Body.String(), "\"maxScore\":10")
}
