import type {
    Announcement as SharedAnnouncement,
    Assignment as SharedAssignment,
    AssignmentSubmission as SharedAssignmentSubmission,
    AttendanceRecord as SharedAttendanceRecord,
    AttendanceSummary as SharedAttendanceSummary,
    AuthSession as SharedAuthSession,
    Chapter as SharedChapter,
    ChapterStudentStats as SharedChapterStudentStats,
    ChatMessage as SharedChatMessage,
    Course as SharedCourse,
    LearningStats,
    Question as SharedQuestion,
    QuestionWithAnswer as SharedQuestionWithAnswer,
    Quiz as SharedQuiz,
    QuizAttempt as SharedQuizAttempt,
    QuizWithAttempt as SharedQuizWithAttempt,
    Resource as SharedResource,
    SessionListItem as SharedSessionListItem,
    WritingFeedback as SharedWritingFeedback,
    WritingSubmission as SharedWritingSubmission,
    WritingType as SharedWritingType,
} from '@classplatform/shared';

export type AuthSession = SharedAuthSession;
export type UserStats = LearningStats;
export type Course = SharedCourse;
export type Chapter = SharedChapter;
export type ChapterStats = SharedChapterStudentStats;
export type Assignment = SharedAssignment;
export type AssignmentSubmission = SharedAssignmentSubmission;
export type Quiz = SharedQuiz;
export type QuizWithAttempt = SharedQuizWithAttempt;
export type Question = SharedQuestion;
export type QuestionWithAnswer = SharedQuestionWithAnswer;
export type QuizAttempt = SharedQuizAttempt;
export type Resource = SharedResource;
export type Announcement = SharedAnnouncement;
export type AttendanceSummary = SharedAttendanceSummary;
export type AttendanceSession = SharedSessionListItem;
export type AttendanceRecord = SharedAttendanceRecord;
export type WritingSubmission = SharedWritingSubmission;
export type WritingFeedback = SharedWritingFeedback;
export type WritingType = SharedWritingType;

export type CourseOverviewStats = {
    unreadAnnouncements: number;
    pendingAssignments: number;
    attendanceRate: number;
};

export type SimulationType = 'laplace' | 'charges' | 'wire';

export type SimulationResult = {
    png_base64: string;
    metadata?: Record<string, unknown>;
};

export type ChatMessage = SharedChatMessage & {
    id: string;
    createdAt: number;
    conversationId?: string;
};

export type LearningProfile = {
    id: number;
    student_id: number;
    course_id: number;
    /** JSON-encoded Record<string, number> e.g. '{"学术语气": 3}' */
    weak_points: string;
    /** JSON-encoded string[] */
    completed_topics: string;
    total_sessions: number;
    total_study_minutes: number;
    last_session_at?: string;
    /** JSON-encoded string[] */
    recommended_topics?: string;
    created_at: string;
    updated_at: string;
};
