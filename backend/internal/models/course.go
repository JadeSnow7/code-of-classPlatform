package models

import (
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Course represents a course managed on the platform.
type Course struct {
	gorm.Model
	Name           string         `gorm:"size:128;not null" json:"name"`
	Code           string         `gorm:"size:64;index" json:"code,omitempty"`
	Semester       string         `gorm:"size:64;index" json:"semester,omitempty"`
	TeacherID      uint           `gorm:"index" json:"teacher_id"`
	EnabledModules datatypes.JSON `gorm:"type:json" json:"enabled_modules,omitempty"`
	ModuleSettings datatypes.JSON `gorm:"type:json" json:"module_settings,omitempty"`
}
