import { AnthropicLLMProvider } from "./anthropicProvider.js";
import { MockLLMProvider } from "./mockProvider.js";
import type { LLMProvider } from "./types.js";

export * from "./types.js";
export { MockLLMProvider } from "./mockProvider.js";
export { AnthropicLLMProvider } from "./anthropicProvider.js";

let cached: LLMProvider | undefined;

/** Real Bedrock/WhatsApp integration is a later stage; for now this picks the
 * Anthropic API provider if ANTHROPIC_API_KEY is set, else the offline mock. */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cached = apiKey ? new AnthropicLLMProvider(apiKey) : new MockLLMProvider();
  return cached;
}
