/**
 * Translator Registry
 *
 * 管理所有格式的转换器注册和查询
 */

import type {
  InputFormat,
  Translator,
  RequestTranslator,
  ResponseTranslator,
} from "./types.js";

class TranslatorRegistry {
  private translators = new Map<InputFormat, Translator>();

  /**
   * 注册一个完整的 Translator
   */
  register(translator: Translator): void {
    this.translators.set(translator.format, translator);
  }

  /**
   * 注册请求和响应转换器
   */
  registerPair(
    format: InputFormat,
    request: RequestTranslator,
    response: ResponseTranslator
  ): void {
    this.translators.set(format, { format, request, response });
  }

  /**
   * 获取完整的 Translator
   */
  get(format: InputFormat): Translator | undefined {
    return this.translators.get(format);
  }

  /**
   * 获取请求转换器
   * @throws 如果未注册
   */
  getRequestTranslator(format: InputFormat): RequestTranslator {
    const translator = this.translators.get(format);
    if (!translator) {
      throw new Error(`No translator registered for format: ${format}`);
    }
    return translator.request;
  }

  /**
   * 获取响应转换器
   * @throws 如果未注册
   */
  getResponseTranslator(format: InputFormat): ResponseTranslator {
    const translator = this.translators.get(format);
    if (!translator) {
      throw new Error(`No translator registered for format: ${format}`);
    }
    return translator.response;
  }

  /**
   * 检查是否已注册
   */
  has(format: InputFormat): boolean {
    return this.translators.has(format);
  }

  /**
   * 获取所有已注册的格式
   */
  formats(): InputFormat[] {
    return Array.from(this.translators.keys());
  }
}

/**
 * 全局 Translator Registry 单例
 */
export const registry = new TranslatorRegistry();

/**
 * 注册 Translator 的便捷函数
 */
export function registerTranslator(translator: Translator): void {
  registry.register(translator);
}

/**
 * 注册请求和响应转换器的便捷函数
 */
export function registerTranslatorPair(
  format: InputFormat,
  request: RequestTranslator,
  response: ResponseTranslator
): void {
  registry.registerPair(format, request, response);
}
