/**
 * Model configuration constants for LLM providers.
 * Used for token limit awareness and context window sizing.
 */

/** Token limits by model provider (rough estimates for context window sizing) */
export const TOKEN_LIMITS: Record<string, number> = {
  // Gemini models
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-pro": 1_000_000,
  "gemini-flash": 1_000_000,

  // Claude models
  "claude-opus": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-3-5-sonnet": 200_000,

  // OpenAI models
  "gpt-4": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4.1": 128_000,
  "gpt-4-o": 128_000,

  // DeepSeek models
  "deepseek": 64_000,
  "deepseek-v4-flash": 64_000,
  "deepseek-v3": 64_000,

  // MiniMax models
  "MiniMax-M2.5": 64_000,

  // GLM models
  "glm-5": 128_000,
};

/**
 * Estimate token count from character count.
 * Rule of thumb: 1 character ≈ 0.25 tokens for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

/**
 * Get the token limit for a specific model.
 * Falls back to a conservative default if model not found.
 */
export function getTokenLimit(modelName: string): number {
  return TOKEN_LIMITS[modelName] ?? 24_000; // Conservative default
}

/**
 * Calculate the maximum input size (in characters) for a given model,
 * reserving space for the response.
 * Assumes 1 char ≈ 0.25 tokens.
 */
export function getMaxInputChars(modelName: string, responseTokens = 2000): number {
  const tokenLimit = getTokenLimit(modelName);
  const availableTokens = tokenLimit - responseTokens;
  // 1 token ≈ 4 characters (inverse of 1 char ≈ 0.25 tokens)
  return Math.floor(availableTokens * 4);
}
