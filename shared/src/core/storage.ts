export type MaybePromise<T> = T | Promise<T>;

export type StorageAdapter = {
  getItem: (key: string) => MaybePromise<string | null>;
  setItem: (key: string, value: string) => MaybePromise<void>;
  removeItem: (key: string) => MaybePromise<void>;
};

export type JsonStoreOptions<T> = {
  defaultValue?: T | null;
};

export function createJsonStore<T>(adapter: StorageAdapter, key: string, options: JsonStoreOptions<T> = {}) {
  const { defaultValue = null } = options;

  return {
    async load(): Promise<T | null> {
      try {
        const raw = await adapter.getItem(key);
        if (!raw) return defaultValue;
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue;
      }
    },
    async save(value: T): Promise<void> {
      await adapter.setItem(key, JSON.stringify(value));
    },
    async clear(): Promise<void> {
      await adapter.removeItem(key);
    },
  };
}

export function createTokenStore(adapter: StorageAdapter, key: string) {
  return {
    getToken(): string | null {
      try {
        const value = adapter.getItem(key);
        return value instanceof Promise ? null : value;
      } catch {
        return null;
      }
    },
    async getTokenAsync(): Promise<string | null> {
      try {
        return await adapter.getItem(key);
      } catch {
        return null;
      }
    },
    setToken(token: string): void {
      void adapter.setItem(key, token);
    },
    async setTokenAsync(token: string): Promise<void> {
      await adapter.setItem(key, token);
    },
    clearToken(): void {
      void adapter.removeItem(key);
    },
    async clearTokenAsync(): Promise<void> {
      await adapter.removeItem(key);
    },
  };
}
