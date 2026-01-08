import { describe, it, expect, beforeEach } from "vitest";

// 内联 TranslatorRegistry 测试版本
describe("TranslatorRegistry", () => {
  type InputFormat = "openai-chat" | "openai-responses" | "claude" | "gemini" | "acp";

  interface RequestTranslator {
    toGemini(body: unknown, options: unknown): unknown;
  }

  interface ResponseTranslator {
    fromGemini(response: unknown, options: unknown): unknown;
    fromGeminiStream(chunk: unknown, options: unknown): string[];
    finishStream(options: unknown): string[];
  }

  interface Translator {
    format: InputFormat;
    request: RequestTranslator;
    response: ResponseTranslator;
  }

  class TestTranslatorRegistry {
    private translators = new Map<InputFormat, Translator>();

    register(translator: Translator): void {
      this.translators.set(translator.format, translator);
    }

    registerPair(
      format: InputFormat,
      request: RequestTranslator,
      response: ResponseTranslator
    ): void {
      this.translators.set(format, { format, request, response });
    }

    get(format: InputFormat): Translator | undefined {
      return this.translators.get(format);
    }

    getRequestTranslator(format: InputFormat): RequestTranslator {
      const translator = this.translators.get(format);
      if (!translator) {
        throw new Error(`No translator registered for format: ${format}`);
      }
      return translator.request;
    }

    getResponseTranslator(format: InputFormat): ResponseTranslator {
      const translator = this.translators.get(format);
      if (!translator) {
        throw new Error(`No translator registered for format: ${format}`);
      }
      return translator.response;
    }

    has(format: InputFormat): boolean {
      return this.translators.has(format);
    }

    formats(): InputFormat[] {
      return Array.from(this.translators.keys());
    }
  }

  let registry: TestTranslatorRegistry;

  // Mock translators
  const mockRequestTranslator: RequestTranslator = {
    toGemini: (body) => ({ converted: true, original: body }),
  };

  const mockResponseTranslator: ResponseTranslator = {
    fromGemini: (response) => ({ formatted: true, original: response }),
    fromGeminiStream: () => ["data: chunk1\n\n"],
    finishStream: () => ["data: [DONE]\n\n"],
  };

  const mockTranslator: Translator = {
    format: "openai-chat",
    request: mockRequestTranslator,
    response: mockResponseTranslator,
  };

  beforeEach(() => {
    registry = new TestTranslatorRegistry();
  });

  describe("register", () => {
    it("should register a translator", () => {
      registry.register(mockTranslator);

      expect(registry.has("openai-chat")).toBe(true);
    });

    it("should overwrite existing translator", () => {
      const newTranslator: Translator = {
        format: "openai-chat",
        request: { toGemini: () => ({ new: true }) },
        response: mockResponseTranslator,
      };

      registry.register(mockTranslator);
      registry.register(newTranslator);

      const result = registry.getRequestTranslator("openai-chat").toGemini({}, {});
      expect(result).toEqual({ new: true });
    });
  });

  describe("registerPair", () => {
    it("should register request and response translators as a pair", () => {
      registry.registerPair("claude", mockRequestTranslator, mockResponseTranslator);

      expect(registry.has("claude")).toBe(true);
      expect(registry.get("claude")?.format).toBe("claude");
    });
  });

  describe("get", () => {
    it("should return translator if registered", () => {
      registry.register(mockTranslator);

      const result = registry.get("openai-chat");

      expect(result).toBeDefined();
      expect(result?.format).toBe("openai-chat");
    });

    it("should return undefined if not registered", () => {
      const result = registry.get("gemini");

      expect(result).toBeUndefined();
    });
  });

  describe("getRequestTranslator", () => {
    it("should return request translator", () => {
      registry.register(mockTranslator);

      const translator = registry.getRequestTranslator("openai-chat");
      const result = translator.toGemini({ test: true }, {});

      expect(result).toEqual({ converted: true, original: { test: true } });
    });

    it("should throw error if not registered", () => {
      expect(() => registry.getRequestTranslator("gemini")).toThrow(
        "No translator registered for format: gemini"
      );
    });
  });

  describe("getResponseTranslator", () => {
    it("should return response translator", () => {
      registry.register(mockTranslator);

      const translator = registry.getResponseTranslator("openai-chat");
      const result = translator.fromGemini({ test: true }, {});

      expect(result).toEqual({ formatted: true, original: { test: true } });
    });

    it("should throw error if not registered", () => {
      expect(() => registry.getResponseTranslator("claude")).toThrow(
        "No translator registered for format: claude"
      );
    });
  });

  describe("has", () => {
    it("should return true for registered format", () => {
      registry.register(mockTranslator);

      expect(registry.has("openai-chat")).toBe(true);
    });

    it("should return false for unregistered format", () => {
      expect(registry.has("acp")).toBe(false);
    });
  });

  describe("formats", () => {
    it("should return all registered formats", () => {
      registry.register(mockTranslator);
      registry.registerPair("claude", mockRequestTranslator, mockResponseTranslator);

      const formats = registry.formats();

      expect(formats).toContain("openai-chat");
      expect(formats).toContain("claude");
      expect(formats).toHaveLength(2);
    });

    it("should return empty array when no translators registered", () => {
      const formats = registry.formats();

      expect(formats).toEqual([]);
    });
  });

  describe("stream methods", () => {
    it("should handle fromGeminiStream correctly", () => {
      registry.register(mockTranslator);

      const translator = registry.getResponseTranslator("openai-chat");
      const chunks = translator.fromGeminiStream({}, {});

      expect(chunks).toEqual(["data: chunk1\n\n"]);
    });

    it("should handle finishStream correctly", () => {
      registry.register(mockTranslator);

      const translator = registry.getResponseTranslator("openai-chat");
      const finish = translator.finishStream({});

      expect(finish).toEqual(["data: [DONE]\n\n"]);
    });
  });
});
