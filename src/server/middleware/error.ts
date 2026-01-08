import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../../shared/logger.js";

export function errorHandler(err: Error, c: Context) {
    logger.error("Global error handler caught exception:", err.message);

    if (err instanceof HTTPException) {
        return c.json({
            error: {
                message: err.message,
                type: "http_exception",
                code: err.status,
            },
        }, err.status);
    }

    return c.json({
        error: {
            message: "Internal Server Error",
            type: "server_error",
        },
    }, 500);
}
