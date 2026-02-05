import { createApi } from '@classplatform/shared';
import { API_BASE_URL, API_PREFIX, NETWORK_TIMEOUT_MS } from './config';
import type {
  AuthSession,
  ChatMessage,
  Course,
  Chapter,
  Assignment,
  Quiz,
  Resource,
  UserStats,
} from './types';
import type {
  CreateAssignmentRequest,
  CreateQuizRequest,
  CreateResourceRequest,
  SubmitAssignmentRequest,
  SubmitQuizRequest,
  WritingSubmission,
  StudentGlobalProfile,
  WritingType,
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

export type { CreateAssignmentRequest, CreateQuizRequest, CreateResourceRequest };

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
  const data = await api.ai.chat({
    mode,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: false,
  }, signal);
  return data.reply;
}

// ============ Course API ============

export async function getCourses(token: string, tokenType: string): Promise<Course[]> {
  return authedApi(token, tokenType).course.list();
}

export async function getCourseDetail(token: string, tokenType: string, courseId: number): Promise<Course> {
  return authedApi(token, tokenType).course.get(courseId);
}

// ============ Chapter API ============

export async function getChapters(token: string, tokenType: string, courseId: number): Promise<Chapter[]> {
  return authedApi(token, tokenType).chapter.list(courseId);
}

export async function getChapterContent(token: string, tokenType: string, chapterId: number): Promise<Chapter> {
  return authedApi(token, tokenType).chapter.get(chapterId);
}

export async function recordStudyTime(
  token: string,
  tokenType: string,
  chapterId: number,
  durationSeconds: number
): Promise<void> {
  await authedApi(token, tokenType).chapter.recordStudyTime(chapterId, durationSeconds);
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

export async function submitAssignment(
  token: string,
  tokenType: string,
  assignmentId: number,
  content: string
): Promise<void> {
  const payload: SubmitAssignmentRequest = { content };
  await authedApi(token, tokenType).assignment.submit(assignmentId, payload);
}

// ============ Quiz API ============

export async function getQuizzes(token: string, tokenType: string, courseId: number): Promise<Quiz[]> {
  return authedApi(token, tokenType).quiz.listByCourse(courseId) as Promise<Quiz[]>;
}

export async function getQuizDetail(token: string, tokenType: string, quizId: number): Promise<Quiz> {
  const data = await authedApi(token, tokenType).quiz.get(quizId);
  return data.quiz;
}

export async function submitQuiz(
  token: string,
  tokenType: string,
  quizId: number,
  answers: SubmitQuizRequest['answers']
): Promise<{ score: number; max_score: number }> {
  const data = await authedApi(token, tokenType).quiz.submit(quizId, answers);
  return { score: data.score, max_score: data.max_score };
}

// ============ Resource API ============

export async function getResources(token: string, tokenType: string, courseId: number): Promise<Resource[]> {
  return authedApi(token, tokenType).resource.listByCourse(courseId);
}

// ============ Create APIs (Teacher Only) ============

export async function createAssignment(
  token: string,
  tokenType: string,
  data: CreateAssignmentRequest
): Promise<Assignment> {
  return authedApi(token, tokenType).assignment.create(data);
}

export async function createQuiz(token: string, tokenType: string, data: CreateQuizRequest): Promise<Quiz> {
  return authedApi(token, tokenType).quiz.create(data);
}

export async function createResource(
  token: string,
  tokenType: string,
  data: CreateResourceRequest
): Promise<Resource> {
  return authedApi(token, tokenType).resource.create(data);
}

// ============ User Stats API ============

export async function getUserStats(token: string, tokenType: string): Promise<UserStats> {
  return authedApi(token, tokenType).user.getMyLearningStats();
}

// ============ Student Global Profile API ============

export async function getGlobalProfile(
  token: string,
  tokenType: string,
  studentId: number
): Promise<StudentGlobalProfile> {
  return authedApi(token, tokenType).student.getGlobalProfile(studentId);
}

// ============ Writing API ============

export async function submitWriting(
  token: string,
  tokenType: string,
  courseId: number,
  data: {
    title: string;
    content: string;
    writing_type: string;
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
