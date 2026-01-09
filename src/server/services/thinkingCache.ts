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

const MAX_ENTRIES_PER_SESSION = 100;
const MIN_VALID_SIGNATURE_LENGTH = 50;

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

    // Validate signature length (防止缓存无效签名)
    if (signature.length < MIN_VALID_SIGNATURE_LENGTH) {
      logger.debug(`Signature too short (${signature.length} < ${MIN_VALID_SIGNATURE_LENGTH}), skipping cache`);
      return;
    }

    let sessionCache = this.cache.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.cache.set(sessionId, sessionCache);
    }

    // LRU eviction: 当达到容量限制时，移除最旧的 25%
    if (sessionCache.size >= MAX_ENTRIES_PER_SESSION) {
      const now = Date.now();

      // 首先尝试移除过期条目
      for (const [hash, entry] of sessionCache) {
        if (now - entry.timestamp > this.TTL) {
          sessionCache.delete(hash);
        }
      }

      // 如果仍然超出容量，按时间戳排序并移除最旧的 25%
      if (sessionCache.size >= MAX_ENTRIES_PER_SESSION) {
        const entries = Array.from(sessionCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        const toRemove = Math.max(1, Math.floor(entries.length / 4));
        for (let i = 0; i < toRemove; i++) {
          sessionCache.delete(entries[i][0]);
        }

        logger.debug(`LRU eviction: removed ${toRemove} oldest entries from session ${sessionId.slice(0, 8)}...`);
      }
    }

    const hash = this.hashText(thinkingText);
    sessionCache.set(hash, {
      signature,
      timestamp: Date.now(),
    });

    logger.debug(`Cached thinking signature for session ${sessionId.slice(0, 8)}... (cache size: ${sessionCache.size})`);
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
