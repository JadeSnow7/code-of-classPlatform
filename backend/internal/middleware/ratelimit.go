package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiter implements an in-memory token bucket per key.
type RateLimiter struct {
	rate        rate.Limit
	burst       int
	ttl         time.Duration
	mu          sync.Mutex
	visitors    map[string]*visitor
	nextCleanup time.Time
}

// NewRateLimiter creates a RateLimiter with the given rate, burst, and TTL.
func NewRateLimiter(r rate.Limit, burst int, ttl time.Duration) *RateLimiter {
	return &RateLimiter{
		rate:        r,
		burst:       burst,
		ttl:         ttl,
		visitors:    make(map[string]*visitor),
		nextCleanup: time.Now().Add(ttl),
	}
}

// Allow reports whether a request for the given key is allowed.
func (rl *RateLimiter) Allow(key string) bool {
	limiter := rl.getLimiter(key)
	return limiter.Allow()
}

func (rl *RateLimiter) getLimiter(key string) *rate.Limiter {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	if now.After(rl.nextCleanup) {
		rl.cleanup(now)
	}

	if v, ok := rl.visitors[key]; ok {
		v.lastSeen = now
		return v.limiter
	}

	limiter := rate.NewLimiter(rl.rate, rl.burst)
	rl.visitors[key] = &visitor{limiter: limiter, lastSeen: now}
	return limiter
}

func (rl *RateLimiter) cleanup(now time.Time) {
	for k, v := range rl.visitors {
		if now.Sub(v.lastSeen) > rl.ttl {
			delete(rl.visitors, k)
		}
	}
	rl.nextCleanup = now.Add(rl.ttl)
}

// RateLimitByIP limits requests based on client IP.
func RateLimitByIP(rl *RateLimiter) gin.HandlerFunc {
	return rateLimitWithKey(rl, func(c *gin.Context) string {
		return c.ClientIP()
	})
}

// RateLimitByUserOrIP limits requests by user ID when available, else IP.
func RateLimitByUserOrIP(rl *RateLimiter) gin.HandlerFunc {
	return rateLimitWithKey(rl, func(c *gin.Context) string {
		if user, ok := GetUser(c); ok && user.ID != 0 {
			return fmt.Sprintf("user:%d", user.ID)
		}
		return c.ClientIP()
	})
}

func rateLimitWithKey(rl *RateLimiter, keyFn func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := keyFn(c)
		if key == "" {
			key = c.ClientIP()
		}

		if !rl.Allow(key) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
			})
			return
		}

		c.Next()
	}
}
