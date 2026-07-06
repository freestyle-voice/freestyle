/**
 * Per-provider API key validation using free, read-only endpoints.
 *
 * Each check hits a lightweight endpoint (e.g. list-models) that
 * authenticates the key without incurring usage charges.
 */

const TIMEOUT_MS = 10_000;

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Format pre-checks
// ---------------------------------------------------------------------------

const FORMAT_HINTS: Record<string, { prefix: string; hint: string }> = {
  openai: {
    prefix: "sk-",
    hint: 'OpenAI keys start with "sk-".',
  },
  groq: {
    prefix: "gsk_",
    hint: 'Groq keys start with "gsk_".',
  },
};

function checkFormat(provider: string, key: string): string | null {
  const rule = FORMAT_HINTS[provider];
  if (!rule) return null;
  if (!key.startsWith(rule.prefix)) return rule.hint;
  return null;
}

// ---------------------------------------------------------------------------
// Live checks — one per provider
// ---------------------------------------------------------------------------

async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  const res = await fetch("https://api.openai.com/v1/models?limit=1", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  if (res.status === 403)
    return {
      valid: false,
      error: "API key lacks permission. Check your OpenAI project settings.",
    };
  return { valid: false, error: `OpenAI returned HTTP ${res.status}.` };
}

async function validateGroq(apiKey: string): Promise<ValidationResult> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  return { valid: false, error: `Groq returned HTTP ${res.status}.` };
}

async function validateDeepgram(apiKey: string): Promise<ValidationResult> {
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  return { valid: false, error: `Deepgram returned HTTP ${res.status}.` };
}

async function validateElevenLabs(apiKey: string): Promise<ValidationResult> {
  // Use /v1/models, which a Speech-to-Text-scoped key can reach. /v1/user
  // requires the user_read permission, so a valid STT-only key would 401 there
  // and be wrongly rejected.
  const res = await fetch("https://api.elevenlabs.io/v1/models", {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  return { valid: false, error: `ElevenLabs returned HTTP ${res.status}.` };
}

async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  if (res.status === 403)
    return { valid: false, error: "API key lacks permission." };
  return { valid: false, error: `Anthropic returned HTTP ${res.status}.` };
}

async function validateGoogle(apiKey: string): Promise<ValidationResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (res.ok) return { valid: true };
  if (res.status === 400 || res.status === 403)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  return { valid: false, error: `Google returned HTTP ${res.status}.` };
}

async function validateMistral(apiKey: string): Promise<ValidationResult> {
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401)
    return {
      valid: false,
      error: "Invalid API key. Please check and try again.",
    };
  return { valid: false, error: `Mistral returned HTTP ${res.status}.` };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const LIVE_VALIDATORS: Record<
  string,
  (apiKey: string) => Promise<ValidationResult>
> = {
  openai: validateOpenAI,
  groq: validateGroq,
  deepgram: validateDeepgram,
  elevenlabs: validateElevenLabs,
  anthropic: validateAnthropic,
  google: validateGoogle,
  mistral: validateMistral,
};

export async function validateApiKey(
  provider: string,
  key: string,
): Promise<ValidationResult> {
  // 1. Format pre-check
  const formatError = checkFormat(provider, key);
  if (formatError) return { valid: false, error: formatError };

  // 2. Live check
  const validator = LIVE_VALIDATORS[provider];
  if (!validator) {
    // Unknown provider — skip live check, accept the key
    return { valid: true };
  }

  try {
    return await validator(key);
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return {
        valid: false,
        error: "Validation timed out. Check your network and try again.",
      };
    }
    return {
      valid: false,
      error: `Could not reach ${provider} API. Check your network and try again.`,
    };
  }
}
