package routes

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RequireCourseModule is a middleware helper that can be used by route registration functions
// It is re-exported from the parent http package to avoid circular dependencies
var RequireCourseModule func(db *gorm.DB, moduleKey string) gin.HandlerFunc
