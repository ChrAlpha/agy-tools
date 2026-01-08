import type { AntigravityEndpoint, ModelInfo, ModelFamily } from "./types.js";

// ============================================
// OAuth Constants
// ============================================

export const GOOGLE_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const GOOGLE_CLIENT_SECRET = "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";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const OAUTH_REDIRECT_PORT = 8976;
export const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_REDIRECT_PORT}/callback`;

// ============================================
// Antigravity Endpoints
// ============================================

// Antigravity API endpoints (in fallback order) - based on antigravity-auth
export const ANTIGRAVITY_ENDPOINTS: Record<AntigravityEndpoint, string> = {
  daily: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  autopush: "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  prod: "https://cloudcode-pa.googleapis.com",
};

export const ENDPOINT_PRIORITY: AntigravityEndpoint[] = [
  "daily",
  "autopush",
  "prod",
];

// Headers for Antigravity API
export const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

// Alternative headers for Gemini CLI style
export const GEMINI_CLI_HEADERS = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
};

// ============================================
// Model Definitions
// ============================================

// Thinking budget tiers (based on antigravity-auth)
export const THINKING_BUDGETS = {
  low: 8192,
  medium: 16384,
  high: 32768,
} as const;

export type ThinkingLevel = "none" | "low" | "medium" | "high";

export const MODELS: ModelInfo[] = [
  // =========================================================================
  // Claude Sonnet 4.5 Models (Thinking variants)
  // =========================================================================
  {
    id: "claude-sonnet-4-5-thinking",
    name: "Claude Sonnet 4.5 (Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.medium,
  },
  {
    id: "claude-sonnet-4-5-thinking-high",
    name: "Claude Sonnet 4.5 (High Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.high,
  },
  {
    id: "claude-sonnet-4-5-thinking-low",
    name: "Claude Sonnet 4.5 (Low Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.low,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
  },
  // =========================================================================
  // Claude Opus 4.5 Models (Thinking variants)
  // =========================================================================
  {
    id: "claude-opus-4-5-thinking",
    name: "Claude Opus 4.5 (Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.medium,
  },
  {
    id: "claude-opus-4-5-thinking-high",
    name: "Claude Opus 4.5 (High Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.high,
  },
  {
    id: "claude-opus-4-5-thinking-low",
    name: "Claude Opus 4.5 (Low Thinking)",
    family: "claude",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsThinking: true,
    thinkingBudget: THINKING_BUDGETS.low,
  },
  // =========================================================================
  // Gemini 2.5 Models
  // =========================================================================
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  // =========================================================================
  // Gemini 3.0 Models
  // =========================================================================
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
];

// Model ID mappings for OpenAI compatibility
export const MODEL_ALIASES: Record<string, string> = {
  // Claude Sonnet 4.5 aliases
  "claude-sonnet-4.5-thinking": "claude-sonnet-4-5-thinking",
  "claude-sonnet-4.5-thinking-high": "claude-sonnet-4-5-thinking-high",
  "claude-sonnet-4.5-thinking-low": "claude-sonnet-4-5-thinking-low",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  // Claude Opus 4.5 aliases
  "claude-opus-4.5-thinking": "claude-opus-4-5-thinking",
  "claude-opus-4.5-thinking-high": "claude-opus-4-5-thinking-high",
  "claude-opus-4.5-thinking-low": "claude-opus-4-5-thinking-low",
  // Gemini aliases
  "gemini-2.5-pro-latest": "gemini-2.5-pro",
  "gemini-2.5-flash-latest": "gemini-2.5-flash",
  "gemini-3-pro-latest": "gemini-3-pro",
  "gemini-3-flash-latest": "gemini-3-flash",
};

export function resolveModelId(modelId: string): string {
  return MODEL_ALIASES[modelId] ?? modelId;
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  const resolved = resolveModelId(modelId);
  return MODELS.find((m) => m.id === resolved);
}

/**
 * Check if model is a Claude thinking model
 */
export function isClaudeThinkingModel(modelId: string): boolean {
  const model = getModelInfo(modelId);
  if (model) {
    return model.family === "claude" && model.supportsThinking === true;
  }
  // Fallback detection from model ID
  const lower = modelId.toLowerCase();
  return lower.includes("claude") && lower.includes("thinking");
}

/**
 * Get model family (claude or gemini)
 */
export function getModelFamily(modelId: string): ModelFamily {
  const model = getModelInfo(modelId);
  if (model) {
    return model.family;
  }
  // Detect from model ID
  if (modelId.toLowerCase().includes("claude")) {
    return "claude";
  }
  return "gemini";
}

/**
 * Parse model ID with tier suffix and extract base model + thinking info
 */
export function parseModelWithTier(modelId: string): {
  baseModel: string;
  thinkingLevel: ThinkingLevel;
  thinkingBudget?: number;
} {
  const resolved = resolveModelId(modelId);
  const model = getModelInfo(resolved);

  if (model?.supportsThinking && model.thinkingBudget) {
    // Determine level from budget
    let level: ThinkingLevel = "medium";
    if (model.thinkingBudget === THINKING_BUDGETS.high) level = "high";
    else if (model.thinkingBudget === THINKING_BUDGETS.low) level = "low";

    return {
      baseModel: resolved,
      thinkingLevel: level,
      thinkingBudget: model.thinkingBudget,
    };
  }

  // No thinking support
  return {
    baseModel: resolved,
    thinkingLevel: "none",
  };
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SERVER_CONFIG = {
  host: "127.0.0.1",
  port: 8080,
};

export const DEFAULT_PROXY_CONFIG = {
  endpoints: ENDPOINT_PRIORITY,
  defaultEndpoint: "daily" as AntigravityEndpoint,
};

// ============================================
// File Paths
// ============================================

import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".agy-tools");
export const ACCOUNTS_FILE = join(CONFIG_DIR, "accounts.json");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
