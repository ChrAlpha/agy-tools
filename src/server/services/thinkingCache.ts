/**
 * Thinking Cache
 *
 * 缓存 Claude thinking block 的 signature，
 * 用于多轮对话中恢复 thinking blocks。
 *
 * Claude 要求 thinking blocks 必须有有效的 signature，
 * 否则会拒绝请求。当客户端发送历史消息时，
 * signature 可能已丢失，需要从缓存中恢复。
 */

import { createHash } from "crypto";
import { logger } from "../../shared/logger.js";

interface CacheEntry {
  signature: string;
  timestamp: number;
}

export class ThinkingCache {
  // sessionId -> (thinkingTextHash -> signature)
  private cache = new Map<string, Map<string, CacheEntry>>();
  private readonly TTL: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = 30 * 60 * 1000) {
    // 默认 30 分钟
    this.TTL = ttlMs;
  }

  /**
   * 启动定期清理
   */
  startCleanup(intervalMs: number = 5 * 60 * 1000): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => this.cleanup(), intervalMs);
    // 不阻止进程退出
    this.cleanupTimer.unref();
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 缓存 thinking block 的 signature
   */
  set(sessionId: string, thinkingText: string, signature: string): void {
    if (!sessionId || !thinkingText || !signature) {
      return;
    }

    let sessionCache = this.cache.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.cache.set(sessionId, sessionCache);
    }

    const hash = this.hashText(thinkingText);
    sessionCache.set(hash, {
      signature,
      timestamp: Date.now(),
    });

    logger.debug(`Cached thinking signature for session ${sessionId.slice(0, 8)}...`);
  }

  /**
   * 获取缓存的 signature
   */
  get(sessionId: string, thinkingText: string): string | undefined {
    const sessionCache = this.cache.get(sessionId);
    if (!sessionCache) {
      return undefined;
    }

    const hash = this.hashText(thinkingText);
    const entry = sessionCache.get(hash);

    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.TTL) {
      sessionCache.delete(hash);
      return undefined;
    }

    logger.debug(`Retrieved thinking signature from cache for session ${sessionId.slice(0, 8)}...`);
    return entry.signature;
  }

  /**
   * 检查是否存在缓存
   */
  has(sessionId: string, thinkingText: string): boolean {
    return this.get(sessionId, thinkingText) !== undefined;
  }

  /**
   * 清除特定会话的缓存
   */
  clearSession(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /**
   * 清理所有过期条目
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedEntries = 0;

    for (const [sessionId, sessionCache] of this.cache) {
      for (const [hash, entry] of sessionCache) {
        if (now - entry.timestamp > this.TTL) {
          sessionCache.delete(hash);
          cleanedEntries++;
        }
      }
      if (sessionCache.size === 0) {
        this.cache.delete(sessionId);
        cleanedSessions++;
      }
    }

    if (cleanedEntries > 0 || cleanedSessions > 0) {
      logger.debug(`Thinking cache cleanup: removed ${cleanedEntries} entries, ${cleanedSessions} sessions`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  stats(): { sessions: number; entries: number } {
    let entries = 0;
    for (const sessionCache of this.cache.values()) {
      entries += sessionCache.size;
    }
    return {
      sessions: this.cache.size,
      entries,
    };
  }

  /**
   * 计算文本的 hash
   */
  private hashText(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  /**
   * 检查签名是否有效（非空且不是占位符）
   * Based on CLIProxyAPI's HasValidSignature
   */
  static isValidSignature(signature: string | undefined | null): boolean {
    if (!signature) return false;
    // 过滤占位符签名
    const placeholder = [
      "placeholder",
      "PLACEHOLDER",
      "placeholder-signature",
      "skip_thought_signature_validator",
    ];
    return !placeholder.includes(signature);
  }

  /**
   * 获取用于跳过验证的特殊签名值
   * 当没有有效签名时使用此值绕过 Antigravity API 验证
   */
  static get SKIP_SIGNATURE(): string {
    return "skip_thought_signature_validator";
  }
}

/**
 * 全局 Thinking Cache 单例
 */
export const thinkingCache = new ThinkingCache();

// 启动定期清理
thinkingCache.startCleanup();
