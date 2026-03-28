package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// QuizHandlers interface for quiz handler methods
type QuizHandlers interface {
	ListQuizzes(c *gin.Context)
	CreateQuiz(c *gin.Context)
	GetQuiz(c *gin.Context)
	UpdateQuiz(c *gin.Context)
	DeleteQuiz(c *gin.Context)
	PublishQuiz(c *gin.Context)
	UnpublishQuiz(c *gin.Context)
	AddQuestion(c *gin.Context)
	UpdateQuestion(c *gin.Context)
	DeleteQuestion(c *gin.Context)
	StartQuiz(c *gin.Context)
	SubmitQuiz(c *gin.Context)
	GetQuizResult(c *gin.Context)
	CreateAttempt(c *gin.Context)
	GetAttempt(c *gin.Context)
	UpdateAttemptAnswers(c *gin.Context)
	SubmitAttempt(c *gin.Context)
}

// RegisterQuizRoutes registers quiz routes
func RegisterQuizRoutes(api *gin.RouterGroup, jwtSecret string, h QuizHandlers) {
	// Course-level quiz routes
	api.GET("/courses/:courseId/quizzes", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizRead), h.ListQuizzes)

	// Quiz CRUD
	api.POST("/quizzes", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.CreateQuiz)
	api.GET("/quizzes/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizRead), h.GetQuiz)
	api.PUT("/quizzes/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.UpdateQuiz)
	api.DELETE("/quizzes/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.DeleteQuiz)

	// Quiz publishing
	api.POST("/quizzes/:id/publish", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.PublishQuiz)
	api.POST("/quizzes/:id/unpublish", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.UnpublishQuiz)

	// Question management
	api.POST("/quizzes/:id/questions", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.AddQuestion)
	api.PUT("/questions/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.UpdateQuestion)
	api.DELETE("/questions/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizWrite), h.DeleteQuestion)

	// Quiz taking
	api.POST("/quizzes/:id/start", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizTake), h.StartQuiz)
	api.POST("/quizzes/:id/submit", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizTake), h.SubmitQuiz)
	api.GET("/quizzes/:id/result", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizRead), h.GetQuizResult)
	api.POST("/quizzes/:id/attempts", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizTake), h.CreateAttempt)
	api.GET("/quiz-attempts/:attemptId", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizRead), h.GetAttempt)
	api.PATCH("/quiz-attempts/:attemptId/answers", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizTake), h.UpdateAttemptAnswers)
	api.POST("/quiz-attempts/:attemptId/submit", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermQuizTake), h.SubmitAttempt)
}
