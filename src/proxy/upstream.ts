import type { TokenData, AntigravityRequest, AntigravityResponse } from '../types.js';
import { ANTIGRAVITY_API_BASE } from '../config.js';
import { EventSourceParserStream } from 'eventsource-parser/stream';

const ANTIGRAVITY_ENDPOINTS = [
  'https://cloudcode-pa.googleapis.com',
  'https://cloudcode-pa-daily.googleapis.com',
];

export async function executeRequest(
  token: TokenData,
  model: string,
  payload: AntigravityRequest,
  stream: boolean
): Promise<Response> {
  const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
  const url = `${ANTIGRAVITY_API_BASE}/v1internal/models/${model}:${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
  };

  if (token.projectId) {
    headers['X-Goog-User-Project'] = token.projectId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return response;
}

export async function executeNonStreamingRequest(
  token: TokenData,
  model: string,
  payload: AntigravityRequest
): Promise<AntigravityResponse> {
  const response = await executeRequest(token, model, payload, false);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Antigravity API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<AntigravityResponse>;
}

export async function* executeStreamingRequest(
  token: TokenData,
  model: string,
  payload: AntigravityRequest
): AsyncGenerator<AntigravityResponse, void, unknown> {
  const response = await executeRequest(token, model, payload, true);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Antigravity API error (${response.status}): ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.data) {
        try {
          const chunk = JSON.parse(value.data) as AntigravityResponse;
          yield chunk;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchModels(token: TokenData): Promise<string[]> {
  const url = `${ANTIGRAVITY_API_BASE}/v1internal:fetchAvailableModels`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
  };

  if (token.projectId) {
    headers['X-Goog-User-Project'] = token.projectId;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) || [];
  } catch {
    return [];
  }
}
