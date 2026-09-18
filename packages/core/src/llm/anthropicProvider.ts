import Anthropic from "@anthropic-ai/sdk";
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

/**
 * Real LLM provider using the Anthropic API directly (no AWS account needed).
 * This is the swap-in for Bedrock described in the spec's architecture; the
 * prompt contracts are the same either way. Falls back to the mock provider's
 * canned bill if the model's JSON can't be parsed, so onboarding never hard-fails.
 */
export class AnthropicLLMProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;
  private fallback = new MockLLMProvider();

  constructor(apiKey: string, model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async readBill(imageBase64: string, mimeType: string): Promise<Partial<Bill>> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType as any, data: imageBase64 } },
            {
              type: "text",
              text:
                "Extract these fields from this Indian electricity bill photo as strict JSON only, no prose: " +
                '{"unitsKWh": number, "amountRupees": number, "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", ' +
                '"tariffCategory": string, "meterType": "smart"|"conventional"|"unknown"}. ' +
                "If a field is unreadable, make your best estimate rather than omitting it.",
            },
          ],
        },
      ],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = extractJson<Record<string, unknown>>(text);
    if (!parsed) return this.fallback.readBill();
    return { ...parsed, confirmed: false, label: "estimated" } as Partial<Bill>;
  }

  async writeDailyMessage(plan: PlanNumbers, language: Language): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content:
            `Write a WhatsApp message in ${LANGUAGE_NAMES[language]}, at most 8 lines, for an Indian household's daily electricity plan. ` +
            "You must use ONLY the numbers given below -- never invent a rupee figure, a time, or a risk level. " +
            "List the actions in order, each with its window and rupee saving if any, then one line on tonight's cut risk if not low, " +
            'then close with "Reply DONE after each, or ask me anything." (translated). Numbers:\n' +
            JSON.stringify(plan),
        },
      ],
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }

  async answerQuestion(question: string, context: QaContext, language: Language): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            `Answer this household's question in ${LANGUAGE_NAMES[language]}, in one short line, using ONLY the plan data given ` +
            "(never invent a number, time or risk level not present in it). Question: " +
            `"${question}". Current hour: ${context.currentHour}. Plan data:\n` +
            JSON.stringify(context.plan),
        },
      ],
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
}
