// Antigravity OAuth configuration (from CLIProxyAPI)
export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
export const ANTIGRAVITY_CLIENT_SECRET = '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';
export const ANTIGRAVITY_CALLBACK_PORT = 51121;
export const ANTIGRAVITY_REDIRECT_URI = `http://localhost:${ANTIGRAVITY_CALLBACK_PORT}/oauth-callback`;

export const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

// API endpoints
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const ANTIGRAVITY_API_BASE = 'https://cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_PROJECT_ENDPOINT = '/v1internal:loadCodeAssist';

// Model mappings: Claude model -> Antigravity model
export const MODEL_MAPPINGS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gemini-claude-sonnet-4-20250514',
  'claude-sonnet-4': 'gemini-claude-sonnet-4',
  'claude-opus-4-20250514': 'gemini-claude-opus-4-20250514',
  'claude-opus-4': 'gemini-claude-opus-4',
  'claude-3-5-sonnet-20241022': 'gemini-claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest': 'gemini-claude-3-5-sonnet-latest',
  'claude-3-opus-20240229': 'gemini-claude-3-opus-20240229',
  'claude-3-opus-latest': 'gemini-claude-3-opus-latest',
  'claude-3-5-haiku-20241022': 'gemini-claude-3-5-haiku-20241022',
  'claude-3-5-haiku-latest': 'gemini-claude-3-5-haiku-latest',
  // Opus 4.5 thinking model
  'claude-opus-4-5-20251101': 'gemini-claude-opus-4-5-thinking',
  'claude-opus-4.5': 'gemini-claude-opus-4-5-thinking',
};

// Default proxy configuration
export const DEFAULT_PROXY_PORT = 8765;
export const DEFAULT_PROXY_HOST = '127.0.0.1';
