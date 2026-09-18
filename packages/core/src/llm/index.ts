import { AnthropicLLMProvider } from "./anthropicProvider.js";
import { GeminiLLMProvider } from "./geminiProvider.js";
import { MockLLMProvider } from "./mockProvider.js";
import type { LLMProvider } from "./types.js";

export * from "./types.js";
export { MockLLMProvider } from "./mockProvider.js";
export { AnthropicLLMProvider } from "./anthropicProvider.js";
export { GeminiLLMProvider } from "./geminiProvider.js";

let cached: LLMProvider | undefined;

/**
 * Picks the real provider by env var, falling back to the offline mock.
 * `LLM_PROVIDER` forces a choice ("gemini" | "anthropic" | "mock"); otherwise
 * auto-detects by which API key is set, preferring Gemini (free tier) over
 * Anthropic. Real Bedrock/WhatsApp integration is a later stage.
 */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (forced === "gemini" && geminiKey) {
    cached = new GeminiLLMProvider(geminiKey);
  } else if (forced === "anthropic" && anthropicKey) {
    cached = new AnthropicLLMProvider(anthropicKey);
  } else if (forced === "mock") {
    cached = new MockLLMProvider();
  } else if (geminiKey) {
    cached = new GeminiLLMProvider(geminiKey);
  } else if (anthropicKey) {
    cached = new AnthropicLLMProvider(anthropicKey);
  } else {
    cached = new MockLLMProvider();
  }
  return cached;
}
