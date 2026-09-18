import type { Bill, Language, PlanNumbers } from "@bijli/domain";

export interface QaContext {
  plan: PlanNumbers;
  askedApplianceHint?: string;
  currentHour: number;
}

/**
 * Every LLM call in BijliSaathi goes through this interface. Implementations
 * must never invent a rupee figure, a time window, or a risk level -- those
 * always come from the calculators (planService, riskService, cheapHours).
 * The LLM's only job is turning already-decided numbers into words.
 */
export interface LLMProvider {
  name: string;
  readBill(imageBase64: string, mimeType: string): Promise<Partial<Bill>>;
  writeDailyMessage(plan: PlanNumbers, language: Language): Promise<string>;
  answerQuestion(question: string, context: QaContext, language: Language): Promise<string>;
}
