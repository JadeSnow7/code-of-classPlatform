package http

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huaodong/llm-teaching-platform/backend/internal/middleware"
	"github.com/huaodong/llm-teaching-platform/backend/internal/notification"
)

type eventHandlers struct {
	hub *notification.Hub
}

func NewEventHandlers(hub *notification.Hub) *eventHandlers {
	return &eventHandlers{hub: hub}
}

// Stream streams notification events to the authenticated user via SSE.
// GET /api/v1/events
func (h *eventHandlers) Stream(c *gin.Context) {
	user, ok := middleware.GetUser(c)
	if !ok {
		c.AbortWithStatus(401)
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch, cancel := h.hub.Subscribe(user.ID)
	defer cancel()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	// Send initial heartbeat so the client knows the connection is live.
	writeNotificationEvent(c, "heartbeat", gin.H{"ts": time.Now().Unix()})

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-heartbeat.C:
			writeNotificationEvent(c, "heartbeat", gin.H{"ts": time.Now().Unix()})
		case event, ok := <-ch:
			if !ok {
				return
			}
			writeNotificationEvent(c, event.Type, event.Payload)
		}
	}
}

func writeNotificationEvent(c *gin.Context, eventType string, payload interface{}) {
	data, _ := json.Marshal(payload)
	fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", eventType, data)
	c.Writer.Flush()
}
