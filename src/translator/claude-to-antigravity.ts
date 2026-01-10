import type {
  ClaudeRequest,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeTool,
  ClaudeSystemContent,
  AntigravityRequest,
  AntigravityContent,
  AntigravityPart,
  AntigravityTool,
  AntigravityFunctionDeclaration,
} from '../types.js';
import { MODEL_MAPPINGS } from '../config.js';

export function translateClaudeToAntigravity(request: ClaudeRequest): {
  model: string;
  payload: AntigravityRequest;
} {
  const model = MODEL_MAPPINGS[request.model] || `gemini-${request.model}`;

  const payload: AntigravityRequest = {
    contents: translateMessages(request.messages),
    generationConfig: {
      temperature: request.temperature,
      topP: request.top_p,
      topK: request.top_k,
      maxOutputTokens: request.max_tokens,
    },
  };

  // Handle system instruction
  if (request.system) {
    payload.systemInstruction = {
      parts: translateSystemInstruction(request.system),
    };
  }

  // Handle tools
  if (request.tools && request.tools.length > 0) {
    payload.tools = translateTools(request.tools);
  }

  // Handle thinking configuration
  if (request.thinking) {
    payload.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: request.thinking.budget_tokens,
    };
  }

  return { model, payload };
}

function translateSystemInstruction(
  system: string | ClaudeSystemContent[]
): { text: string }[] {
  if (typeof system === 'string') {
    return [{ text: system }];
  }

  return system.map((item) => ({ text: item.text }));
}

function translateMessages(messages: ClaudeMessage[]): AntigravityContent[] {
  const contents: AntigravityContent[] = [];

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = translateContent(msg.content);

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

function translateContent(
  content: string | ClaudeContentBlock[]
): AntigravityPart[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  const parts: AntigravityPart[] = [];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ text: block.text });
        break;

      case 'thinking':
        parts.push({ thought: true, text: block.thinking });
        break;

      case 'tool_use':
        parts.push({
          functionCall: {
            name: block.name,
            args: block.input,
          },
        });
        break;

      case 'tool_result':
        const resultContent =
          typeof block.content === 'string'
            ? block.content
            : block.content
                .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                .map((c) => c.text)
                .join('\n');

        parts.push({
          functionResponse: {
            name: block.tool_use_id,
            response: { result: resultContent },
          },
        });
        break;

      case 'image':
        parts.push({
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data,
          },
        });
        break;
    }
  }

  return parts;
}

function translateTools(tools: ClaudeTool[]): AntigravityTool[] {
  const functionDeclarations: AntigravityFunctionDeclaration[] = tools.map((tool) => {
    const declaration: AntigravityFunctionDeclaration = {
      name: tool.name,
      description: tool.description,
    };

    if (tool.input_schema && typeof tool.input_schema === 'object') {
      const schema = tool.input_schema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };

      declaration.parameters = {
        type: schema.type || 'object',
        properties: schema.properties,
        required: schema.required,
      };
    }

    return declaration;
  });

  return [{ functionDeclarations }];
}
