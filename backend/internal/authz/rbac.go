package authz

const (
	PermCourseRead  = "course:read"
	PermCourseWrite = "course:write"

	PermAIUse  = "ai:use"
	PermSimUse = "sim:use"

	// New permissions for Assignments
	PermAssignmentRead   = "assignment:read"
	PermAssignmentWrite  = "assignment:write"
	PermAssignmentSubmit = "assignment:submit"
	PermAssignmentGrade  = "assignment:grade"

	// New permissions for Resources
	PermResourceRead  = "resource:read"
	PermResourceWrite = "resource:write"

	// Code execution permission
	PermCodeRun = "code:run"

	// Quiz permissions
	PermQuizRead  = "quiz:read"  // view quizzes and questions (students see no answers)
	PermQuizWrite = "quiz:write" // create/edit quizzes (teacher only)
	PermQuizTake  = "quiz:take"  // start/submit quiz attempts (student)
	PermQuizGrade = "quiz:grade" // view all attempts and stats (teacher)

	// User stats permission
	PermUserStats = "user:stats"

	// User management permission (admin only)
	PermUserManage = "user:manage"

	// Announcement permissions
	PermAnnouncementRead  = "announcement:read"
	PermAnnouncementWrite = "announcement:write"

	// Attendance permissions
	PermAttendanceRead    = "attendance:read"
	PermAttendanceWrite   = "attendance:write"   // start/end session (teacher)
	PermAttendanceCheckin = "attendance:checkin" // student check-in
	PermAttendanceExport  = "attendance:export"  // export records (teacher)
)

var rolePermissions = map[string]map[string]bool{
	"admin": {
		"*": true,
	},
	"teacher": {
		PermCourseRead:      true,
		PermCourseWrite:     true,
		PermAIUse:           true,
		PermSimUse:          true,
		PermAssignmentRead:  true,
		PermAssignmentWrite: true,
		PermAssignmentGrade: true,
		PermResourceRead:    true,
		PermResourceWrite:   true,
		PermCodeRun:         true,
		PermQuizRead:        true,
		PermQuizWrite:       true,
		PermQuizGrade:       true,
		PermUserStats:       true,
		// Announcement & Attendance
		PermAnnouncementRead:  true,
		PermAnnouncementWrite: true,
		PermAttendanceRead:    true,
		PermAttendanceWrite:   true,
		PermAttendanceExport:  true,
	},
	"assistant": {
		PermCourseRead:      true,
		PermAIUse:           true,
		PermSimUse:          true,
		PermAssignmentRead:  true,
		PermAssignmentGrade: true,
		PermResourceRead:    true,
		PermCodeRun:         true,
		PermQuizRead:        true,
		PermQuizGrade:       true,
		PermUserStats:       true,
	},
	"student": {
		PermCourseRead:       true,
		PermAIUse:            true,
		PermSimUse:           true,
		PermAssignmentRead:   true,
		PermAssignmentSubmit: true,
		PermResourceRead:     true,
		PermCodeRun:          true,
		PermQuizRead:         true,
		PermQuizTake:         true,
		PermUserStats:        true,
		// Announcement & Attendance
		PermAnnouncementRead:  true,
		PermAttendanceRead:    true,
		PermAttendanceCheckin: true,
	},
}

func HasPermission(role string, perm string) bool {
	perms, ok := rolePermissions[role]
	if !ok {
		return false
	}
	if perms["*"] {
		return true
	}
	return perms[perm]
}

// GetPermissions returns all permissions for a given role
func GetPermissions(role string) []string {
	perms, ok := rolePermissions[role]
	if !ok {
		return []string{}
	}

	// Admin has all permissions
	if perms["*"] {
		return []string{
			PermCourseRead, PermCourseWrite,
			PermAIUse, PermSimUse,
			PermAssignmentRead, PermAssignmentWrite, PermAssignmentSubmit, PermAssignmentGrade,
			PermResourceRead, PermResourceWrite,
			PermCodeRun,
			PermQuizRead, PermQuizWrite, PermQuizTake, PermQuizGrade,
			PermUserStats, PermUserManage,
			PermAnnouncementRead, PermAnnouncementWrite,
			PermAttendanceRead, PermAttendanceWrite, PermAttendanceCheckin, PermAttendanceExport,
		}
	}

	result := make([]string, 0, len(perms))
	for perm := range perms {
		result = append(result, perm)
	}
	return result
}
