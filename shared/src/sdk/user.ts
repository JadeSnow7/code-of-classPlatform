import type { ApiClient } from './http';
import type { UserStats, LearningStats } from '../types';

export function createUserApi(client: ApiClient) {
  return {
    getStats: () => client.get<UserStats>('/user/stats'),
    getMyLearningStats: () => client.get<LearningStats>('/users/me/stats'),
  };
}
