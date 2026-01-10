export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiryTimestamp: number;
  tokenType: string;
  email: string;
  projectId?: string;
}

export interface Account {
  id: string;
  email: string;
  name?: string;
  token: TokenData;
  disabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProxyConfig {
  port: number;
  host: string;
  apiKey?: string;
}

export interface AntigravityRequest {
  contents: AntigravityContent[];
  systemInstruction?: {
    parts: { text: string }[];
  };
  tools?: AntigravityTool[];
  generationConfig?: AntigravityGenerationConfig;
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
  };
}

export interface AntigravityContent {
  role: 'user' | 'model';
  parts: AntigravityPart[];
}

export type AntigravityPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }
  | { inlineData: { mimeType: string; data: string } }
  | { thought: boolean; text: string };

export interface AntigravityTool {
  functionDeclarations?: AntigravityFunctionDeclaration[];
}

export interface AntigravityFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface AntigravityGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface AntigravityResponse {
  candidates?: AntigravityCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
}

export interface AntigravityCandidate {
  content?: AntigravityContent;
  finishReason?: string;
  index?: number;
}

// Claude API types
export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  system?: string | ClaudeSystemContent[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: { type: string; name?: string };
  thinking?: { type: string; budget_tokens?: number };
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | ClaudeContentBlock[] }
  | { type: 'image'; source: { type: string; media_type: string; data: string } };

export interface ClaudeSystemContent {
  type: 'text';
  text: string;
  cache_control?: { type: string };
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// SSE Event types for streaming
export interface ClaudeSSEEvent {
  type: string;
  message?: Partial<ClaudeResponse>;
  index?: number;
  content_block?: Partial<ClaudeContentBlock>;
  delta?: Record<string, unknown>;
  usage?: ClaudeResponse['usage'];
}
