import type {
    AuthSession as SharedAuthSession,
    Course,
    Chapter,
    Assignment,
    Quiz,
    Resource,
    ChatMessage as SharedChatMessage,
    LearningStats,
} from '@classplatform/shared';

export type AuthSession = SharedAuthSession;
export type UserStats = LearningStats;
export type Course = Course;
export type Chapter = Chapter;
export type Assignment = Assignment;
export type Quiz = Quiz;
export type Resource = Resource;

export type ChatMessage = SharedChatMessage & {
    id: string;
    createdAt: number;
};
