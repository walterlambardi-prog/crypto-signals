// ─── Dynamic Model Configuration ─────────────────────────────────────
// Manages the active LLM model + API key configuration.
//
// SECURITY: API keys are NEVER written to disk on the server.
//   - Client stores config in localStorage (persistence across sessions)
//   - Client sends config to server on page load / save
//   - Server holds config in memory only (lost on restart)
//   - On restart, client re-sends from localStorage on next visit

// ─── Types ───────────────────────────────────────────────────────────

export interface ModelConfig {
  provider: 'google' | 'openai' | 'anthropic' | 'groq' | 'xai' | 'mistral' | 'deepseek' | 'perplexity' | 'cohere';
  modelName: string;
  apiKey: string;
}

// ─── Available Models ────────────────────────────────────────────────

export const AVAILABLE_MODELS: Record<string, { label: string; models: { id: string; label: string }[] }> = {
  google: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'o3-pro', label: 'o3 Pro' },
      { id: 'o3', label: 'o3' },
      { id: 'o3-mini', label: 'o3 Mini' },
      { id: 'o4-mini', label: 'o4 Mini' },
      { id: 'o1', label: 'o1' },
      { id: 'o1-mini', label: 'o1 Mini' },
      { id: 'o1-pro', label: 'o1 Pro' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { id: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'claude-opus-4', label: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet v2' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ],
  },
  groq: {
    label: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision' },
      { id: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision' },
      { id: 'llama-3.2-3b-preview', label: 'Llama 3.2 3B' },
      { id: 'llama-3.2-1b-preview', label: 'Llama 3.2 1B' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  xai: {
    label: 'xAI (Grok)',
    models: [
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-3-fast', label: 'Grok 3 Fast' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
      { id: 'grok-3-mini-fast', label: 'Grok 3 Mini Fast' },
      { id: 'grok-2', label: 'Grok 2' },
      { id: 'grok-2-vision', label: 'Grok 2 Vision' },
    ],
  },
  mistral: {
    label: 'Mistral',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
      { id: 'mistral-saba-latest', label: 'Mistral Saba' },
      { id: 'codestral-latest', label: 'Codestral' },
      { id: 'pixtral-large-latest', label: 'Pixtral Large' },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo' },
      { id: 'ministral-8b-latest', label: 'Ministral 8B' },
      { id: 'ministral-3b-latest', label: 'Ministral 3B' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
  perplexity: {
    label: 'Perplexity',
    models: [
      { id: 'sonar-pro', label: 'Sonar Pro' },
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
      { id: 'sonar-reasoning', label: 'Sonar Reasoning' },
      { id: 'sonar-deep-research', label: 'Sonar Deep Research' },
    ],
  },
  cohere: {
    label: 'Cohere',
    models: [
      { id: 'command-a', label: 'Command A' },
      { id: 'command-r-plus', label: 'Command R+' },
      { id: 'command-r', label: 'Command R' },
      { id: 'command-r7b-12-2024', label: 'Command R 7B' },
      { id: 'c4ai-aya-expanse-32b', label: 'Aya Expanse 32B' },
      { id: 'c4ai-aya-expanse-8b', label: 'Aya Expanse 8B' },
    ],
  },
};

// ─── In-Memory Config Store ──────────────────────────────────────────
// This variable lives only in server RAM. Never written to disk.
// There is NO fallback to environment variables — users MUST configure
// their own API key via the Settings page.

let inMemoryConfig: ModelConfig | null = null;

// ─── Read / Write (in-memory only) ───────────────────────────────────

/** Returns the current config or null if not configured. */
export function getModelConfig(): ModelConfig | null {
  if (inMemoryConfig?.provider && inMemoryConfig?.modelName && inMemoryConfig?.apiKey) {
    return inMemoryConfig;
  }
  return null;
}

/** Returns true when a valid config (with API key) is loaded in memory. */
export function isModelConfigured(): boolean {
  return getModelConfig() !== null;
}

export function setModelConfig(config: ModelConfig): void {
  inMemoryConfig = { ...config };
}

export function resetModelConfig(): void {
  inMemoryConfig = null;
}

// ─── Masked Config (for UI responses) ────────────────────────────────

export function getMaskedConfig(): { configured: boolean; provider: string; modelName: string; apiKeyHint: string } {
  const config = getModelConfig();
  if (!config) {
    return { configured: false, provider: '', modelName: '', apiKeyHint: '' };
  }
  const key = config.apiKey;
  const hint = key.length > 8 ? key.slice(0, 4) + '••••' + key.slice(-4) : '••••••••';
  return {
    configured: true,
    provider: config.provider,
    modelName: config.modelName,
    apiKeyHint: hint,
  };
}

// ─── Environment Variable Mapping ────────────────────────────────────

const ENV_KEYS: Record<string, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  cohere: 'COHERE_API_KEY',
};

// ─── Dynamic Model for Agent ─────────────────────────────────────────
// Returns a Mastra model string (e.g. 'google/gemini-2.5-flash')
// and sets the appropriate env var so Mastra resolves the API key.
// Throws if no config has been set — callers must check isModelConfigured() first.

export function getModelForAgent(): string {
  const config = getModelConfig();
  if (!config) {
    throw new Error('Model not configured. Please configure your API key in Settings before running workflows.');
  }

  // Set the env var for the active provider
  const envKey = ENV_KEYS[config.provider];
  if (envKey && config.apiKey) {
    process.env[envKey] = config.apiKey;
  }

  return `${config.provider}/${config.modelName}`;
}

// ─── Test Connection ─────────────────────────────────────────────────
// Quick test to verify the model + API key work.

export async function testModelConnection(config: ModelConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey) {
    return { ok: false, message: 'API key is required. Please provide your API key.' };
  }

  const modelId = `${config.provider}/${config.modelName}`;

  // Set the env var temporarily
  const envKey = ENV_KEYS[config.provider];
  const previousValue = envKey ? process.env[envKey] : undefined;

  try {
    if (envKey) process.env[envKey] = config.apiKey;

    // Use a dynamic import to avoid bundling issues
    const { Agent } = await import('@mastra/core/agent');
    const testAgent = new Agent({
      id: 'test-connection-agent',
      name: 'Test',
      instructions: 'Respond with OK.',
      model: modelId as any,
    });

    const result = await testAgent.generate('Say OK', {
      modelSettings: { maxOutputTokens: 10 },
    });

    if (result.text) {
      return { ok: true, message: `Connected successfully. Model: ${modelId}` };
    }
    return { ok: false, message: 'Model returned empty response.' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Unknown error' };
  } finally {
    // Restore the previous env var
    if (envKey) {
      if (previousValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = previousValue;
      }
    }
  }
}
