import { MODELS } from "../../shared/index.js";
import { logger } from "../../shared/logger.js";

interface ModelDisplayInfo {
  id: string;
  name: string;
  family: string;
  contextWindow: string;
  maxOutputTokens: string;
  features: string[];
}

export async function modelsCommand(): Promise<void> {
  logger.info("Available Models:");
  logger.info("");

  // Group models by family
  const claudeModels = MODELS.filter((m) => m.family === "claude");
  const geminiModels = MODELS.filter((m) => m.family === "gemini");

  // Display Claude models
  if (claudeModels.length > 0) {
    logger.info("Claude Models:");
    displayModels(claudeModels);
    logger.info("");
  }

  // Display Gemini models
  if (geminiModels.length > 0) {
    logger.info("Gemini Models:");
    displayModels(geminiModels);
    logger.info("");
  }

  // Display usage hint
  logger.info("Usage:");
  logger.info("  Use the model ID in your API requests");
  logger.info("  Example: curl http://127.0.0.1:8080/v1/chat/completions \\");
  logger.info('    -d \'{"model": "claude-sonnet-4-5", "messages": [...]}\'');
}

function displayModels(models: typeof MODELS): void {
  for (const model of models) {
    const features: string[] = [];

    if (model.supportsStreaming) {
      features.push("streaming");
    }

    if (model.supportsThinking) {
      const budget = model.thinkingBudget;
      if (budget) {
        features.push(`thinking (${formatTokens(budget)} budget)`);
      } else {
        features.push("thinking");
      }
    }

    // Format context window and max tokens
    const contextWindow = formatTokens(model.contextWindow);
    const maxOutputTokens = formatTokens(model.maxOutputTokens);

    logger.info(`  • ${model.id}`);
    logger.info(`    Name: ${model.name}`);
    logger.info(`    Context: ${contextWindow} | Output: ${maxOutputTokens}`);

    if (features.length > 0) {
      logger.info(`    Features: ${features.join(", ")}`);
    }

    logger.info("");
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K tokens`;
  }
  return `${tokens} tokens`;
}
