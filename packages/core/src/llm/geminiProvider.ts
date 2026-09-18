import { GoogleGenAI } from "@google/genai";
import type { Bill, Language, PlanNumbers } from "@bijli/domain";
import { MockLLMProvider } from "./mockProvider.js";
import type { LLMProvider, QaContext } from "./types.js";

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  mr: "Marathi",
  bn: "Bengali",
};

function extractJson<T>(text: string): T | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return undefined;
  }
}

function textOf(response: { text?: string }): string {
  return (response.text ?? "").trim();
}

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /"code":\s*503|UNAVAILABLE|overloaded|high demand/i.test(message);
}

/** The free tier occasionally returns a transient 503 ("high demand"). Retry
 * a couple of times with a short backoff before giving up. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Real LLM provider using Google's Gemini API (free tier) -- the spec's own
 * note that Bedrock can be swapped for another model. Same prompt contracts
 * as AnthropicLLMProvider: the model only phrases numbers the calculators
 * already decided.
 */
export class GeminiLLMProvider implements LLMProvider {
  name = "gemini";
  private ai: GoogleGenAI;
  private model: string;
  private fallback = new MockLLMProvider();

  constructor(apiKey: string, model = process.env.GEMINI_MODEL || "gemini-3.6-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async readBill(imageBase64: string, mimeType: string): Promise<Partial<Bill>> {
    try {
      const response = await withRetry(() =>
        this.ai.models.generateContent({
          model: this.model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Extract these fields from this Indian electricity bill photo as strict JSON only, no prose: " +
                    '{"unitsKWh": number, "amountRupees": number, "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", ' +
                    '"tariffCategory": string, "meterType": "smart"|"conventional"|"unknown"}. ' +
                    "If a field is unreadable, make your best estimate rather than omitting it.",
                },
                { inlineData: { data: imageBase64, mimeType } },
              ],
            },
          ],
        })
      );
      const parsed = extractJson<Record<string, unknown>>(textOf(response));
      if (!parsed) return this.fallback.readBill();
      return { ...parsed, confirmed: false, label: "estimated" } as Partial<Bill>;
    } catch {
      return this.fallback.readBill();
    }
  }

  async writeDailyMessage(plan: PlanNumbers, language: Language): Promise<string> {
    try {
      const response = await withRetry(() =>
        this.ai.models.generateContent({
          model: this.model,
          contents:
            `Write a WhatsApp message in ${LANGUAGE_NAMES[language]}, at most 8 lines, for an Indian household's daily electricity plan. ` +
            "You must use ONLY the numbers given below -- never invent a rupee figure, a time, or a risk level. " +
            "List the actions in order, each with its window and rupee saving if any, then one line on tonight's cut risk if not low, " +
            'then close with "Reply DONE after each, or ask me anything." (translated). Numbers:\n' +
            JSON.stringify(plan),
        })
      );
      return textOf(response);
    } catch {
      return this.fallback.writeDailyMessage(plan, language);
    }
  }

  async answerQuestion(question: string, context: QaContext, language: Language): Promise<string> {
    try {
      const response = await withRetry(() =>
        this.ai.models.generateContent({
          model: this.model,
          contents:
            `Answer this household's question in ${LANGUAGE_NAMES[language]}, in one short line, using ONLY the plan data given ` +
            "(never invent a number, time or risk level not present in it). Question: " +
            `"${question}". Current hour: ${context.currentHour}. Plan data:\n` +
            JSON.stringify(context.plan),
        })
      );
      return textOf(response);
    } catch {
      return this.fallback.answerQuestion(question, context, language);
    }
  }
}
