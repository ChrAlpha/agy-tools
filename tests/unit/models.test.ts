import { describe, it, expect } from "vitest";

// 测试模型相关的常量和函数
describe("Models and Constants", () => {
  // 内联测试用的模型定义
  const THINKING_BUDGETS = {
    low: 8192,
    medium: 16384,
    high: 32768,
  } as const;

  type ThinkingLevel = "none" | "low" | "medium" | "high";
  type ModelFamily = "claude" | "gemini";

  interface ModelInfo {
    id: string;
    name: string;
    family: ModelFamily;
    contextWindow: number;
    maxOutputTokens: number;
    supportsStreaming: boolean;
    supportsThinking?: boolean;
    thinkingBudget?: number;
  }

  const MODELS: ModelInfo[] = [
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
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      family: "claude",
      contextWindow: 200000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      family: "gemini",
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      supportsStreaming: true,
    },
  ];

  const MODEL_ALIASES: Record<string, string> = {
    "claude-sonnet-4.5-thinking": "claude-sonnet-4-5-thinking",
    "claude-sonnet-4.5": "claude-sonnet-4-5",
    "gemini-2.5-pro-latest": "gemini-2.5-pro",
  };

  function resolveModelId(modelId: string): string {
    return MODEL_ALIASES[modelId] ?? modelId;
  }

  function getModelInfo(modelId: string): ModelInfo | undefined {
    const resolved = resolveModelId(modelId);
    return MODELS.find((m) => m.id === resolved);
  }

  function isClaudeThinkingModel(modelId: string): boolean {
    const model = getModelInfo(modelId);
    if (model) {
      return model.family === "claude" && model.supportsThinking === true;
    }
    const lower = modelId.toLowerCase();
    return lower.includes("claude") && lower.includes("thinking");
  }

  function getModelFamily(modelId: string): ModelFamily {
    const model = getModelInfo(modelId);
    if (model) {
      return model.family;
    }
    if (modelId.toLowerCase().includes("claude")) {
      return "claude";
    }
    return "gemini";
  }

  function parseModelWithTier(modelId: string): {
    baseModel: string;
    thinkingLevel: ThinkingLevel;
    thinkingBudget?: number;
  } {
    const resolved = resolveModelId(modelId);
    const model = getModelInfo(resolved);

    if (model?.supportsThinking && model.thinkingBudget) {
      let level: ThinkingLevel = "medium";
      if (model.thinkingBudget === THINKING_BUDGETS.high) level = "high";
      else if (model.thinkingBudget === THINKING_BUDGETS.low) level = "low";

      return {
        baseModel: resolved,
        thinkingLevel: level,
        thinkingBudget: model.thinkingBudget,
      };
    }

    return {
      baseModel: resolved,
      thinkingLevel: "none",
    };
  }

  describe("resolveModelId", () => {
    it("should resolve aliased model IDs", () => {
      expect(resolveModelId("claude-sonnet-4.5-thinking")).toBe("claude-sonnet-4-5-thinking");
      expect(resolveModelId("gemini-2.5-pro-latest")).toBe("gemini-2.5-pro");
    });

    it("should return original ID if no alias exists", () => {
      expect(resolveModelId("claude-sonnet-4-5-thinking")).toBe("claude-sonnet-4-5-thinking");
      expect(resolveModelId("unknown-model")).toBe("unknown-model");
    });
  });

  describe("getModelInfo", () => {
    it("should return model info for valid model", () => {
      const info = getModelInfo("claude-sonnet-4-5-thinking");

      expect(info).toBeDefined();
      expect(info?.id).toBe("claude-sonnet-4-5-thinking");
      expect(info?.family).toBe("claude");
      expect(info?.supportsThinking).toBe(true);
    });

    it("should resolve aliases and return model info", () => {
      const info = getModelInfo("claude-sonnet-4.5-thinking");

      expect(info).toBeDefined();
      expect(info?.id).toBe("claude-sonnet-4-5-thinking");
    });

    it("should return undefined for unknown model", () => {
      const info = getModelInfo("unknown-model");

      expect(info).toBeUndefined();
    });
  });

  describe("isClaudeThinkingModel", () => {
    it("should return true for Claude thinking models", () => {
      expect(isClaudeThinkingModel("claude-sonnet-4-5-thinking")).toBe(true);
      expect(isClaudeThinkingModel("claude-sonnet-4-5-thinking-high")).toBe(true);
    });

    it("should return false for non-thinking Claude models", () => {
      expect(isClaudeThinkingModel("claude-sonnet-4-5")).toBe(false);
    });

    it("should return false for Gemini models", () => {
      expect(isClaudeThinkingModel("gemini-2.5-pro")).toBe(false);
    });

    it("should detect thinking from model ID for unknown models", () => {
      expect(isClaudeThinkingModel("claude-unknown-thinking")).toBe(true);
      expect(isClaudeThinkingModel("claude-unknown")).toBe(false);
    });
  });

  describe("getModelFamily", () => {
    it("should return claude for Claude models", () => {
      expect(getModelFamily("claude-sonnet-4-5-thinking")).toBe("claude");
      expect(getModelFamily("claude-sonnet-4-5")).toBe("claude");
    });

    it("should return gemini for Gemini models", () => {
      expect(getModelFamily("gemini-2.5-pro")).toBe("gemini");
    });

    it("should detect family from model ID for unknown models", () => {
      expect(getModelFamily("claude-unknown")).toBe("claude");
      expect(getModelFamily("gemini-unknown")).toBe("gemini");
      expect(getModelFamily("unknown")).toBe("gemini"); // default
    });
  });

  describe("parseModelWithTier", () => {
    it("should parse thinking model with correct level", () => {
      const result = parseModelWithTier("claude-sonnet-4-5-thinking");

      expect(result.baseModel).toBe("claude-sonnet-4-5-thinking");
      expect(result.thinkingLevel).toBe("medium");
      expect(result.thinkingBudget).toBe(THINKING_BUDGETS.medium);
    });

    it("should parse high thinking model", () => {
      const result = parseModelWithTier("claude-sonnet-4-5-thinking-high");

      expect(result.thinkingLevel).toBe("high");
      expect(result.thinkingBudget).toBe(THINKING_BUDGETS.high);
    });

    it("should return none for non-thinking models", () => {
      const result = parseModelWithTier("claude-sonnet-4-5");

      expect(result.thinkingLevel).toBe("none");
      expect(result.thinkingBudget).toBeUndefined();
    });

    it("should handle aliases", () => {
      const result = parseModelWithTier("claude-sonnet-4.5-thinking");

      expect(result.baseModel).toBe("claude-sonnet-4-5-thinking");
      expect(result.thinkingLevel).toBe("medium");
    });
  });

  describe("THINKING_BUDGETS", () => {
    it("should have correct budget values", () => {
      expect(THINKING_BUDGETS.low).toBe(8192);
      expect(THINKING_BUDGETS.medium).toBe(16384);
      expect(THINKING_BUDGETS.high).toBe(32768);
    });
  });
});
