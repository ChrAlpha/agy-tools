import type { GeminiRequest, GeminiResponse } from "../../shared/index.js";
import {
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_ENDPOINTS,
  ENDPOINT_PRIORITY,
  loadConfig,
} from "../../shared/index.js";
import { logger } from "../../shared/logger.js";
import { wrapInAntigravityEnvelope } from "../utils/requestTransform.js";
import { unwrapAntigravityResponse } from "../utils/responseTransform.js";

export class AntigravityClient {
  /**
   * Get fallback endpoint order based on config.
   * When rate limited on one endpoint, we try the next one.
   * Based on CLIProxyAPI's antigravityBaseURLFallbackOrder.
   */
  private getEndpointFallbackOrder(): string[] {
    const config = loadConfig();
    const preferred = config.proxy.defaultEndpoint;

    // Reorder so preferred endpoint is first
    const order = [...ENDPOINT_PRIORITY];
    const idx = order.indexOf(preferred);
    if (idx > 0) {
      order.splice(idx, 1);
      order.unshift(preferred);
    }

    return order.map((key) => ANTIGRAVITY_ENDPOINTS[key]);
  }

  async generateContent(
    model: string,
    request: GeminiRequest,
    token: string,
    projectId: string
  ): Promise<GeminiResponse> {
    const endpoints = this.getEndpointFallbackOrder();
    const wrappedRequest = wrapInAntigravityEnvelope(model, request, projectId);
    let lastError: Error | null = null;

    for (let i = 0; i < endpoints.length; i++) {
      const baseUrl = endpoints[i];
      const url = `${baseUrl}/v1internal:generateContent`;

      logger.debug(`Calling Antigravity API: ${url} (model: ${model})`);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...ANTIGRAVITY_HEADERS,
          },
          body: JSON.stringify(wrappedRequest),
        });

        // Handle rate limiting (429) and server errors (500, 503, 529)
        // These errors should trigger endpoint fallback
        if (
          (response.status === 429 ||
            response.status === 500 ||
            response.status === 503 ||
            response.status === 529) &&
          i + 1 < endpoints.length
        ) {
          const errorText = await response.text().catch(() => "");
          logger.debug(
            `Error ${response.status} on ${baseUrl}, retrying with fallback: ${endpoints[i + 1]}`
          );
          logger.debug(`Error details: ${errorText.slice(0, 200)}`);
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Antigravity API Error: ${response.status} ${text}`);
        }

        const data = await response.json();
        return unwrapAntigravityResponse(data);
      } catch (err) {
        lastError = err as Error;
        // On network error, try next endpoint
        if (i + 1 < endpoints.length) {
          logger.debug(
            `Request error on ${baseUrl}, retrying with fallback: ${endpoints[i + 1]}`
          );
          continue;
        }
      }
    }

    throw lastError || new Error("All Antigravity endpoints failed");
  }

  async *streamGenerateContent(
    model: string,
    request: GeminiRequest,
    token: string,
    projectId: string
  ): AsyncGenerator<GeminiResponse> {
    const endpoints = this.getEndpointFallbackOrder();
    const wrappedRequest = wrapInAntigravityEnvelope(model, request, projectId);
    let lastError: Error | null = null;

    for (let i = 0; i < endpoints.length; i++) {
      const baseUrl = endpoints[i];
      const url = `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;

      logger.debug(`Calling Antigravity Stream API: ${url} (model: ${model})`);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...ANTIGRAVITY_HEADERS,
          },
          body: JSON.stringify(wrappedRequest),
        });

        // Handle rate limiting (429) and server errors (500, 503, 529)
        // These errors should trigger endpoint fallback
        if (
          (response.status === 429 ||
            response.status === 500 ||
            response.status === 503 ||
            response.status === 529) &&
          i + 1 < endpoints.length
        ) {
          const errorText = await response.text().catch(() => "");
          logger.debug(
            `Error ${response.status} on ${baseUrl}, retrying with fallback: ${endpoints[i + 1]}`
          );
          logger.debug(`Error details: ${errorText.slice(0, 200)}`);
          continue;
        }

        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => "");
          throw new Error(`Antigravity Stream Error: ${response.status} ${text}`);
        }

        // Successfully connected, yield responses
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
        return; // Successfully completed
      } catch (err) {
        lastError = err as Error;
        // On network error, try next endpoint
        if (i + 1 < endpoints.length) {
          logger.debug(
            `Request error on ${baseUrl}, retrying with fallback: ${endpoints[i + 1]}`
          );
          continue;
        }
      }
    }

    throw lastError || new Error("All Antigravity endpoints failed");
  }
}