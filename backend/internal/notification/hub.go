package notification

import "sync"

// Event is a server-sent notification event.
type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Hub is an in-memory pub/sub hub keyed by user ID.
type Hub struct {
	mu   sync.RWMutex
	subs map[uint][]chan Event
}

// New returns a new Hub.
func New() *Hub {
	return &Hub{subs: make(map[uint][]chan Event)}
}

// Subscribe registers a channel for the given user and returns it alongside
// a cancel function that must be called to unsubscribe and close the channel.
func (h *Hub) Subscribe(userID uint) (<-chan Event, func()) {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subs[userID] = append(h.subs[userID], ch)
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		subs := h.subs[userID]
		for i, c := range subs {
			if c == ch {
				h.subs[userID] = append(subs[:i], subs[i+1:]...)
				close(ch)
				return
			}
		}
	}
	return ch, cancel
}

// Publish sends an event to all subscribers of the given user.
// The send is non-blocking; events are dropped if the subscriber's buffer is full.
func (h *Hub) Publish(userID uint, event Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subs[userID] {
		select {
		case ch <- event:
		default:
		}
	}
}

// PublishMany publishes an event to a set of users.
func (h *Hub) PublishMany(userIDs []uint, event Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, uid := range userIDs {
		for _, ch := range h.subs[uid] {
			select {
			case ch <- event:
			default:
			}
		}
	}
}
