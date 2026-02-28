export type AIConfigMode = 'local' | 'server' | 'auto';

export type AIConfigProvider = 'openai' | 'anthropic' | 'custom' | string;

export type AIConfigProfile = {
  default_mode: AIConfigMode;
  server_url?: string | null;
  provider?: AIConfigProvider | null;
  custom_base_url?: string | null;
  api_key_masked?: string | null;
};

export type UpdateAIConfigRequest = {
  default_mode?: AIConfigMode;
  server_url?: string | null;
  provider?: AIConfigProvider | null;
  custom_base_url?: string | null;
  // Write-only. Omit to keep unchanged, empty string to clear.
  api_key?: string | null;
};
