# GPT to Gemini Model Mapping

## Overview

agy-tools now supports automatic model name redirection, allowing you to use GPT model names (like `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`) that are automatically mapped to Gemini models. This feature is particularly useful for tools like **Codex** that are configured to use OpenAI models by default.

## Quick Start for Codex

1. Start agy-tools proxy:

   ```bash
   agy-tools proxy
   ```

2. Configure Codex to use agy-tools as API endpoint:

   ```json
   {
     "api_base": "http://127.0.0.1:38080/v1",
     "model": "gpt-4o"
   }
   ```

3. That's it! No need to change the model name - `gpt-4o` will automatically be mapped to `gemini-2.5-pro`.

## Default Mappings

### GPT-4 Series → Gemini 2.5 Pro

All GPT-4 variants are mapped to `gemini-2.5-pro`:

- `gpt-4` → `gemini-2.5-pro`
- `gpt-4-turbo` → `gemini-2.5-pro`
- `gpt-4-turbo-preview` → `gemini-2.5-pro`
- `gpt-4-0125-preview` → `gemini-2.5-pro`
- `gpt-4-1106-preview` → `gemini-2.5-pro`
- `gpt-4-0613` → `gemini-2.5-pro`
- `gpt-4o` → `gemini-2.5-pro`
- `gpt-4o-2024-05-13` → `gemini-2.5-pro`
- `gpt-4o-2024-08-06` → `gemini-2.5-pro`

### GPT-3.5 & GPT-4o-mini Series → Gemini 2.5 Flash

All GPT-3.5-turbo and GPT-4o-mini variants are mapped to `gemini-2.5-flash`:

- `gpt-4o-mini` → `gemini-2.5-flash`
- `gpt-4o-mini-2024-07-18` → `gemini-2.5-flash`
- `gpt-3.5-turbo` → `gemini-2.5-flash`
- `gpt-3.5-turbo-16k` → `gemini-2.5-flash`
- `gpt-3.5-turbo-0125` → `gemini-2.5-flash`
- `gpt-3.5-turbo-1106` → `gemini-2.5-flash`
- `gpt-3.5-turbo-0613` → `gemini-2.5-flash`

### Claude Models

Claude model aliases are also supported:

- `claude-sonnet-4-5-20250929` → `claude-sonnet-4-5-thinking`
- `claude-3-5-sonnet-20241022` → `claude-sonnet-4-5`
- `claude-3-5-sonnet-20240620` → `claude-sonnet-4-5`
- `claude-opus-4` → `claude-opus-4-5-thinking`
- `claude-haiku-4` → `claude-sonnet-4-5`

### Gemini Models (Pass-through)

Native Gemini model names are passed through unchanged:

- `gemini-2.5-pro` → `gemini-2.5-pro`
- `gemini-2.5-flash` → `gemini-2.5-flash`
- `gemini-3-pro` → `gemini-3-pro`
- `gemini-3-flash` → `gemini-3-flash`
- `gemini-2.5-flash-thinking` → `gemini-2.5-flash-thinking`

Dynamic Gemini models with suffixes (e.g., `gemini-2.5-pro-experimental`) are also passed through as-is.

## Custom Model Mapping

You can define custom model mappings programmatically:

```typescript
import { setCustomModelMapping } from "agy-tools";

// Exact match mapping
setCustomModelMapping({
  "my-custom-model": "gemini-3-pro",
  "special-model": "claude-opus-4-5-thinking",
});

// Wildcard mapping (future GPT-5 models)
setCustomModelMapping({
  "gpt-5*": "gemini-3-pro",
});
```

### Priority Order

Model routing follows this priority:

1. **Custom exact match** (highest priority)
2. **Custom wildcard match**
3. **System default mapping** (built-in mappings)
4. **Pass-through** (for `gemini-*` and `*-thinking` patterns)
5. **Fallback** (defaults to `claude-sonnet-4-5` for unknown models)

## Wildcard Matching

Wildcard matching supports simple `*` patterns:

```typescript
setCustomModelMapping({
  "gpt-4*": "gemini-2.5-pro",           // Matches gpt-4, gpt-4-turbo, gpt-4-0613, etc.
  "claude-3-5-sonnet-*": "claude-sonnet-4-5", // Matches all 3.5 sonnet versions
  "*-thinking": "claude-opus-4-5-thinking",   // Matches all models ending with -thinking
});
```

## Use Cases

### 1. Codex Integration

Configure Codex to use agy-tools without changing model names:

```json
{
  "api_base": "http://127.0.0.1:38080/v1",
  "model": "gpt-4o"  // Automatically uses gemini-2.5-pro
}
```

### 2. Legacy Code Migration

Migrate existing OpenAI-based code without changing model references:

```typescript
// Your existing code works without modification
const response = await fetch("http://127.0.0.1:38080/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "gpt-4",  // Automatically mapped to gemini-2.5-pro
    messages: [{ role: "user", content: "Hello" }]
  })
});
```

### 3. Multi-Environment Configuration

Use different mappings for different environments:

```typescript
// Development: use faster models
setCustomModelMapping({
  "gpt-4": "gemini-2.5-flash",
  "gpt-4o": "gemini-2.5-flash",
});

// Production: use more powerful models
setCustomModelMapping({
  "gpt-4": "gemini-2.5-pro",
  "gpt-4o": "gemini-3-pro",
});
```

## API Reference

### `resolveModelRoute(originalModel: string): string`

Core model routing function that applies custom and system mappings.

```typescript
import { resolveModelRoute } from "agy-tools";

const mapped = resolveModelRoute("gpt-4o");
console.log(mapped); // "gemini-2.5-pro"
```

### `setCustomModelMapping(mapping: Record<string, string>): void`

Set custom model mappings (replaces existing custom mappings).

```typescript
import { setCustomModelMapping } from "agy-tools";

setCustomModelMapping({
  "my-model": "gemini-3-pro",
  "test-*": "gemini-2.5-flash",
});
```

### `getCustomModelMapping(): Record<string, string>`

Get current custom model mappings.

```typescript
import { getCustomModelMapping } from "agy-tools";

const mappings = getCustomModelMapping();
console.log(mappings);
```

### `resolveModelId(modelId: string): string`

Complete model resolution including routing and alias resolution.

```typescript
import { resolveModelId } from "agy-tools";

const resolved = resolveModelId("gpt-4o");
console.log(resolved); // "gemini-2.5-pro"
```

## Implementation Details

The model mapping feature is based on [antigravity-auth](https://github.com/yetone/alma-plugins/tree/main/plugins/antigravity-auth)'s model routing implementation with these key components:

1. **MODEL_MAPPING**: Built-in system mapping table
2. **customModelMapping**: User-defined mappings (runtime configurable)
3. **wildcardMatch()**: Simple `*` wildcard pattern matcher
4. **mapModelToTarget()**: Internal helper for system mapping
5. **resolveModelRoute()**: Main routing engine with priority logic

The implementation ensures:

- Zero-config GPT to Gemini mapping for immediate Codex compatibility
- Flexible custom mapping for advanced use cases
- Pass-through for native Gemini and thinking models
- Sensible fallback behavior for unknown models

## Testing

Run tests to verify model mapping behavior:

```bash
# Test model mapping specifically
pnpm test modelMapping

# Run all tests
pnpm test
```

All 19 model mapping tests pass, covering:

- GPT to Gemini redirection (7 tests)
- Claude model mapping (2 tests)
- Gemini model pass-through (3 tests)
- Custom model mapping (4 tests)
- Fallback behavior (3 tests)

## Troubleshooting

### Model not mapping correctly

Check the priority order:

1. Custom exact match overrides everything
2. Custom wildcard match comes second
3. System default mapping is third
4. Pass-through for gemini-*and*-thinking

### Want to see current mapping

```typescript
import { resolveModelRoute } from "agy-tools";

console.log(resolveModelRoute("your-model-name"));
```

### Reset custom mappings

```typescript
import { setCustomModelMapping } from "agy-tools";

setCustomModelMapping({}); // Clear all custom mappings
```

## Benefits

1. **Zero Configuration**: Just set API_BASE and use GPT model names
2. **Codex Compatibility**: Works out-of-the-box with Codex default settings
3. **Flexible**: Custom mappings for advanced scenarios
4. **Future-Proof**: Wildcard support for upcoming models
5. **Transparent**: Model resolution is predictable and well-documented
