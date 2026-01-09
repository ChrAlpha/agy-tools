/**
 * Parse retry delay from error response
 */
export function parseRetryDelay(errorBody: string): number | undefined {
    try {
        const json = JSON.parse(errorBody);
        const details = json?.error?.details;
        if (Array.isArray(details)) {
            for (const detail of details) {
                // Check quotaResetDelay in metadata
                const quotaDelay = detail?.metadata?.quotaResetDelay;
                if (typeof quotaDelay === "string") {
                    const parsed = parseDurationString(quotaDelay);
                    if (parsed !== undefined) return parsed;
                }

                // Check retryDelay in RetryInfo
                if (detail?.["@type"]?.includes("RetryInfo")) {
                    const retryDelay = detail?.retryDelay;
                    if (typeof retryDelay === "string") {
                        const parsed = parseDurationString(retryDelay);
                        if (parsed !== undefined) return parsed;
                    }
                }
            }
        }

        // OpenAI style retry_after
        const retryAfter = json?.error?.retry_after;
        if (typeof retryAfter === "number") {
            return retryAfter * 1000;
        }
    } catch {
        // JSON parse failed
    }

    // Regex fallback patterns
    const patterns = [
        /try again in (\d+)m\s*(\d+)s/i,
        /(?:try again in|backoff for|wait)\s*(\d+)s/i,
        /quota will reset in (\d+) second/i,
        /retry after (\d+) second/i,
        /\(wait (\d+)s\)/,
    ];

    for (const pattern of patterns) {
        const match = errorBody.match(pattern);
        if (match) {
            if (match.length >= 3) {
                // pattern 1: m and s
                const m = parseInt(match[1], 10);
                const s = parseInt(match[2], 10);
                return (m * 60 + s) * 1000;
            } else {
                // other patterns: only s
                return parseInt(match[1], 10) * 1000;
            }
        }
    }

    return undefined;
}

/**
 * Parse duration string like "2h1m30s", "42s", "500ms"
 */
function parseDurationString(s: string): number | undefined {
    const regex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?/;
    const match = s.match(regex);
    if (!match) return undefined;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseFloat(match[3] || "0");
    const milliseconds = parseInt(match[4] || "0", 10);

    const totalMs =
        (hours * 3600 + minutes * 60 + Math.ceil(seconds)) * 1000 + milliseconds;
    return totalMs > 0 ? totalMs : undefined;
}
