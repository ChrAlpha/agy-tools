import { describe, it, expect } from "vitest";

// 测试 Claude Messages Translator 的核心逻辑
describe("Claude Messages Translation", () => {
  describe("Request Translation", () => {
    // Claude SSE 事件格式
    interface ClaudeContentPart {
      type: "text" | "thinking" | "tool_use" | "tool_result" | "image";
      text?: string;
      thinking?: string;
      signature?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
      source?: { type: string; media_type?: string; data?: string };
    }

    interface GeminiPart {
      text?: string;
      thought?: boolean;
      thoughtSignature?: string;
      functionCall?: { name: string; args: unknown; id?: string };
      functionResponse?: { name: string; response: unknown; id?: string };
      inlineData?: { mimeType: string; data: string };
    }

    function convertClaudeContentPart(
      part: ClaudeContentPart,
      isAssistant: boolean
    ): GeminiPart | null {
      switch (part.type) {
        case "text":
          return { text: part.text || "" };

        case "thinking":
          if (!isAssistant) return null;
          if (!part.signature) return null;
          return {
            thought: true,
            text: part.thinking || "",
            thoughtSignature: part.signature,
          };

        case "tool_use":
          if (!isAssistant) return null;
          return {
            functionCall: {
              name: part.name || "",
              args: part.input || {},
              id: part.id,
            },
          };

        case "tool_result":
          let responseContent: unknown;
          if (typeof part.content === "string") {
            try {
              responseContent = JSON.parse(part.content);
            } catch {
              responseContent = { result: part.content };
            }
          } else {
            responseContent = { result: part.content };
          }
          return {
            functionResponse: {
              name: "tool",
              response: responseContent,
              id: part.tool_use_id,
            },
          };

        case "image":
          if (part.source?.type === "base64" && part.source.data) {
            return {
              inlineData: {
                mimeType: part.source.media_type || "image/png",
                data: part.source.data,
              },
            };
          }
          return null;

        default:
          return null;
      }
    }

    it("should convert text content", () => {
      const part: ClaudeContentPart = { type: "text", text: "Hello!" };

      const result = convertClaudeContentPart(part, false);

      expect(result?.text).toBe("Hello!");
    });

    it("should convert thinking block with signature", () => {
      const part: ClaudeContentPart = {
        type: "thinking",
        thinking: "Let me consider...",
        signature: "sig_abc123",
      };

      const result = convertClaudeContentPart(part, true);

      expect(result?.thought).toBe(true);
      expect(result?.text).toBe("Let me consider...");
      expect(result?.thoughtSignature).toBe("sig_abc123");
    });

    it("should skip thinking block without signature", () => {
      const part: ClaudeContentPart = {
        type: "thinking",
        thinking: "Let me consider...",
      };

      const result = convertClaudeContentPart(part, true);

      expect(result).toBeNull();
    });

    it("should skip thinking block in user message", () => {
      const part: ClaudeContentPart = {
        type: "thinking",
        thinking: "Thinking...",
        signature: "sig_123",
      };

      const result = convertClaudeContentPart(part, false);

      expect(result).toBeNull();
    });

    it("should convert tool_use", () => {
      const part: ClaudeContentPart = {
        type: "tool_use",
        id: "tool_123",
        name: "search",
        input: { query: "test" },
      };

      const result = convertClaudeContentPart(part, true);

      expect(result?.functionCall?.name).toBe("search");
      expect(result?.functionCall?.args).toEqual({ query: "test" });
      expect(result?.functionCall?.id).toBe("tool_123");
    });

    it("should skip tool_use in user message", () => {
      const part: ClaudeContentPart = {
        type: "tool_use",
        id: "tool_123",
        name: "search",
        input: {},
      };

      const result = convertClaudeContentPart(part, false);

      expect(result).toBeNull();
    });

    it("should convert tool_result with JSON content", () => {
      const part: ClaudeContentPart = {
        type: "tool_result",
        tool_use_id: "tool_123",
        content: '{"data": "result"}',
      };

      const result = convertClaudeContentPart(part, false);

      expect(result?.functionResponse?.response).toEqual({ data: "result" });
      expect(result?.functionResponse?.id).toBe("tool_123");
    });

    it("should convert tool_result with non-JSON content", () => {
      const part: ClaudeContentPart = {
        type: "tool_result",
        tool_use_id: "tool_123",
        content: "Plain text result",
      };

      const result = convertClaudeContentPart(part, false);

      expect(result?.functionResponse?.response).toEqual({ result: "Plain text result" });
    });

    it("should convert image with base64 data", () => {
      const part: ClaudeContentPart = {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "base64data...",
        },
      };

      const result = convertClaudeContentPart(part, false);

      expect(result?.inlineData?.mimeType).toBe("image/jpeg");
      expect(result?.inlineData?.data).toBe("base64data...");
    });

    it("should skip image without base64 source", () => {
      const part: ClaudeContentPart = {
        type: "image",
        source: { type: "url" },
      };

      const result = convertClaudeContentPart(part, false);

      expect(result).toBeNull();
    });
  });

  describe("Response Translation", () => {
    type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";

    function mapStopReason(
      reason: string | null | undefined,
      hasToolUse: boolean
    ): StopReason {
      if (hasToolUse) return "tool_use";

      switch (reason) {
        case "MAX_TOKENS":
          return "max_tokens";
        case "STOP":
        case "FINISH_REASON_UNSPECIFIED":
        default:
          return "end_turn";
      }
    }

    it("should return tool_use when has tool calls", () => {
      expect(mapStopReason("STOP", true)).toBe("tool_use");
      expect(mapStopReason("MAX_TOKENS", true)).toBe("tool_use");
    });

    it("should map MAX_TOKENS correctly", () => {
      expect(mapStopReason("MAX_TOKENS", false)).toBe("max_tokens");
    });

    it("should map STOP to end_turn", () => {
      expect(mapStopReason("STOP", false)).toBe("end_turn");
    });

    it("should default to end_turn for unknown reasons", () => {
      expect(mapStopReason("UNKNOWN", false)).toBe("end_turn");
      expect(mapStopReason(null, false)).toBe("end_turn");
      expect(mapStopReason(undefined, false)).toBe("end_turn");
    });
  });

  describe("SSE Event Formatting", () => {
    function formatClaudeSSE(event: string, data: unknown): string {
      return `data: event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    }

    it("should format SSE events correctly", () => {
      const result = formatClaudeSSE("message_start", { type: "message_start" });

      expect(result).toBe('data: event: message_start\ndata: {"type":"message_start"}\n\n');
    });

    it("should handle complex data objects", () => {
      const data = {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      };

      const result = formatClaudeSSE("content_block_delta", data);

      expect(result).toContain('"type":"content_block_delta"');
      expect(result).toContain('"text":"Hello"');
    });
  });
});
