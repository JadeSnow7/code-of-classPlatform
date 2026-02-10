import { createApi } from '@classplatform/shared';
import { API_BASE_URL, API_PREFIX, NETWORK_TIMEOUT_MS } from './config';
import type {
  Announcement,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSummary,
  AuthSession,
  Chapter,
  ChapterStats,
  ChatMessage,
  Course,
  CourseOverviewStats,
  Question,
  QuestionWithAnswer,
  Quiz,
  QuizAttempt,
  QuizWithAttempt,
  Resource,
  UserStats,
  WritingFeedback,
  WritingSubmission,
  WritingType,
} from './types';
import type {
  CreateAnnouncementRequest,
  CreateAssignmentRequest,
  CreateQuizRequest,
  CreateResourceRequest,
  SubmitQuizRequest,
} from '@classplatform/shared';

const baseUrl = `${API_BASE_URL}${API_PREFIX}`;
const baseConfig = {
  baseUrl,
  timeoutMs: NETWORK_TIMEOUT_MS,
};

const baseApi = createApi(baseConfig);

const authedApi = (token: string, tokenType: string) =>
  createApi({
    ...baseConfig,
    getAccessToken: () => token,
    getTokenType: () => tokenType,
  });

export type {
  CreateAnnouncementRequest,
  CreateAssignmentRequest,
  CreateQuizRequest,
  CreateResourceRequest,
};

// ============ Auth API ============

export async function login(username: string, password: string): Promise<AuthSession> {
  const data = await baseApi.auth.login(username, password);
  return {
    token: data.access_token,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in,
    user: {
      id: data.user_id,
      username: data.username,
      role: data.role,
    },
  };
}

export async function wecomLogin(code: string): Promise<AuthSession> {
  const data = await baseApi.auth.wecomLogin(code);
  return {
    token: data.access_token,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in,
    user: {
      id: data.user_id,
      username: data.username,
      role: data.role,
    },
  };
}

export async function getWecomOAuthURL(redirectURI: string, state?: string): Promise<string> {
  const data = await baseApi.client.get<{ url: string }>('/auth/wecom/oauth-url', {
    query: {
      redirect_uri: redirectURI,
      state,
    },
  });
  return data.url;
}

// ============ AI Chat API ============

export async function chat(
  token: string,
  tokenType: string,
  messages: ChatMessage[],
  mode: string,
  signal?: AbortSignal
): Promise<string> {
  const api = authedApi(token, tokenType);
  const data = await api.ai.chat(
    {
      mode,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    },
    signal
  );
  return data.reply;
}

// ============ Course API ============

export async function getCourses(token: string, tokenType: string): Promise<Course[]> {
  return authedApi(token, tokenType).course.list();
}

export async function getCourseDetail(token: string, tokenType: string, courseId: number): Promise<Course> {
  return authedApi(token, tokenType).course.get(courseId);
}

export async function createCourse(
  token: string,
  tokenType: string,
  data: { name: string; code?: string; semester?: string }
): Promise<Course> {
  return authedApi(token, tokenType).course.create(data);
}

export async function getCourseOverviewStats(
  token: string,
  tokenType: string,
  courseId: number
): Promise<CourseOverviewStats> {
  const api = authedApi(token, tokenType);
  const [announcement, attendance, assignment] = await Promise.all([
    api.announcement.getSummary(courseId),
    api.attendance.getSummary(courseId),
    api.assignment.getCourseAssignmentStats(courseId),
  ]);

  return {
    unreadAnnouncements: announcement.unread_count,
    pendingAssignments: assignment.pending_count,
    attendanceRate: Math.round(attendance.attendance_rate * 100),
  };
}

// ============ Chapter API ============

export async function getChapters(token: string, tokenType: string, courseId: number): Promise<Chapter[]> {
  return authedApi(token, tokenType).chapter.list(courseId);
}

export async function getChapterContent(token: string, tokenType: string, chapterId: number): Promise<Chapter> {
  return authedApi(token, tokenType).chapter.get(chapterId);
}

export async function getChapterStats(token: string, tokenType: string, chapterId: number): Promise<ChapterStats> {
  return authedApi(token, tokenType).chapter.getMyStats(chapterId);
}

export async function recordStudyTime(
  token: string,
  tokenType: string,
  chapterId: number,
  durationSeconds: number
): Promise<void> {
  await authedApi(token, tokenType).chapter.recordStudyTime(chapterId, durationSeconds);
}

// ============ Announcement API ============

export async function getAnnouncements(
  token: string,
  tokenType: string,
  courseId: number
): Promise<Announcement[]> {
  return authedApi(token, tokenType).announcement.list(courseId);
}

export async function createAnnouncement(
  token: string,
  tokenType: string,
  courseId: number,
  data: CreateAnnouncementRequest
): Promise<Announcement> {
  return authedApi(token, tokenType).announcement.create(courseId, data);
}

export async function deleteAnnouncement(
  token: string,
  tokenType: string,
  announcementId: number
): Promise<void> {
  await authedApi(token, tokenType).announcement.delete(announcementId);
}

export async function markAnnouncementRead(
  token: string,
  tokenType: string,
  announcementId: number
): Promise<void> {
  await authedApi(token, tokenType).announcement.markRead(announcementId);
}

// ============ Attendance API ============

export async function getAttendanceSummary(
  token: string,
  tokenType: string,
  courseId: number
): Promise<AttendanceSummary> {
  return authedApi(token, tokenType).attendance.getSummary(courseId);
}

export async function getAttendanceSessions(
  token: string,
  tokenType: string,
  courseId: number
): Promise<AttendanceSession[]> {
  return authedApi(token, tokenType).attendance.listSessions(courseId);
}

export async function startAttendanceSession(
  token: string,
  tokenType: string,
  courseId: number,
  timeoutMinutes: number
): Promise<void> {
  await authedApi(token, tokenType).attendance.startSession(courseId, timeoutMinutes);
}

export async function endAttendanceSession(
  token: string,
  tokenType: string,
  sessionId: number
): Promise<void> {
  await authedApi(token, tokenType).attendance.endSession(sessionId);
}

export async function checkinAttendance(
  token: string,
  tokenType: string,
  sessionId: number,
  code: string
): Promise<void> {
  await authedApi(token, tokenType).attendance.checkin(sessionId, code);
}

export async function getAttendanceRecords(
  token: string,
  tokenType: string,
  sessionId: number
): Promise<AttendanceRecord[]> {
  return authedApi(token, tokenType).attendance.getRecords(sessionId);
}

// ============ Assignment API ============

export async function getAssignments(token: string, tokenType: string, courseId: number): Promise<Assignment[]> {
  return authedApi(token, tokenType).assignment.listByCourse(courseId);
}

export async function getAssignmentDetail(
  token: string,
  tokenType: string,
  assignmentId: number
): Promise<Assignment> {
  return authedApi(token, tokenType).assignment.get(assignmentId);
}

export async function getAssignmentSubmissions(
  token: string,
  tokenType: string,
  assignmentId: number
): Promise<AssignmentSubmission[]> {
  return authedApi(token, tokenType).assignment.listSubmissions(assignmentId);
}

export async function submitAssignment(
  token: string,
  tokenType: string,
  assignmentId: number,
  payload: { content?: string; file_url?: string }
): Promise<AssignmentSubmission> {
  return authedApi(token, tokenType).assignment.submit(assignmentId, payload);
}

export async function gradeAssignmentSubmission(
  token: string,
  tokenType: string,
  submissionId: number,
  payload: { grade: number; feedback?: string }
): Promise<AssignmentSubmission> {
  return authedApi(token, tokenType).assignment.grade(submissionId, payload);
}

export async function createAssignment(
  token: string,
  tokenType: string,
  data: CreateAssignmentRequest
): Promise<Assignment> {
  return authedApi(token, tokenType).assignment.create(data);
}

// ============ Quiz API ============

export async function getQuizzes(
  token: string,
  tokenType: string,
  courseId: number
): Promise<Array<Quiz | QuizWithAttempt>> {
  return authedApi(token, tokenType).quiz.listByCourse(courseId) as Promise<Array<Quiz | QuizWithAttempt>>;
}

export async function getQuizDetail(token: string, tokenType: string, quizId: number): Promise<{
  quiz: Quiz;
  questions: Array<Question | QuestionWithAnswer>;
}> {
  return authedApi(token, tokenType).quiz.get(quizId);
}

export async function startQuiz(
  token: string,
  tokenType: string,
  quizId: number
): Promise<{ attempt: QuizAttempt; questions: Array<Question | QuestionWithAnswer>; resumed: boolean }> {
  return authedApi(token, tokenType).quiz.start(quizId);
}

export async function submitQuiz(
  token: string,
  tokenType: string,
  quizId: number,
  answers: SubmitQuizRequest['answers']
): Promise<{ score: number; max_score: number; attempt: QuizAttempt }> {
  return authedApi(token, tokenType).quiz.submit(quizId, answers);
}

export async function publishQuiz(token: string, tokenType: string, quizId: number): Promise<Quiz> {
  return authedApi(token, tokenType).quiz.publish(quizId);
}

export async function unpublishQuiz(token: string, tokenType: string, quizId: number): Promise<Quiz> {
  return authedApi(token, tokenType).quiz.unpublish(quizId);
}

export async function createQuiz(token: string, tokenType: string, data: CreateQuizRequest): Promise<Quiz> {
  return authedApi(token, tokenType).quiz.create(data);
}

// ============ Resource API ============

export async function getResources(
  token: string,
  tokenType: string,
  courseId: number,
  type?: string
): Promise<Resource[]> {
  return authedApi(token, tokenType).resource.listByCourse(courseId, type);
}

export async function createResource(
  token: string,
  tokenType: string,
  data: CreateResourceRequest
): Promise<Resource> {
  return authedApi(token, tokenType).resource.create(data);
}

// ============ Writing API ============

export async function submitWriting(
  token: string,
  tokenType: string,
  courseId: number,
  data: {
    title: string;
    content: string;
    writing_type: WritingType;
    assignment_id?: number;
  }
): Promise<WritingSubmission> {
  return authedApi(token, tokenType).student.submitWriting(courseId, data);
}

export async function getWritingSubmissions(
  token: string,
  tokenType: string,
  courseId: number,
  writingType?: WritingType
): Promise<WritingSubmission[]> {
  return authedApi(token, tokenType).student.getWritingSubmissions(courseId, writingType);
}

export async function getWritingSubmission(
  token: string,
  tokenType: string,
  submissionId: number
): Promise<WritingSubmission> {
  return authedApi(token, tokenType).student.getWritingSubmission(submissionId);
}

export function parseWritingFeedback(submission: WritingSubmission): WritingFeedback | null {
  if (submission.feedback) {
    return submission.feedback;
  }

  if (!submission.feedback_json) {
    return null;
  }

  try {
    return JSON.parse(submission.feedback_json) as WritingFeedback;
  } catch {
    return null;
  }
}

export const WRITING_TYPE_LABELS: Record<WritingType, string> = {
  literature_review: '文献综述',
  course_paper: '课程论文',
  thesis: '学位论文',
  abstract: '摘要',
};

// ============ User Stats API ============

export async function getUserStats(token: string, tokenType: string): Promise<UserStats> {
  return authedApi(token, tokenType).user.getMyLearningStats();
}
