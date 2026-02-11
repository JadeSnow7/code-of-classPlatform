package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/authz"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// ResourceHandlers interface for resource handler methods
type ResourceHandlers interface {
	ListResources(c *gin.Context)
	CreateResource(c *gin.Context)
	DeleteResource(c *gin.Context)
}

// RegisterResourceRoutes registers resource routes
func RegisterResourceRoutes(api *gin.RouterGroup, jwtSecret string, h ResourceHandlers) {
	api.GET("/courses/:courseId/resources", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermResourceRead), h.ListResources)
	api.POST("/resources", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermResourceWrite), h.CreateResource)
	api.DELETE("/resources/:id", middleware.AuthRequired(jwtSecret), middleware.RequirePermission(authz.PermResourceWrite), h.DeleteResource)
}
