import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { ClaudeRequest, ProxyConfig } from '../types.js';
import { getValidToken } from '../auth/index.js';
import { translateClaudeToAntigravity } from '../translator/claude-to-antigravity.js';
import {
  translateAntigravityToClaude,
  StreamingTranslator,
} from '../translator/antigravity-to-claude.js';
import {
  executeNonStreamingRequest,
  executeStreamingRequest,
} from './upstream.js';
import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, MODEL_MAPPINGS } from '../config.js';

export class ProxyServer {
  private app: express.Express;
  private server: Server | null = null;
  private config: ProxyConfig;

  constructor(config: Partial<ProxyConfig> = {}) {
    this.config = {
      port: config.port || DEFAULT_PROXY_PORT,
      host: config.host || DEFAULT_PROXY_HOST,
      apiKey: config.apiKey,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '50mb' }));

    // CORS
    this.app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
      next();
    });

    this.app.options('*', (_req, res) => {
      res.sendStatus(200);
    });

    // API Key authentication (optional)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (!this.config.apiKey) {
        next();
        return;
      }

      const authHeader = req.headers.authorization;
      const apiKeyHeader = req.headers['x-api-key'];

      const providedKey =
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
        (typeof apiKeyHeader === 'string' ? apiKeyHeader : null);

      if (providedKey !== this.config.apiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/healthz', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Claude API endpoints
    this.app.post('/v1/messages', this.handleMessages.bind(this));
    this.app.get('/v1/models', this.handleListModels.bind(this));

    // OpenAI-compatible endpoints (for broader compatibility)
    this.app.post('/v1/chat/completions', this.handleChatCompletions.bind(this));
  }

  private async handleMessages(req: Request, res: Response): Promise<void> {
    try {
      const tokenResult = await getValidToken();
      if (!tokenResult) {
        res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'No valid Antigravity account. Run `agy-tools login` first.',
          },
        });
        return;
      }

      const claudeRequest = req.body as ClaudeRequest;
      const { model, payload } = translateClaudeToAntigravity(claudeRequest);

      if (claudeRequest.stream) {
        await this.handleStreamingMessages(res, tokenResult.token, model, claudeRequest.model, payload);
      } else {
        await this.handleNonStreamingMessages(res, tokenResult.token, model, claudeRequest.model, payload);
      }
    } catch (error) {
      console.error('Error handling messages:', error);
      res.status(500).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      });
    }
  }

  private async handleNonStreamingMessages(
    res: Response,
    token: import('../types.js').TokenData,
    antigravityModel: string,
    claudeModel: string,
    payload: import('../types.js').AntigravityRequest
  ): Promise<void> {
    const response = await executeNonStreamingRequest(token, antigravityModel, payload);
    const claudeResponse = translateAntigravityToClaude(response, claudeModel);
    res.json(claudeResponse);
  }

  private async handleStreamingMessages(
    res: Response,
    token: import('../types.js').TokenData,
    antigravityModel: string,
    claudeModel: string,
    payload: import('../types.js').AntigravityRequest
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const translator = new StreamingTranslator(claudeModel);

    // Send message_start
    const startEvent = translator.getMessageStartEvent();
    res.write(`event: message_start\ndata: ${JSON.stringify(startEvent)}\n\n`);

    try {
      for await (const chunk of executeStreamingRequest(token, antigravityModel, payload)) {
        const events = translator.translateChunk(chunk);
        for (const event of events) {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      }

      // Send message_stop
      const stopEvent = translator.getMessageStopEvent();
      res.write(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`);
    } catch (error) {
      const errorEvent = {
        type: 'error',
        error: {
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Streaming error',
        },
      };
      res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
    }

    res.end();
  }

  private async handleListModels(_req: Request, res: Response): Promise<void> {
    // Return available Claude models
    const models = Object.keys(MODEL_MAPPINGS).map((id) => ({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'anthropic',
    }));

    res.json({
      object: 'list',
      data: models,
    });
  }

  private async handleChatCompletions(req: Request, res: Response): Promise<void> {
    // Basic OpenAI -> Claude conversion for compatibility
    // This is a simplified version for basic use cases
    const openaiRequest = req.body as {
      model: string;
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
    };

    const claudeRequest: ClaudeRequest = {
      model: openaiRequest.model,
      messages: openaiRequest.messages.map((m) => ({
        role: m.role === 'system' ? 'user' : (m.role as 'user' | 'assistant'),
        content: m.content,
      })),
      max_tokens: openaiRequest.max_tokens || 4096,
      temperature: openaiRequest.temperature,
      stream: openaiRequest.stream,
    };

    // Extract system message
    const systemMsg = openaiRequest.messages.find((m) => m.role === 'system');
    if (systemMsg) {
      claudeRequest.system = systemMsg.content;
      claudeRequest.messages = claudeRequest.messages.filter(
        (m) => m.content !== systemMsg.content
      );
    }

    req.body = claudeRequest;
    await this.handleMessages(req, res);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          resolve();
        });

        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  getConfig(): ProxyConfig {
    return this.config;
  }
}
