import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";

import { logger } from "../shared/logger.js";
import { setupRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";
import { tokenStore } from "./services/tokenStore.js";

interface StartServerOptions {
  host: string;
  port: number;
  apiKey?: string;
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const { host, port, apiKey } = options;

  // Load accounts
  await tokenStore.load();

  const app = new Hono();

  // Global Middleware
  app.use("*", prettyJSON());
  app.use("*", cors());

  // Custom auth middleware with API key from options
  if (apiKey) {
    app.use("*", async (c, next) => {
      const authHeader = c.req.header("Authorization");
      const sentApiKey =
        authHeader?.replace("Bearer ", "") || c.req.header("x-api-key");

      if (sentApiKey !== apiKey) {
        return c.json({ error: { message: "Invalid API Key" } }, 401);
      }

      return next();
    });
  }

  // Routes
  setupRoutes(app);

  // Error Handling
  app.onError(errorHandler);

  // Start server
  logger.info(`Starting agy-tools server...`);
  logger.info(`Listening on http://${host}:${port}`);
  logger.info(`Accounts loaded: ${tokenStore.getAccounts().length}`);

  if (apiKey) {
    logger.info(`API Key authentication: enabled`);
  }

  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Handle graceful shutdown on Ctrl+C (SIGINT) and SIGTERM
  const shutdown = () => {
    logger.info("\nShutting down server gracefully...");
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 5 seconds if graceful shutdown fails
    setTimeout(() => {
      logger.warn("Forcing shutdown after timeout");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export default startServer;
