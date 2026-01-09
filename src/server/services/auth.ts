import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  OAUTH_SCOPES,
  OAUTH_REDIRECT_PORT,
  OAUTH_REDIRECT_URI,
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_ENDPOINTS,
  ENDPOINT_PRIORITY,
  logger,
} from "../../shared/index.js";
import type { Account, AntigravityTokens, OAuthState, QuotaData, ModelQuota } from "../../shared/index.js";
import { tokenStore } from "./tokenStore.js";

// ============================================
// PKCE Utilities
// ============================================

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

// ============================================
// OAuth Flow
// ============================================

let pendingOAuthState: OAuthState | null = null;

export function buildAuthUrl(): { url: string; state: OAuthState } {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const oauthState: OAuthState = {
    state,
    pkce: { codeVerifier, codeChallenge },
    createdAt: Date.now(),
  };

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent", // Always ask for consent to get refresh token
  });

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state: oauthState,
  };
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<AntigravityTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!data.refresh_token) {
    throw new Error("No refresh token received. Please revoke app access and try again.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshTokens(
  refreshToken: string
): Promise<AntigravityTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    if (error.includes("invalid_grant")) {
      throw new Error("Refresh token revoked or expired");
    }
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function fetchUserInfo(
  accessToken: string
): Promise<{ email: string; name?: string }> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = (await response.json()) as {
    email: string;
    name?: string;
  };

  return { email: data.email, name: data.name };
}

/**
 * Fetch Antigravity project ID from loadCodeAssist endpoint
 */
export async function fetchProjectIdAndTier(accessToken: string): Promise<{ projectId: string, tier: string }> {
  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  ];

  for (const baseEndpoint of endpoints) {
    try {
      const url = `${baseEndpoint}/v1internal:loadCodeAssist`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as any;
      let projectId = "";
      if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
        projectId = data.cloudaicompanionProject;
      } else if (
        data.cloudaicompanionProject &&
        typeof data.cloudaicompanionProject.id === "string" &&
        data.cloudaicompanionProject.id
      ) {
        projectId = data.cloudaicompanionProject.id;
      }

      const tierId = data.paidTier?.id ?? data.currentTier?.id ?? "FREE";

      if (projectId) {
        return { projectId, tier: tierId };
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return { projectId: "", tier: "FREE" };
}

export async function fetchQuota(
  accessToken: string,
  projectId: string
): Promise<QuotaData> {
  const endpoints = ENDPOINT_PRIORITY.map((key) => ANTIGRAVITY_ENDPOINTS[key]);
  let lastError: Error | null = null;

  for (const baseEndpoint of endpoints) {
    try {
      const url = `${baseEndpoint}/v1internal:fetchAvailableModels`;
      let response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({
          project: projectId,
        }),
      });

      // If 403 with projectId, try again without it (some accounts prefer empty body)
      if (response.status === 403 && projectId) {
        logger.debug(`Quota fetch forbidden with projectId on ${baseEndpoint}, retrying with empty body...`);
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...ANTIGRAVITY_HEADERS,
          },
          body: JSON.stringify({}),
        });
      }

      if (response.status === 403) {
        logger.debug(`Quota fetch still forbidden (403) on ${baseEndpoint}, skipping...`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Quota fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const models: ModelQuota[] = [];

      if (data.models && typeof data.models === "object") {
        for (const [name, info] of Object.entries(data.models) as [string, any][]) {
          if (info.quotaInfo && (name.includes("gemini") || name.includes("claude"))) {
            models.push({
              name,
              percentage: info.quotaInfo.remainingFraction !== undefined
                ? info.quotaInfo.remainingFraction * 100
                : 100,
              resetTime: info.quotaInfo.resetTime || "unknown",
            });
          }
        }
      }

      return {
        models,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.debug(`Failed to fetch quota from ${baseEndpoint}: ${lastError.message}`);
    }
  }

  if (lastError) {
    logger.warn(`Failed to fetch quota from all endpoints, last error: ${lastError.message}`);
  }

  return {
    models: [],
    lastUpdated: Date.now(),
  };
}

// ============================================

export async function startOAuthFlow(): Promise<{
  authUrl: string;
  waitForCallback: () => Promise<Account>;
}> {
  const { url, state } = buildAuthUrl();
  pendingOAuthState = state;

  return {
    authUrl: url,
    waitForCallback: () => waitForOAuthCallback(),
  };
}

function waitForOAuthCallback(): Promise<Account> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("OAuth timeout (5 minutes)"));
    }, 5 * 60 * 1000);

    const server: Server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${OAUTH_REDIRECT_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      // Send response immediately
      res.writeHead(200, { "Content-Type": "text/html" });

      if (error) {
        res.end(getErrorHtml(error));
        clearTimeout(timeout);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || !state) {
        res.end(getErrorHtml("Missing code or state"));
        clearTimeout(timeout);
        server.close();
        reject(new Error("Missing code or state in callback"));
        return;
      }

      if (!pendingOAuthState || state !== pendingOAuthState.state) {
        res.end(getErrorHtml("Invalid state"));
        clearTimeout(timeout);
        server.close();
        reject(new Error("Invalid OAuth state"));
        return;
      }

      try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(
          code,
          pendingOAuthState.pkce.codeVerifier
        );

        // Fetch user info
        const userInfo = await fetchUserInfo(tokens.accessToken);

        // Fetch project ID and Tier
        const { projectId, tier } = await fetchProjectIdAndTier(tokens.accessToken);
        if (!projectId) {
          // Fallback to a default if retrieval fails, or log warning
          logger.warn("Could not retrieve Project ID from Antigravity. Using default.");
        }

        const quota = await fetchQuota(tokens.accessToken, projectId || "rising-fact-p41fc");

        // Add account to store
        const account = await tokenStore.addAccount({
          email: userInfo.email,
          name: userInfo.name,
          projectId: projectId || "rising-fact-p41fc",
          tier,
          quota,
          tokens,
        });

        res.end(getSuccessHtml(userInfo.email));
        clearTimeout(timeout);
        server.close();
        pendingOAuthState = null;
        resolve(account);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.end(getErrorHtml(message));
        clearTimeout(timeout);
        server.close();
        pendingOAuthState = null;
        reject(err);
      }
    });

    server.listen(OAUTH_REDIRECT_PORT, "127.0.0.1", () => {
      logger.debug(`OAuth callback server listening on port ${OAUTH_REDIRECT_PORT}`);
    });

    server.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function getSuccessHtml(email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>agy-tools - Login Success</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display: flex; justify-content: center; align-items: center; height: 100vh;
           margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white;
                 border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #22c55e; margin-bottom: 10px; }
    p { color: #666; }
    .email { font-weight: bold; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Login Successful</h1>
    <p>Logged in as <span class="email">${email}</span></p>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`;
}

function getErrorHtml(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>agy-tools - Login Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display: flex; justify-content: center; align-items: center; height: 100vh;
           margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white;
                 border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #ef4444; margin-bottom: 10px; }
    p { color: #666; }
    .error { color: #dc2626; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✗ Login Failed</h1>
    <p class="error">${error}</p>
    <p>Please try again from the terminal.</p>
  </div>
</body>
</html>`;
}
