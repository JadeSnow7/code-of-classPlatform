export type ApiError = {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
};
