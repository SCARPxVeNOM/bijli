import type { Bill, Language, PlanNumbers } from "@bijli/domain";
import type { LLMProvider, QaContext } from "./types.js";

function formatHour(h: number): string {
  const hour24 = ((h % 24) + 24) % 24;
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${period}`;
}

/**
 * Deterministic, template-based provider used by default so the whole app
 * runs offline with zero external accounts. Swap in AnthropicProvider by
 * setting ANTHROPIC_API_KEY.
 */
export class MockLLMProvider implements LLMProvider {
  name = "mock";

  async readBill(): Promise<Partial<Bill>> {
    // No real OCR available offline: return a plausible sample the user must
    // confirm/edit in the UI, clearly labelled as a guess.
    const today = new Date();
    const periodEnd = today.toISOString().slice(0, 10);
    const periodStartDate = new Date(today);
    periodStartDate.setDate(periodStartDate.getDate() - 30);
    return {
      unitsKWh: 350,
      amountRupees: 3150,
      periodStart: periodStartDate.toISOString().slice(0, 10),
      periodEnd,
      tariffCategory: "Domestic",
      meterType: "unknown",
      confirmed: false,
      label: "estimated",
    };
  }

  async writeDailyMessage(plan: PlanNumbers, _language: Language): Promise<string> {
    const lines: string[] = [];
    lines.push(`Tomorrow — cheap hours ${formatHour(plan.cheapWindow.startHour)}–${formatHour(plan.cheapWindow.endHour)}`);
    plan.actions.forEach((a, i) => {
      const savings = a.estSavingsRupees > 0 ? ` → saves ₹${a.estSavingsRupees}` : "";
      lines.push(`${i + 1}. ${a.action}${savings}`);
    });
    if (plan.cutRisk.level !== "low") {
      lines.push(
        `Tonight: cut risk ${plan.cutRisk.level.toUpperCase()}, ${formatHour(plan.cutRisk.windowStartHour)}–${formatHour(plan.cutRisk.windowEndHour)}. Pre-cool a room and charge devices before then.`
      );
    }
    lines.push("Reply DONE after each, or ask me anything.");
    return lines.slice(0, 8).join("\n");
  }

  async answerQuestion(question: string, context: QaContext, _language: Language): Promise<string> {
    const q = question.toLowerCase();
    const keywordMap: Record<string, string[]> = {
      ev_scooter: ["scooter", "ev", "bike"],
      ev_car: ["car", "ev"],
      water_pump: ["pump", "water"],
      washing_machine: ["washing", "wash", "laundry"],
      geyser: ["geyser", "heater", "hot water"],
      ac: ["ac", "air conditioner", "aircon"],
    };
    const matchedType = Object.entries(keywordMap).find(([, kws]) => kws.some((k) => q.includes(k)))?.[0];
    const action = context.plan.actions.find((a) => a.applianceType === matchedType);

    if (!action) {
      return `I don't have a specific move for that yet. Cheap hours tomorrow are ${formatHour(context.plan.cheapWindow.startHour)}–${formatHour(context.plan.cheapWindow.endHour)}, and tonight's cut risk is ${context.plan.cutRisk.level}.`;
    }

    const inWindow = context.currentHour >= action.windowStartHour && context.currentHour < action.windowEndHour;
    if (inWindow) {
      return `Yes, go ahead now — you're inside the recommended ${formatHour(action.windowStartHour)}–${formatHour(action.windowEndHour)} window (saves ~₹${action.estSavingsRupees}).`;
    }
    return `Better to wait for ${formatHour(action.windowStartHour)}–${formatHour(action.windowEndHour)} — that's the cheaper${action.isGreen ? ", cleaner" : ""} window (saves ~₹${action.estSavingsRupees}).`;
  }
}
