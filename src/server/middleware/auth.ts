import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export async function authMiddleware(c: Context, next: Next) {
    // Simple API Key check if configured
    const apiKey = process.env.API_KEY;

    if (apiKey) {
        const authHeader = c.req.header("Authorization");
        const sentApiKey = authHeader?.replace("Bearer ", "") || c.req.header("x-api-key");

        if (sentApiKey !== apiKey) {
            throw new HTTPException(401, { message: "Invalid API Key" });
        }
    }

    await next();
}
