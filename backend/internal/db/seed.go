package db

import (
	"errors"

	"github.com/huaodong/emfield-teaching-platform/backend/internal/auth"
	"github.com/huaodong/emfield-teaching-platform/backend/internal/models"
	"gorm.io/gorm"
)

func SeedDemoUsers(gormDB *gorm.DB) (bool, error) {
	var count int64
	if err := gormDB.Model(&models.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	if count > 0 {
		return false, nil
	}

	type seedUser struct {
		Username string
		Password string
		Role     string
		Name     string
	}
	users := []seedUser{
		// Admin
		{Username: "admin", Password: "admin123", Role: "admin", Name: "管理员"},
		// Teachers
		{Username: "teacher", Password: "teacher123", Role: "teacher", Name: "教师"},
		{Username: "teacher1", Password: "teacher1123", Role: "teacher", Name: "王老师"},
		{Username: "teacher2", Password: "teacher2123", Role: "teacher", Name: "李老师"},
		// Assistant
		{Username: "assistant1", Password: "assistant1123", Role: "assistant", Name: "助教小张"},
		// Students
		{Username: "student", Password: "student123", Role: "student", Name: "学生"},
		{Username: "student1", Password: "student1123", Role: "student", Name: "张同学"},
		{Username: "student2", Password: "student2123", Role: "student", Name: "李同学"},
		{Username: "student3", Password: "student3123", Role: "student", Name: "王同学"},
		{Username: "student4", Password: "student4123", Role: "student", Name: "刘同学"},
		{Username: "student5", Password: "student5123", Role: "student", Name: "陈同学"},
	}

	for _, u := range users {
		passwordHash, err := auth.HashPassword(u.Password)
		if err != nil {
			return false, err
		}
		if err := gormDB.Create(&models.User{
			Username:     u.Username,
			PasswordHash: passwordHash,
			Role:         u.Role,
			Name:         u.Name,
		}).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				continue
			}
			return false, err
		}
	}

	return true, nil
}
