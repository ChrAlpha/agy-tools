import http from 'node:http';
import { URL, URLSearchParams } from 'node:url';
import crypto from 'node:crypto';
import open from 'open';
import type { TokenData } from '../types.js';
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_CALLBACK_PORT,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES,
  ANTIGRAVITY_API_BASE,
  ANTIGRAVITY_PROJECT_ENDPOINT,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
} from '../config.js';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface UserInfo {
  email: string;
  name?: string;
}

export async function login(): Promise<{ token: TokenData; userInfo: UserInfo }> {
  const state = crypto.randomBytes(16).toString('hex');

  // Build authorization URL
  const authParams = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    redirect_uri: ANTIGRAVITY_REDIRECT_URI,
    response_type: 'code',
    scope: ANTIGRAVITY_SCOPES.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;

  // Start local callback server, open browser, then wait for authorization code
  const codePromise = startCallbackServer(state);

  // Open browser for authorization after server is ready
  await open(authUrl);

  // Wait for the callback
  const code = await codePromise;

  // Exchange code for tokens
  const tokenData = await exchangeCode(code);

  // Fetch user info
  const userInfo = await fetchUserInfo(tokenData.access_token);

  // Fetch project ID
  const projectId = await fetchProjectId(tokenData.access_token);

  const token: TokenData = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    expiryTimestamp: Date.now() + tokenData.expires_in * 1000,
    tokenType: tokenData.token_type,
    email: userInfo.email,
    projectId,
  };

  return { token, userInfo };
}

function startCallbackServer(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${ANTIGRAVITY_CALLBACK_PORT}`);

      if (url.pathname === '/oauth-callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Authorization Failed</h1><p>${error}</p></body></html>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Invalid State</h1></body></html>');
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>No Authorization Code</h1></body></html>');
          server.close();
          reject(new Error('No authorization code'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h1 style="color: #22c55e;">Authorization Successful</h1>
              <p>You can close this window and return to the terminal.</p>
            </div>
          </body>
          </html>
        `);

        server.close();
        resolve(code);
      }
    });

    server.listen(ANTIGRAVITY_CALLBACK_PORT, '127.0.0.1', () => {
      // Server ready, waiting for callback
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start callback server: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timeout'));
    }, 5 * 60 * 1000);
  });
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: ANTIGRAVITY_REDIRECT_URI,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return response.json() as Promise<UserInfo>;
}

async function fetchProjectId(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${ANTIGRAVITY_API_BASE}${ANTIGRAVITY_PROJECT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as { projectId?: string };
    return data.projectId;
  } catch {
    return undefined;
  }
}

export async function refreshToken(refreshTokenValue: string): Promise<TokenData> {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as TokenResponse & { refresh_token?: string };

  // Fetch user info with new token
  const userInfo = await fetchUserInfo(data.access_token);
  const projectId = await fetchProjectId(data.access_token);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshTokenValue,
    expiresIn: data.expires_in,
    expiryTimestamp: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    email: userInfo.email,
    projectId,
  };
}
