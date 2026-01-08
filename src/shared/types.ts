// ============================================
// Account & Token Types
// ============================================

export interface AntigravityTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
}

export interface Account {
  id: string;
  email: string;
  name?: string;
  projectId?: string;
  tokens: AntigravityTokens;
  createdAt: number;
  lastUsedAt?: number;
  disabled?: boolean;
  disabledReason?: string;
  rateLimitedUntil?: number;
}

export interface AccountIndex {
  accounts: Account[];
  currentAccountId?: string;
}

// ============================================
// Config Types
// ============================================

export interface ServerConfig {
  host: string;
  port: number;
  apiKey?: string; // Optional API key for authentication
}

export interface ProxyConfig {
  endpoints: AntigravityEndpoint[];
  defaultEndpoint: AntigravityEndpoint;
}

export type AntigravityEndpoint = "daily" | "autopush" | "prod";

export interface AppConfig {
  server: ServerConfig;
  proxy: ProxyConfig;
}

// ============================================
// Model Types
// ============================================

export type ModelFamily = "claude" | "gemini";

export interface ModelInfo {
  id: string;
  name: string;
  baseModel: string; // The actual model ID used for API calls
  family: ModelFamily;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  thinkingBudget?: number;
}

// ============================================
// OpenAI Compatible Types
// ============================================

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: "none" | "auto" | { type: "function"; function: { name: string } };
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface OpenAIChatChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIStreamDelta {
  role?: "assistant";
  content?: string;
  tool_calls?: Partial<OpenAIToolCall>[];
}

export interface OpenAIStreamChoice {
  index: number;
  delta: OpenAIStreamDelta;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
}

// ============================================
// Antigravity/Gemini Types
// ============================================

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: unknown;
    id?: string;
  };
}

export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE" | "VALIDATED";
  };
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  max_output_tokens?: number;
  stopSequences?: string[];
  thinkingConfig?: {
    include_thoughts?: boolean;
    includeThoughts?: boolean;
    thinking_budget?: number;
    thinkingBudget?: number;
    thinkingLevel?: string;
  };
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: Array<{ text: string }>;
    /** role: 'user' is required by Antigravity API to reduce 429 */
    role?: string;
  };
  generationConfig?: GeminiGenerationConfig;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  sessionId?: string;
}

export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
  safetyRatings?: unknown[];
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// ============================================
// Antigravity Wrapper Types
// ============================================

export interface AntigravityRequestBody {
  project: string;
  model: string;
  request: GeminiRequest;
  userAgent?: string;
  requestId?: string;
  /** requestType: 'agent' can help reduce 429 rate limiting */
  requestType?: string;
}

export interface AntigravityResponse {
  response: GeminiResponse;
}

// ============================================
// OAuth Types
// ============================================

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

export interface OAuthState {
  state: string;
  pkce: PKCEChallenge;
  createdAt: number;
}

// ============================================
// Claude (Anthropic Messages API) Types
// ============================================

export interface ClaudeContentPart {
  type: "text" | "image" | "tool_use" | "tool_result" | "thinking";
  // text
  text?: string;
  // image
  source?: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: string | ClaudeContentPart[];
  is_error?: boolean;
  // thinking
  thinking?: string;
  signature?: string;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentPart[];
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface ClaudeThinkingConfig {
  type: "enabled" | "disabled";
  budget_tokens?: number;
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: string | Array<{ type: "text"; text: string }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  thinking?: ClaudeThinkingConfig;
  metadata?: { user_id?: string };
}

export interface ClaudeResponseContent {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  signature?: string;
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ClaudeResponseContent[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}

// Claude SSE Event Types
export interface ClaudeSSEMessageStart {
  type: "message_start";
  message: Omit<ClaudeResponse, "content"> & { content: [] };
}

export interface ClaudeSSEContentBlockStart {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text" | "tool_use" | "thinking";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    thinking?: string;
  };
}

export interface ClaudeSSEContentBlockDelta {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta" | "input_json_delta" | "thinking_delta" | "signature_delta";
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
  };
}

export interface ClaudeSSEContentBlockStop {
  type: "content_block_stop";
  index: number;
}

export interface ClaudeSSEMessageDelta {
  type: "message_delta";
  delta: {
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
    stop_sequence: string | null;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeSSEMessageStop {
  type: "message_stop";
}

// ============================================
// OpenAI Responses API Types (新版 API)
// ============================================

export interface OpenAIResponsesInput {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string | OpenAIResponsesContentPart[];
}

export interface OpenAIResponsesContentPart {
  type: "input_text" | "input_image" | "input_file" | "output_text";
  text?: string;
  image_url?: string;
  file_id?: string;
}

export interface OpenAIResponsesTool {
  type: "function" | "code_interpreter" | "file_search";
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIResponsesRequest {
  model: string;
  input: string | OpenAIResponsesInput[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: OpenAIResponsesTool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; name: string };
  reasoning?: {
    effort?: "low" | "medium" | "high";
    summary?: "auto" | "concise" | "detailed";
  };
  metadata?: Record<string, string>;
}

export interface OpenAIResponsesOutputItem {
  type: "message" | "reasoning" | "function_call" | "function_call_output";
  id: string;
  // message
  role?: "assistant";
  content?: Array<{
    type: "output_text";
    text: string;
    annotations?: unknown[];
  }>;
  // reasoning
  summary?: Array<{
    type: "summary_text";
    text: string;
  }>;
  // function_call
  name?: string;
  arguments?: string;
  call_id?: string;
  // function_call_output
  output?: string;
}

export interface OpenAIResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: "completed" | "failed" | "in_progress" | "incomplete";
  output: OpenAIResponsesOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}
