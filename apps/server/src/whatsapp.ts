// Real WhatsApp channel via Twilio's free WhatsApp Sandbox. Twilio calls our
// webhook synchronously on every inbound message and we reply in the same
// HTTP response as TwiML -- no outbound API call, no credentials needed for
// plain text. The only thing that needs TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
// is fetching a bill *photo* (Twilio's MediaUrl0 is Basic-Auth protected);
// without those two env vars set, the bot still works end to end, it just
// asks for bill figures as text instead of a photo.
//
// This mirrors the exact same conversation states the web Chat.tsx uses
// (Household.conversationState) and calls straight into HouseholdService --
// no separate business logic, just a text-menu transport on top of it.
import type { HouseholdService } from "@bijli/core";
import type { ApplianceEntry, ApplianceType, EvDetails, Language } from "@bijli/domain";

const LANGUAGE_MENU: { key: string; code: Language; label: string }[] = [
  { key: "1", code: "en", label: "English" },
  { key: "2", code: "hi", label: "Hindi" },
  { key: "3", code: "ta", label: "Tamil" },
  { key: "4", code: "mr", label: "Marathi" },
  { key: "5", code: "bn", label: "Bengali" },
];

const APPLIANCE_MENU: { key: string; type: ApplianceType; label: string }[] = [
  { key: "1", type: "ev_scooter", label: "E-scooter" },
  { key: "2", type: "ev_car", label: "Electric car" },
  { key: "3", type: "water_pump", label: "Water pump" },
  { key: "4", type: "washing_machine", label: "Washing machine" },
  { key: "5", type: "geyser", label: "Geyser" },
  { key: "6", type: "ac", label: "Air conditioner" },
];

const ALWAYS_ON_TYPES: ApplianceType[] = ["fridge", "fan", "lights", "wifi"];

const DEFAULT_EV: Omit<EvDetails, "vehicleType"> = {
  chargerType: "Standard",
  dailyKm: 20,
  parkedDaytime: "home",
  departureTime: "09:00",
  officeHasCharger: false,
};

function languageMenuText(): string {
  return (
    "Welcome to BijliSaathi! I'll send you daily advice on when power is cheapest and safest to use.\n\n" +
    "Which language do you prefer? Reply with a number:\n" +
    LANGUAGE_MENU.map((l) => `${l.key}) ${l.label}`).join("\n")
  );
}

function applianceMenuText(): string {
  return (
    "Last step -- which of these do you have? Reply with the numbers separated by commas (e.g. 1,4), or 0 for none:\n" +
    APPLIANCE_MENU.map((a) => `${a.key}) ${a.label}`).join("\n")
  );
}

function applianceLabel(type: ApplianceType): string {
  return APPLIANCE_MENU.find((a) => a.type === type)?.label ?? type.replace("_", " ");
}

function billPromptText(hasTwilioCreds: boolean): string {
  return hasTwilioCreds
    ? "Now send a photo of your latest electricity bill, or reply with units and amount like: 350,3150"
    : "What's your last bill? Reply with units and amount like: 350,3150";
}

async function fetchTwilioMedia(url: string): Promise<{ base64: string; mimeType: string } | undefined> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return undefined;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return undefined;
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType };
}

function buildAppliances(selectedKeys: string[]): ApplianceEntry[] {
  const selectedTypes = new Set(
    selectedKeys
      .map((k) => APPLIANCE_MENU.find((a) => a.key === k)?.type)
      .filter((t): t is ApplianceType => Boolean(t)),
  );
  // ev_scooter and ev_car are mutually exclusive, same rule as the web chat.
  if (selectedTypes.has("ev_scooter") && selectedTypes.has("ev_car")) selectedTypes.delete("ev_car");

  return [...APPLIANCE_MENU.map((a) => a.type), ...ALWAYS_ON_TYPES].map((type) => {
    const present = selectedTypes.has(type);
    const ev = present && (type === "ev_scooter" || type === "ev_car")
      ? { ...DEFAULT_EV, vehicleType: type === "ev_car" ? ("car" as const) : ("e_scooter" as const) }
      : undefined;
    return { type, present, ev };
  });
}

/** Handles one inbound WhatsApp message and returns the reply text to send back via TwiML. */
export async function handleIncomingWhatsApp(
  households: HouseholdService,
  from: string,
  body: string,
  media?: { url: string; contentType: string },
): Promise<string> {
  const text = body.trim();
  const hasTwilioCreds = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

  let household = await households.findHouseholdByPhone(from);
  if (!household) {
    household = await households.startHousehold(from);
    return languageMenuText();
  }

  switch (household.conversationState) {
    case "ask_language": {
      const choice = LANGUAGE_MENU.find((l) => l.key === text || l.label.toLowerCase() === text.toLowerCase());
      if (!choice) return `Sorry, I didn't get that.\n\n${languageMenuText()}`;
      await households.setLanguage(household.id, choice.code);
      return "Great. What's your 6-digit PIN code, so I can use your local tariff and weather?";
    }

    case "ask_pincode": {
      if (!/^\d{6}$/.test(text)) return "That doesn't look like a 6-digit PIN code. Please send just the 6 digits, e.g. 400001.";
      await households.setPincode(household.id, text);
      return billPromptText(hasTwilioCreds);
    }

    case "ask_bill": {
      if (household.bill && !household.bill.confirmed) {
        // We already read/parsed a bill and are waiting on confirmation.
        if (/^(y|yes|ok|confirm)$/i.test(text)) {
          await households.confirmBill(household.id);
          return applianceMenuText();
        }
        const manual = parseManualBill(text);
        if (manual) {
          await households.confirmBill(household.id, manual);
          return applianceMenuText();
        }
        return (
          `I read: ${household.bill.unitsKWh} units, Rs.${household.bill.amountRupees}.\n` +
          "Reply YES if that's correct, or send the correct units,amount."
        );
      }

      if (media?.url) {
        const fetched = await fetchTwilioMedia(media.url);
        if (!fetched) return "I couldn't read that photo. Please reply with units and amount instead, like: 350,3150";
        await households.submitBill(household.id, { imageBase64: fetched.base64, mimeType: fetched.mimeType });
        const h = await households.getHousehold(household.id);
        return (
          `I read: ${h.bill?.unitsKWh} units, Rs.${h.bill?.amountRupees}.\n` +
          "Reply YES if that's correct, or send the correct units,amount."
        );
      }

      const manual = parseManualBill(text);
      if (!manual) return billPromptText(hasTwilioCreds);
      await households.submitBill(household.id, { manual });
      await households.confirmBill(household.id);
      return applianceMenuText();
    }

    case "ask_appliances": {
      let keys: string[] = [];
      if (text !== "0") {
        keys = text.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length === 0 || !keys.every((k) => APPLIANCE_MENU.some((a) => a.key === k))) {
          return `Sorry, I didn't get that.\n\n${applianceMenuText()}`;
        }
      }
      const { plan } = await households.setAppliances(household.id, buildAppliances(keys));
      return `You're all set! Here's today's plan:\n\n${plan.messageText}\n\nAny day, just ask me a question, reply DONE <appliance> once you've shifted a load, or OUTAGE to report a power cut.`;
    }

    case "onboarded":
    default: {
      const lower = text.toLowerCase();
      if (/^(hi|hello|hey|plan)$/i.test(lower)) {
        const plan = await households.getTodayPlan(household.id);
        return plan.messageText;
      }
      if (/^outage$|power.?s out|power cut/i.test(lower)) {
        await households.reportOutage(household.id);
        return "Got it, logged your outage report. Thanks for helping us track the grid.";
      }
      if (lower.startsWith("done")) {
        const rest = lower.replace(/^done/, "").trim();
        const plan = await households.getTodayPlan(household.id);
        const match = plan.actions.find((a) => {
          const label = applianceLabel(a.applianceType).toLowerCase();
          const pattern = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
          return pattern.test(rest);
        });
        if (!match) {
          return `Which one? Reply DONE followed by: ${plan.actions.map((a) => applianceLabel(a.applianceType)).join(", ")}`;
        }
        await households.logDone(household.id, match.applianceType);
        return `Logged: ${applianceLabel(match.applianceType)} done. Est. savings Rs.${match.estSavingsRupees}.`;
      }
      return households.askQuestion(household.id, text);
    }
  }
}

function parseManualBill(text: string): { unitsKWh: number; amountRupees: number } | undefined {
  const m = text.match(/^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  return { unitsKWh: Number(m[1]), amountRupees: Number(m[2]) };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wraps a reply as the minimal TwiML Twilio expects back from the webhook. */
export function buildTwiMlReply(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(text)}</Message></Response>`;
}

/** Proactively pushes a message to a WhatsApp number via Twilio's REST API (used for the
 * daily 6pm plan push). No-ops with a log line if Twilio credentials aren't configured --
 * the web/API channels still work fine without this. */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    console.log(`[whatsapp] Twilio not configured, skipping proactive push to ${to}`);
    return;
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!res.ok) console.error(`[whatsapp] proactive push to ${to} failed: ${res.status} ${await res.text()}`);
}
