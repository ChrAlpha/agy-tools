import { randomUUID } from 'node:crypto';
import type {
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeSSEEvent,
  AntigravityResponse,
  AntigravityPart,
} from '../types.js';

export function translateAntigravityToClaude(
  response: AntigravityResponse,
  model: string
): ClaudeResponse {
  const content: ClaudeContentBlock[] = [];
  let stopReason: string | null = null;

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        const block = translatePart(part);
        if (block) content.push(block);
      }
    }

    stopReason = translateFinishReason(candidate.finishReason);
  }

  return {
    id: `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

function translatePart(part: AntigravityPart): ClaudeContentBlock | null {
  if ('text' in part && !('thought' in part)) {
    return { type: 'text', text: part.text };
  }

  if ('thought' in part && part.thought && 'text' in part) {
    return { type: 'thinking', thinking: part.text };
  }

  if ('functionCall' in part) {
    return {
      type: 'tool_use',
      id: `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      name: part.functionCall.name,
      input: part.functionCall.args,
    };
  }

  return null;
}

function translateFinishReason(reason?: string): string | null {
  if (!reason) return null;

  switch (reason.toUpperCase()) {
    case 'STOP':
    case 'END_TURN':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
      return 'stop_sequence';
    case 'TOOL_USE':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

// Streaming response translator
export class StreamingTranslator {
  private model: string;
  private messageId: string;
  private contentIndex: number = 0;
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private currentBlockType: string | null = null;
  private pendingToolCall: {
    id: string;
    name: string;
    args: string;
  } | null = null;

  constructor(model: string) {
    this.model = model;
    this.messageId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  translateChunk(chunk: AntigravityResponse): ClaudeSSEEvent[] {
    const events: ClaudeSSEEvent[] = [];

    // Update usage metadata
    if (chunk.usageMetadata) {
      if (chunk.usageMetadata.promptTokenCount) {
        this.inputTokens = chunk.usageMetadata.promptTokenCount;
      }
      if (chunk.usageMetadata.candidatesTokenCount) {
        this.outputTokens = chunk.usageMetadata.candidatesTokenCount;
      }
    }

    if (!chunk.candidates || chunk.candidates.length === 0) {
      return events;
    }

    const candidate = chunk.candidates[0];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        const partEvents = this.translateStreamingPart(part);
        events.push(...partEvents);
      }
    }

    // Handle finish reason
    if (candidate.finishReason) {
      // Close any open blocks
      if (this.currentBlockType) {
        events.push({ type: 'content_block_stop', index: this.contentIndex - 1 });
        this.currentBlockType = null;
      }

      // Complete pending tool call
      if (this.pendingToolCall) {
        events.push({
          type: 'content_block_stop',
          index: this.contentIndex - 1,
        });
        this.pendingToolCall = null;
      }

      events.push({
        type: 'message_delta',
        delta: {
          stop_reason: translateFinishReason(candidate.finishReason),
          stop_sequence: null,
        } as ClaudeSSEEvent['delta'],
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: this.outputTokens,
        },
      });
    }

    return events;
  }

  private translateStreamingPart(part: AntigravityPart): ClaudeSSEEvent[] {
    const events: ClaudeSSEEvent[] = [];

    if ('text' in part && !('thought' in part)) {
      // Regular text
      if (this.currentBlockType !== 'text') {
        if (this.currentBlockType) {
          events.push({ type: 'content_block_stop', index: this.contentIndex - 1 });
        }
        events.push({
          type: 'content_block_start',
          index: this.contentIndex,
          content_block: { type: 'text', text: '' },
        });
        this.currentBlockType = 'text';
        this.contentIndex++;
      }

      events.push({
        type: 'content_block_delta',
        index: this.contentIndex - 1,
        delta: { type: 'text_delta', text: part.text } as ClaudeSSEEvent['delta'],
      });
    } else if ('thought' in part && part.thought && 'text' in part) {
      // Thinking block
      if (this.currentBlockType !== 'thinking') {
        if (this.currentBlockType) {
          events.push({ type: 'content_block_stop', index: this.contentIndex - 1 });
        }
        events.push({
          type: 'content_block_start',
          index: this.contentIndex,
          content_block: { type: 'thinking', thinking: '' },
        });
        this.currentBlockType = 'thinking';
        this.contentIndex++;
      }

      events.push({
        type: 'content_block_delta',
        index: this.contentIndex - 1,
        delta: { type: 'thinking_delta', thinking: part.text } as ClaudeSSEEvent['delta'],
      });
    } else if ('functionCall' in part) {
      // Tool use
      if (this.currentBlockType) {
        events.push({ type: 'content_block_stop', index: this.contentIndex - 1 });
        this.currentBlockType = null;
      }

      const toolId = `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

      events.push({
        type: 'content_block_start',
        index: this.contentIndex,
        content_block: {
          type: 'tool_use',
          id: toolId,
          name: part.functionCall.name,
          input: {},
        },
      });

      // Send partial JSON for tool input
      const argsJson = JSON.stringify(part.functionCall.args);
      events.push({
        type: 'content_block_delta',
        index: this.contentIndex,
        delta: {
          type: 'input_json_delta',
          partial_json: argsJson,
        } as ClaudeSSEEvent['delta'],
      });

      events.push({ type: 'content_block_stop', index: this.contentIndex });
      this.contentIndex++;
    }

    return events;
  }

  getMessageStartEvent(): ClaudeSSEEvent {
    return {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: 0,
        },
      },
    };
  }

  getMessageStopEvent(): ClaudeSSEEvent {
    return { type: 'message_stop' };
  }
}
