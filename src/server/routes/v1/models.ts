import type { Context } from "hono";
import { MODELS } from "../../../shared/index.js";

export async function listModels(c: Context) {
  // Transform internal model format to OpenAI-compatible format
  const models = MODELS.map((model) => ({
    id: model.id,
    object: "model" as const,
    created: Math.floor(Date.now() / 1000) - 86400, // Yesterday
    owned_by: model.family === "claude" ? "anthropic" : "google",
    // Extended info for clients that want more details
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    capabilities: {
      streaming: model.supportsStreaming,
      reasoning: model.supportsThinking ?? false,
    },
  }));

  return c.json({
    object: "list",
    data: models,
  });
}
