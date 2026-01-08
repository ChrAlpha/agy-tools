import type { GeminiRequest, GeminiResponse } from "../../shared/index.js";
import {
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_ENDPOINTS,
  loadConfig,
} from "../../shared/index.js";
import { logger } from "../../shared/logger.js";
import { wrapInAntigravityEnvelope } from "../utils/requestTransform.js";
import { unwrapAntigravityResponse } from "../utils/responseTransform.js";

export class AntigravityClient {
  private getBaseUrl(): string {
    const config = loadConfig();
    const endpoint = config.proxy.defaultEndpoint;
    return ANTIGRAVITY_ENDPOINTS[endpoint] || ANTIGRAVITY_ENDPOINTS.daily;
  }

  async generateContent(
    model: string,
    request: GeminiRequest,
    token: string,
    projectId: string
  ): Promise<GeminiResponse> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1internal:generateContent`;
    const wrappedRequest = wrapInAntigravityEnvelope(model, request, projectId);

    logger.debug(`Calling Antigravity API: ${url} (model: ${model})`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...ANTIGRAVITY_HEADERS,
      },
      body: JSON.stringify(wrappedRequest),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Antigravity API Error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return unwrapAntigravityResponse(data);
  }

  async *streamGenerateContent(
    model: string,
    request: GeminiRequest,
    token: string,
    projectId: string
  ): AsyncGenerator<GeminiResponse> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;
    const wrappedRequest = wrapInAntigravityEnvelope(model, request, projectId);

    logger.debug(`Calling Antigravity Stream API: ${url} (model: ${model})`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...ANTIGRAVITY_HEADERS,
      },
      body: JSON.stringify(wrappedRequest),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Antigravity Stream Error: ${response.status} ${text}`
      );
    }

    // Use a robust SSE parser logic
    // @ts-ignore - node-fetch/undici types mismatch with standard ReadableStream sometimes
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data.trim() === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            yield unwrapAntigravityResponse(parsed);
          } catch (e) {
            // ignore parse error for keep-alive or malformed
          }
        }
      }
    }
  }
}