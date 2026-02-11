package errors

// Error codes for client/server error classification
const (
	// Client errors (4xx)
	CodeInvalidInput = "INVALID_INPUT"
	CodeUnauthorized = "UNAUTHORIZED"
	CodeAccessDenied = "ACCESS_DENIED"
	CodeNotFound     = "NOT_FOUND"
	CodeConflict     = "CONFLICT"

	// Server errors (5xx)
	CodeInternalError      = "INTERNAL_ERROR"
	CodeServiceUnavailable = "SERVICE_UNAVAILABLE"

	// Business logic errors
	CodeInvalidCredentials = "INVALID_CREDENTIALS"
	CodeSessionExpired     = "SESSION_EXPIRED"
	CodeQuotaExceeded      = "QUOTA_EXCEEDED"
)
