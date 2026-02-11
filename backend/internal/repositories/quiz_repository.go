package repositories

import (
	"context"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

type quizRepository struct {
	db *gorm.DB
}

func NewQuizRepository(db *gorm.DB) *QuizRepository {
	return &quizRepository{db: db}
}

func (r *quizRepository) ListByCourse(ctx context.Context, courseID uint, publishedOnly bool) ([]models.Quiz, error) {
	db := r.db.WithContext(ctx).Where("course_id = ?", courseID).Order("created_at DESC")
	if publishedOnly {
		db = db.Where("is_published = ?", true)
	}
	var quizzes []models.Quiz
	if err := db.Find(&quizzes).Error; err != nil {
		return nil, err
	}
	return quizzes, nil
}

func (r *quizRepository) FindByID(ctx context.Context, quizID uint) (*models.Quiz, error) {
	var quiz models.Quiz
	if err := r.db.WithContext(ctx).First(&quiz, quizID).Error; err != nil {
		return nil, err
	}
	return &quiz, nil
}

func (r *quizRepository) Create(ctx context.Context, quiz *models.Quiz) error {
	return r.db.WithContext(ctx).Create(quiz).Error
}

func (r *quizRepository) Update(ctx context.Context, quiz *models.Quiz, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(quiz).Updates(updates).Error
}

func (r *quizRepository) Save(ctx context.Context, quiz *models.Quiz) error {
	return r.db.WithContext(ctx).Save(quiz).Error
}

func (r *quizRepository) DeleteByID(ctx context.Context, quizID uint) error {
	return r.db.WithContext(ctx).Delete(&models.Quiz{}, quizID).Error
}

func (r *quizRepository) ListQuestions(ctx context.Context, quizID uint) ([]models.Question, error) {
	var questions []models.Question
	if err := r.db.WithContext(ctx).Where("quiz_id = ?", quizID).Order("order_num ASC").Find(&questions).Error; err != nil {
		return nil, err
	}
	return questions, nil
}

func (r *quizRepository) FindQuestionByID(ctx context.Context, questionID uint) (*models.Question, error) {
	var question models.Question
	if err := r.db.WithContext(ctx).First(&question, questionID).Error; err != nil {
		return nil, err
	}
	return &question, nil
}

func (r *quizRepository) CreateQuestion(ctx context.Context, question *models.Question) error {
	return r.db.WithContext(ctx).Create(question).Error
}

func (r *quizRepository) SaveQuestion(ctx context.Context, question *models.Question) error {
	return r.db.WithContext(ctx).Save(question).Error
}

func (r *quizRepository) DeleteQuestion(ctx context.Context, questionID uint) error {
	return r.db.WithContext(ctx).Delete(&models.Question{}, questionID).Error
}

func (r *quizRepository) DeleteQuestionsByQuiz(ctx context.Context, quizID uint) error {
	return r.db.WithContext(ctx).Where("quiz_id = ?", quizID).Delete(&models.Question{}).Error
}

func (r *quizRepository) DeleteAttemptsByQuiz(ctx context.Context, quizID uint) error {
	return r.db.WithContext(ctx).Where("quiz_id = ?", quizID).Delete(&models.QuizAttempt{}).Error
}

func (r *quizRepository) CountAttempts(ctx context.Context, quizID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&models.QuizAttempt{}).Where("quiz_id = ?", quizID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *quizRepository) CountAttemptsByQuizAndStudent(ctx context.Context, quizID uint, studentID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&models.QuizAttempt{}).
		Where("quiz_id = ? AND student_id = ?", quizID, studentID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *quizRepository) FindInProgressAttempt(ctx context.Context, quizID uint, studentID uint) (*models.QuizAttempt, error) {
	var attempt models.QuizAttempt
	if err := r.db.WithContext(ctx).
		Where("quiz_id = ? AND student_id = ? AND submitted_at IS NULL", quizID, studentID).
		First(&attempt).Error; err != nil {
		return nil, err
	}
	return &attempt, nil
}

func (r *quizRepository) CreateAttempt(ctx context.Context, attempt *models.QuizAttempt) error {
	return r.db.WithContext(ctx).Create(attempt).Error
}

func (r *quizRepository) SaveAttempt(ctx context.Context, attempt *models.QuizAttempt) error {
	return r.db.WithContext(ctx).Save(attempt).Error
}

func (r *quizRepository) SumQuestionPoints(ctx context.Context, quizID uint) (int, error) {
	var total int
	if err := r.db.WithContext(ctx).Model(&models.Question{}).
		Where("quiz_id = ?", quizID).
		Select("COALESCE(SUM(points), 0)").
		Scan(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *quizRepository) ListAttemptsByQuizAndStudent(ctx context.Context, quizID uint, studentID uint) ([]models.QuizAttempt, error) {
	var attempts []models.QuizAttempt
	if err := r.db.WithContext(ctx).Where("quiz_id = ? AND student_id = ?", quizID, studentID).Find(&attempts).Error; err != nil {
		return nil, err
	}
	return attempts, nil
}

func (r *quizRepository) ListAttemptsByQuiz(ctx context.Context, quizID uint, order string) ([]models.QuizAttempt, error) {
	db := r.db.WithContext(ctx).Where("quiz_id = ?", quizID)
	if order != "" {
		db = db.Order(order)
	}
	var attempts []models.QuizAttempt
	if err := db.Find(&attempts).Error; err != nil {
		return nil, err
	}
	return attempts, nil
}

func (r *quizRepository) ListAttemptsByQuizAndStudentOrder(ctx context.Context, quizID uint, studentID uint, order string) ([]models.QuizAttempt, error) {
	db := r.db.WithContext(ctx).Where("quiz_id = ? AND student_id = ?", quizID, studentID)
	if order != "" {
		db = db.Order(order)
	}
	var attempts []models.QuizAttempt
	if err := db.Find(&attempts).Error; err != nil {
		return nil, err
	}
	return attempts, nil
}
