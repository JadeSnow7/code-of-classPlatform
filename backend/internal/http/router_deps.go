package http

import (
	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/http/routes"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
)

// RouterDeps holds all externally assembled dependencies required by routing.
type RouterDeps struct {
	AuthHandlers            routes.AuthHandlers
	UserHandlers            routes.UserHandlers
	LearningHubHandlers     routes.LearningHubHandlers
	AIConfigHandlers        routes.AIConfigHandlers
	WecomHandlers           routes.WecomHandlers
	CourseHandlers          routes.CourseHandlers
	ChapterHandlers         routes.ChapterHandlers
	AssignmentHandlers      routes.AssignmentHandlers
	QuizHandlers            routes.QuizHandlers
	ResourceHandlers        routes.ResourceHandlers
	UploadHandlers          routes.UploadHandlers
	AIHandlers              routes.AIHandlers
	KnowledgeExportHandlers routes.KnowledgeExportHandlers
	AnnouncementHandlers    routes.AnnouncementHandlers
	AttendanceHandlers      routes.AttendanceHandlers
	WritingHandlers         routes.WritingHandlers
	WorkspaceHandlers       routes.WorkspaceHandlers
	LearningProfileHandlers routes.LearningProfileHandlers
	GlobalProfileHandlers   routes.GlobalProfileHandlers
	AdminHandlers           routes.AdminHandlers

	AuthLimiter          *middleware.RateLimiter
	AiLimiter            *middleware.RateLimiter
	RequireWritingModule gin.HandlerFunc
}
