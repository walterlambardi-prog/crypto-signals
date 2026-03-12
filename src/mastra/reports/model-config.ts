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
  provider: 'google' | 'openai' | 'anthropic';
  modelName: string;
  apiKey: string;
}

// ─── Available Models ────────────────────────────────────────────────

export const AVAILABLE_MODELS: Record<string, { label: string; models: { id: string; label: string }[] }> = {
  google: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { id: 'o4-mini', label: 'o4 Mini' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
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
