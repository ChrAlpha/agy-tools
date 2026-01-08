import { describe, it, expect } from "vitest";

// 测试 OpenAI Responses Translator 的核心逻辑
describe("OpenAI Responses Translation", () => {
  describe("Reasoning Effort to Thinking Budget", () => {
    function reasoningEffortToThinkingBudget(effort?: string): number | undefined {
      switch (effort) {
        case "low":
          return 1024;
        case "medium":
          return 10240;
        case "high":
          return 32768;
        default:
          return undefined;
      }
    }

    it("should map low effort to 1024", () => {
      expect(reasoningEffortToThinkingBudget("low")).toBe(1024);
    });

    it("should map medium effort to 10240", () => {
      expect(reasoningEffortToThinkingBudget("medium")).toBe(10240);
    });

    it("should map high effort to 32768", () => {
      expect(reasoningEffortToThinkingBudget("high")).toBe(32768);
    });

    it("should return undefined for unknown effort", () => {
      expect(reasoningEffortToThinkingBudget("unknown")).toBeUndefined();
      expect(reasoningEffortToThinkingBudget(undefined)).toBeUndefined();
    });
  });

  describe("Input Conversion", () => {
    interface OpenAIResponsesInput {
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: string; text?: string }>;
    }

    interface GeminiContent {
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }

    function convertInput(input: OpenAIResponsesInput): GeminiContent | null {
      const role = input.role === "assistant" ? "model" : "user";
      const parts: Array<{ text: string }> = [];

      if (typeof input.content === "string") {
        parts.push({ text: input.content });
      } else if (Array.isArray(input.content)) {
        for (const part of input.content) {
          if ((part.type === "input_text" || part.type === "output_text") && part.text) {
            parts.push({ text: part.text });
          }
        }
      }

      if (parts.length === 0) return null;
      return { role, parts };
    }

    it("should convert simple string content", () => {
      const input: OpenAIResponsesInput = {
        role: "user",
        content: "Hello!",
      };

      const result = convertInput(input);

      expect(result?.role).toBe("user");
      expect(result?.parts[0].text).toBe("Hello!");
    });

    it("should convert assistant to model role", () => {
      const input: OpenAIResponsesInput = {
        role: "assistant",
        content: "Response",
      };

      const result = convertInput(input);

      expect(result?.role).toBe("model");
    });

    it("should convert array content with input_text", () => {
      const input: OpenAIResponsesInput = {
        role: "user",
        content: [
          { type: "input_text", text: "Part 1" },
          { type: "input_text", text: "Part 2" },
        ],
      };

      const result = convertInput(input);

      expect(result?.parts).toHaveLength(2);
      expect(result?.parts[0].text).toBe("Part 1");
    });

    it("should convert output_text in array content", () => {
      const input: OpenAIResponsesInput = {
        role: "assistant",
        content: [{ type: "output_text", text: "Output" }],
      };

      const result = convertInput(input);

      expect(result?.parts[0].text).toBe("Output");
    });

    it("should return null for empty content", () => {
      const input: OpenAIResponsesInput = {
        role: "user",
        content: [],
      };

      const result = convertInput(input);

      expect(result).toBeNull();
    });

    it("should skip unknown content types", () => {
      const input: OpenAIResponsesInput = {
        role: "user",
        content: [
          { type: "unknown", text: "Ignored" },
          { type: "input_text", text: "Included" },
        ],
      };

      const result = convertInput(input);

      expect(result?.parts).toHaveLength(1);
      expect(result?.parts[0].text).toBe("Included");
    });
  });

  describe("Response Output Types", () => {
    interface OpenAIResponsesOutputItem {
      type: "reasoning" | "message" | "function_call";
      id: string;
      role?: "assistant";
      content?: Array<{ type: string; text: string }>;
      summary?: Array<{ type: string; text: string }>;
      call_id?: string;
      name?: string;
      arguments?: string;
    }

    interface GeminiPart {
      text?: string;
      thought?: boolean;
      functionCall?: { name: string; args: unknown; id?: string };
    }

    function buildOutput(parts: GeminiPart[]): OpenAIResponsesOutputItem[] {
      const output: OpenAIResponsesOutputItem[] = [];
      const reasoningParts: string[] = [];
      const textParts: string[] = [];
      let itemId = 0;

      for (const part of parts) {
        if (part.thought && part.text) {
          reasoningParts.push(part.text);
          continue;
        }

        if (part.text && !part.thought) {
          textParts.push(part.text);
          continue;
        }

        if (part.functionCall) {
          itemId++;
          output.push({
            type: "function_call",
            id: `fc_${itemId}`,
            call_id: part.functionCall.id || `call_${itemId}`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          });
        }
      }

      // Add reasoning first
      if (reasoningParts.length > 0) {
        itemId++;
        output.unshift({
          type: "reasoning",
          id: `reasoning_${itemId}`,
          summary: [{ type: "summary_text", text: reasoningParts.join("") }],
        });
      }

      // Add message if has text
      if (textParts.length > 0) {
        itemId++;
        output.push({
          type: "message",
          id: `msg_${itemId}`,
          role: "assistant",
          content: [{ type: "output_text", text: textParts.join("") }],
        });
      }

      return output;
    }

    it("should build message output from text parts", () => {
      const parts: GeminiPart[] = [{ text: "Hello!" }];

      const result = buildOutput(parts);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("message");
      expect(result[0].content?.[0].text).toBe("Hello!");
    });

    it("should build reasoning output from thought parts", () => {
      const parts: GeminiPart[] = [
        { text: "Thinking...", thought: true },
        { text: "Answer" },
      ];

      const result = buildOutput(parts);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("reasoning");
      expect(result[0].summary?.[0].text).toBe("Thinking...");
      expect(result[1].type).toBe("message");
    });

    it("should build function_call output", () => {
      const parts: GeminiPart[] = [
        {
          functionCall: {
            name: "search",
            args: { query: "test" },
            id: "call_123",
          },
        },
      ];

      const result = buildOutput(parts);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("function_call");
      expect(result[0].name).toBe("search");
      expect(result[0].arguments).toBe('{"query":"test"}');
      expect(result[0].call_id).toBe("call_123");
    });

    it("should combine multiple parts correctly", () => {
      const parts: GeminiPart[] = [
        { text: "Let me think...", thought: true },
        { text: "The answer is 42." },
        {
          functionCall: {
            name: "verify",
            args: { value: 42 },
          },
        },
      ];

      const result = buildOutput(parts);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("reasoning");
      expect(result[1].type).toBe("function_call");
      expect(result[2].type).toBe("message");
    });

    it("should handle empty parts", () => {
      const result = buildOutput([]);

      expect(result).toHaveLength(0);
    });
  });

  describe("SSE Event Formatting", () => {
    function formatSSE(data: unknown): string {
      return `data: ${JSON.stringify(data)}\n\n`;
    }

    it("should format SSE correctly", () => {
      const result = formatSSE({ type: "response.completed" });

      expect(result).toBe('data: {"type":"response.completed"}\n\n');
    });

    it("should handle nested objects", () => {
      const data = {
        type: "response.output_text.delta",
        item_id: "msg_0",
        delta: "Hello",
      };

      const result = formatSSE(data);

      expect(result).toContain('"delta":"Hello"');
    });
  });
});
