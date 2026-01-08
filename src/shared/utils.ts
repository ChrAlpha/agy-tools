// Utility functions shared across the application
// Note: resolveModelId and getModelInfo are defined in constants.ts

export function generateRequestId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
