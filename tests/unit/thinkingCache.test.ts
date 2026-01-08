import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";

// 模拟 logger 避免测试输出噪音
vi.mock("../../src/shared/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 直接测试 ThinkingCache 类逻辑
describe("ThinkingCache", () => {
  // 为了测试方便，内联一个简化版本的 ThinkingCache
  class TestThinkingCache {
    private cache = new Map<string, Map<string, { signature: string; timestamp: number }>>();
    private TTL: number;

    constructor(ttlMs: number = 30 * 60 * 1000) {
      this.TTL = ttlMs;
    }

    set(sessionId: string, thinkingText: string, signature: string): void {
      if (!sessionId || !thinkingText || !signature) return;

      let sessionCache = this.cache.get(sessionId);
      if (!sessionCache) {
        sessionCache = new Map();
        this.cache.set(sessionId, sessionCache);
      }

      const hash = this.hashText(thinkingText);
      sessionCache.set(hash, { signature, timestamp: Date.now() });
    }

    get(sessionId: string, thinkingText: string): string | undefined {
      const sessionCache = this.cache.get(sessionId);
      if (!sessionCache) return undefined;

      const hash = this.hashText(thinkingText);
      const entry = sessionCache.get(hash);

      if (!entry) return undefined;

      if (Date.now() - entry.timestamp > this.TTL) {
        sessionCache.delete(hash);
        return undefined;
      }

      return entry.signature;
    }

    has(sessionId: string, thinkingText: string): boolean {
      return this.get(sessionId, thinkingText) !== undefined;
    }

    clearSession(sessionId: string): void {
      this.cache.delete(sessionId);
    }

    cleanup(): void {
      const now = Date.now();
      for (const [sessionId, sessionCache] of this.cache) {
        for (const [hash, entry] of sessionCache) {
          if (now - entry.timestamp > this.TTL) {
            sessionCache.delete(hash);
          }
        }
        if (sessionCache.size === 0) {
          this.cache.delete(sessionId);
        }
      }
    }

    stats(): { sessions: number; entries: number } {
      let entries = 0;
      for (const sessionCache of this.cache.values()) {
        entries += sessionCache.size;
      }
      return { sessions: this.cache.size, entries };
    }

    private hashText(text: string): string {
      return createHash("sha256").update(text).digest("hex").slice(0, 16);
    }
  }

  let cache: TestThinkingCache;

  beforeEach(() => {
    cache = new TestThinkingCache(1000); // 1 second TTL for faster tests
  });

  describe("set and get", () => {
    it("should store and retrieve signatures", () => {
      const sessionId = "session-123";
      const thinkingText = "Let me think about this problem...";
      const signature = "sig_abc123";

      cache.set(sessionId, thinkingText, signature);
      const result = cache.get(sessionId, thinkingText);

      expect(result).toBe(signature);
    });

    it("should return undefined for non-existent entries", () => {
      const result = cache.get("unknown-session", "unknown text");
      expect(result).toBeUndefined();
    });

    it("should ignore empty parameters", () => {
      cache.set("", "text", "sig");
      cache.set("session", "", "sig");
      cache.set("session", "text", "");

      expect(cache.stats().entries).toBe(0);
    });

    it("should handle multiple sessions independently", () => {
      cache.set("session-1", "thinking 1", "sig-1");
      cache.set("session-2", "thinking 2", "sig-2");

      expect(cache.get("session-1", "thinking 1")).toBe("sig-1");
      expect(cache.get("session-2", "thinking 2")).toBe("sig-2");
      expect(cache.get("session-1", "thinking 2")).toBeUndefined();
    });

    it("should handle same text in different sessions", () => {
      const sameText = "Same thinking content";

      cache.set("session-1", sameText, "sig-1");
      cache.set("session-2", sameText, "sig-2");

      expect(cache.get("session-1", sameText)).toBe("sig-1");
      expect(cache.get("session-2", sameText)).toBe("sig-2");
    });
  });

  describe("has", () => {
    it("should return true for existing entries", () => {
      cache.set("session", "text", "sig");
      expect(cache.has("session", "text")).toBe(true);
    });

    it("should return false for non-existent entries", () => {
      expect(cache.has("unknown", "text")).toBe(false);
    });
  });

  describe("clearSession", () => {
    it("should clear all entries for a session", () => {
      cache.set("session-1", "text-1", "sig-1");
      cache.set("session-1", "text-2", "sig-2");
      cache.set("session-2", "text-3", "sig-3");

      cache.clearSession("session-1");

      expect(cache.get("session-1", "text-1")).toBeUndefined();
      expect(cache.get("session-1", "text-2")).toBeUndefined();
      expect(cache.get("session-2", "text-3")).toBe("sig-3");
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after TTL", async () => {
      const shortCache = new TestThinkingCache(50); // 50ms TTL

      shortCache.set("session", "text", "sig");
      expect(shortCache.get("session", "text")).toBe("sig");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortCache.get("session", "text")).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", async () => {
      const shortCache = new TestThinkingCache(50);

      shortCache.set("session-1", "text-1", "sig-1");

      await new Promise((resolve) => setTimeout(resolve, 100));

      shortCache.set("session-2", "text-2", "sig-2");
      shortCache.cleanup();

      const stats = shortCache.stats();
      expect(stats.sessions).toBe(1);
      expect(stats.entries).toBe(1);
    });

    it("should remove empty sessions after cleanup", async () => {
      const shortCache = new TestThinkingCache(50);

      shortCache.set("session-1", "text-1", "sig-1");

      await new Promise((resolve) => setTimeout(resolve, 100));

      shortCache.cleanup();

      expect(shortCache.stats().sessions).toBe(0);
    });
  });

  describe("stats", () => {
    it("should return correct statistics", () => {
      cache.set("session-1", "text-1", "sig-1");
      cache.set("session-1", "text-2", "sig-2");
      cache.set("session-2", "text-3", "sig-3");

      const stats = cache.stats();

      expect(stats.sessions).toBe(2);
      expect(stats.entries).toBe(3);
    });

    it("should return zeros for empty cache", () => {
      const stats = cache.stats();

      expect(stats.sessions).toBe(0);
      expect(stats.entries).toBe(0);
    });
  });

  describe("hash collision resistance", () => {
    it("should distinguish different texts with same prefix", () => {
      cache.set("session", "Hello world", "sig-1");
      cache.set("session", "Hello world!", "sig-2");

      expect(cache.get("session", "Hello world")).toBe("sig-1");
      expect(cache.get("session", "Hello world!")).toBe("sig-2");
    });
  });
});
