/**
 * Translator Shared Utilities
 *
 * 共享的工具函数，用于请求/响应处理
 */

import crypto from "crypto";
import type { GeminiRequest, GeminiResponse, AntigravityRequestBody } from "../../shared/index.js";
import { getModelFamily } from "../../shared/index.js";

/**
 * Generate a random project ID for Antigravity requests.
 * Format: {adjective}-{noun}-{random5chars}
 * Example: "useful-wave-a3f7e"
 */
export function generateProjectId(): string {
    const adjectives = ["useful", "bright", "swift", "calm", "bold"];
    const nouns = ["fuze", "wave", "spark", "flow", "core"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomPart = crypto.randomUUID().toLowerCase().slice(0, 5);
    return `${adj}-${noun}-${randomPart}`;
}

/**
 * Wrap Gemini request in Antigravity envelope
 * This should be called by AntigravityClient before sending the request
 */
export function wrapInAntigravityEnvelope(
    model: string,
    geminiRequest: GeminiRequest,
    projectId: string
): AntigravityRequestBody {
    const isClaude = getModelFamily(model) === "claude";

    // Ensure systemInstruction has role set (required by Antigravity API)
    if (geminiRequest.systemInstruction) {
        geminiRequest.systemInstruction.role = "user";
    }

    // Always delete safetySettings
    // safetySettings is a top-level property of geminiRequest
    delete (geminiRequest as any).safetySettings;

    // Always set toolConfig.functionCallingConfig.mode to VALIDATED
    // This is crucial for stability regardless of whether tools are present
    if (!geminiRequest.toolConfig) {
        geminiRequest.toolConfig = {};
    }
    if (!geminiRequest.toolConfig.functionCallingConfig) {
        geminiRequest.toolConfig.functionCallingConfig = {};
    }
    geminiRequest.toolConfig.functionCallingConfig.mode = "VALIDATED";

    // For non-Claude models, delete maxOutputTokens
    // This prevents rate limiting issues with Gemini models
    if (!isClaude && geminiRequest.generationConfig) {
        delete geminiRequest.generationConfig.maxOutputTokens;
    }

    return {
        project: projectId,
        model,
        request: {
            ...geminiRequest,
            sessionId: geminiRequest.sessionId,
        },
        userAgent: "antigravity",
        // Use 'agent-' prefix like CLIProxyAPI for better compatibility
        requestId: `agent-${crypto.randomUUID()}`,
        // requestType: 'agent' helps reduce 429 rate limiting
        requestType: "agent",
    };
}

/**
 * Unwrap Antigravity response envelope
 */
export function unwrapAntigravityResponse(data: unknown): GeminiResponse {
    if (typeof data === "object" && data !== null && "response" in data) {
        return (data as { response: GeminiResponse }).response;
    }
    return data as GeminiResponse;
}
