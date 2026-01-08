import { Hono } from "hono";
import { chatCompletions, claudeMessages, responses } from "./v1/chat.js";
import { listModels } from "./v1/models.js";

export function setupRoutes(app: Hono) {
  const v1 = new Hono();

  // OpenAI Chat Completions API
  v1.post("/chat/completions", chatCompletions);

  // OpenAI Responses API (新版)
  v1.post("/responses", responses);

  // Claude Messages API
  v1.post("/messages", claudeMessages);

  // Models API
  v1.get("/models", listModels);

  app.route("/v1", v1);

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));
}
