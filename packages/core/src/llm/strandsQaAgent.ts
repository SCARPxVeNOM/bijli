import { Agent, TextBlock, tool } from "@strands-agents/sdk";
import { GoogleModel } from "@strands-agents/sdk/models/google";
import { getTariffPlan } from "@bijli/data";
import type { Language } from "@bijli/domain";
import type { QaContext } from "./types.js";

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  mr: "Marathi",
  bn: "Bengali",
};

let cachedModel: GoogleModel | undefined;
function getModel(): GoogleModel {
  if (!cachedModel) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("STRANDS_QA requires GEMINI_API_KEY");
    cachedModel = new GoogleModel({ apiKey, modelId: process.env.GEMINI_MODEL || "gemini-3.6-flash" });
  }
  return cachedModel;
}

/**
 * Opt-in ask-anytime agent using AWS's Strands Agents SDK TypeScript preview
 * (stretch #7's experimental half) -- the spec's own suggestion for the
 * open-source track. Given explicit tools instead of one big prompt, so the
 * model has to call `lookupPlan`/`lookupTariff` rather than free-associate.
 * Never the default: `householdService.askQuestion` only reaches this when
 * STRANDS_QA=true, and any error here should fall back to the direct
 * Gemini call, since this SDK is explicitly preview/experimental.
 */
export async function answerWithStrands(question: string, context: QaContext, language: Language, state?: string): Promise<string> {
  const lookupPlan = tool({
    name: "lookupPlan",
    description: "Returns the household's already-decided daily plan: the cheap/clean window, tonight's cut-risk level, and the ranked shift actions with their rupee savings. This is the ONLY source of numbers you may use.",
    callback: () => context.plan,
  });

  const lookupTariff = tool({
    name: "lookupTariff",
    description: "Returns the household's state electricity tariff: normal rate, solar-hours discount, peak surcharge, and the ToD windows.",
    callback: () => getTariffPlan(state),
  });

  const agent = new Agent({
    model: getModel(),
    tools: [lookupPlan, lookupTariff],
    systemPrompt:
      `You are BijliSaathi's ask-anytime assistant. Answer in ${LANGUAGE_NAMES[language]}, in one short line. ` +
      "Call lookupPlan and/or lookupTariff first and answer using ONLY their data -- never invent a rupee figure, a time, or a risk level not present in what they return.",
    printer: false,
  });

  const result = await agent.invoke(`Current hour: ${context.currentHour}. Question: ${question}`);
  return result.lastMessage.content
    .filter((block): block is TextBlock => block instanceof TextBlock)
    .map((block) => block.text)
    .join(" ")
    .trim();
}
