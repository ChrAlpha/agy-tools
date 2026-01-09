import type { AntigravityEndpoint, ModelInfo, ModelFamily } from "./types.js";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================
// Config Paths
// ============================================

export const CONFIG_DIR = join(homedir(), ".agy-tools");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const ACCOUNTS_FILE = join(CONFIG_DIR, "accounts.json");

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

// Antigravity API endpoints (in fallback order) - based on CLIProxyAPI
export const ANTIGRAVITY_ENDPOINTS: Record<AntigravityEndpoint, string> = {
  daily: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  dailyNonSandbox: "https://daily-cloudcode-pa.googleapis.com",
  autopush: "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  prod: "https://cloudcode-pa.googleapis.com",
};

// Priority order based on CLIProxyAPI's antigravityBaseURLFallbackOrder
export const ENDPOINT_PRIORITY: AntigravityEndpoint[] = [
  "daily",           // sandbox daily first
  "dailyNonSandbox", // non-sandbox daily second
  "prod",            // production last
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
// Default Configs
// ============================================

export const DEFAULT_SERVER_CONFIG = {
  host: "127.0.0.1",
  port: 38080,
};

export const DEFAULT_PROXY_CONFIG = {
  endpoints: ENDPOINT_PRIORITY,
  defaultEndpoint: "daily" as AntigravityEndpoint,
  switchPreviewModel: true, // Enable auto fallback to preview models
};

// ============================================
// Model Fallback Mappings
// ============================================

/**
 * Model fallback mapping for quota exhausted scenarios.
 * When a stable model runs out of quota, try preview models as fallback.
 */
export const MODEL_FALLBACK_MAP: Record<string, string[]> = {
  // Gemini 2.5 series
  "gemini-2.5-pro": ["gemini-2.5-pro-preview"],
  "gemini-2.5-flash": ["gemini-2.5-flash-preview"],
  "gemini-2.5-flash-lite": ["gemini-2.5-flash-lite-preview"],

  // Gemini 3 series
  "gemini-3-pro": ["gemini-3-pro-preview"],
  "gemini-3-pro-low": ["gemini-3-pro-preview"],
  "gemini-3-pro-high": ["gemini-3-pro-preview"],
  "gemini-3-flash": ["gemini-3-flash-preview"],
};

/**
 * Get fallback models for a given model when quota is exceeded.
 * Returns empty array if no fallback is available.
 */
export function getModelFallbacks(model: string): string[] {
  return MODEL_FALLBACK_MAP[model] || [];
}

// ============================================
// Model Definitions
// ============================================

// Thinking budget tiers
// Note: Different models have different max budgets:
// - Gemini 2.5 models: max 24576
// - Claude models: max 200000
// We use conservative defaults that work across models
export const THINKING_BUDGETS = {
  low: 8192,
  medium: 16384,
  high: 24576, // Capped at Gemini max to ensure compatibility
} as const;

// Model-specific thinking budget limits
export const MODEL_THINKING_LIMITS: Record<string, { min: number; max: number }> = {
  // Gemini 2.5 models
  "gemini-2.5-flash": { min: 0, max: 24576 },
  "gemini-2.5-flash-lite": { min: 0, max: 24576 },
  "gemini-2.5-flash-thinking": { min: 0, max: 24576 },
  "gemini-2.5-pro": { min: 0, max: 24576 },
  // Gemini 3 models
  "gemini-3-pro": { min: 128, max: 32768 },
  "gemini-3-pro-preview": { min: 128, max: 32768 },
  "gemini-3-pro-low": { min: 128, max: 32768 },
  "gemini-3-pro-high": { min: 128, max: 32768 },
  "gemini-3-flash": { min: 128, max: 32768 },
  // Claude models (via Antigravity)
  "claude-sonnet-4-5-thinking": { min: 1024, max: 200000 },
  "claude-opus-4-5-thinking": { min: 1024, max: 200000 },
};

/**
 * Normalize thinking budget to model's supported range
 */
export function normalizeThinkingBudget(modelId: string, budget: number): number {
  const baseModel = getBaseModelId(modelId);
  const limits = MODEL_THINKING_LIMITS[baseModel];

  if (!limits) {
    // Unknown model, return as-is but cap at safe default
    return Math.min(budget, 24576);
  }

  if (budget < limits.min) {
    return limits.min;
  }
  if (budget > limits.max) {
    return limits.max;
  }
  return budget;
}

export type ThinkingLevel = "none" | "low" | "medium" | "high";

export const MODELS: ModelInfo[] = [
  // =========================================================================
  // Claude Sonnet 4.5 Models (Thinking variants)
  // =========================================================================
  {
    id: "claude-sonnet-4-5-thinking",
    name: "Claude Sonnet 4.5 (Thinking)",
    baseModel: "claude-sonnet-4-5-thinking",
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
    baseModel: "claude-sonnet-4-5-thinking",
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
    baseModel: "claude-sonnet-4-5-thinking",
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
    baseModel: "claude-sonnet-4-5",
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
    baseModel: "claude-opus-4-5-thinking",
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
    baseModel: "claude-opus-4-5-thinking",
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
    baseModel: "claude-opus-4-5-thinking",
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
    baseModel: "gemini-2.5-pro",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    baseModel: "gemini-2.5-flash",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    baseModel: "gemini-2.5-flash-lite",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-flash-thinking",
    name: "Gemini 2.5 Flash Thinking",
    baseModel: "gemini-2.5-flash-thinking",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  // =========================================================================
  // Gemini 3.0 Models
  // =========================================================================
  // {
  //   id: "gemini-3-pro",
  //   name: "Gemini 3 Pro",
  //   baseModel: "gemini-3-pro",
  //   family: "gemini",
  //   contextWindow: 1048576,
  //   maxOutputTokens: 65536,
  //   supportsStreaming: true,
  // },
  {
    id: "gemini-3-pro-low",
    name: "Gemini 3 Pro Low",
    baseModel: "gemini-3-pro-low",
    family: "gemini",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  {
    id: 'gemini-3-pro-high',
    name: 'Gemini 3 Pro High',
    baseModel: 'gemini-3-pro-high',
    family: 'gemini',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
  },
  // {
  //   id: 'gemini-3-pro-preview',
  //   name: 'Gemini 3 Pro Preview',
  //   baseModel: 'gemini-3-pro-preview',
  //   family: 'gemini',
  //   contextWindow: 1048576,
  //   maxOutputTokens: 65536,
  //   supportsStreaming: true,
  // },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    baseModel: "gemini-3-flash",
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
 * Get the base model ID for API calls
 */
export function getBaseModelId(modelId: string): string {
  const resolved = resolveModelId(modelId);
  const model = getModelInfo(resolved);
  return model?.baseModel ?? resolved;
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
      baseModel: model.baseModel,
      thinkingLevel: level,
      thinkingBudget: model.thinkingBudget,
    };
  }

  // No thinking support
  return {
    baseModel: model?.baseModel ?? resolved,
    thinkingLevel: "none",
  };
}
