import { useEffect, useState, type CSSProperties } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import {
  APPLIANCE_LABELS,
  SUPPORTED_LANGUAGES,
  type ApplianceEntry,
  type ApplianceType,
  type Bill,
  type DailyPlan,
  type EvDetails,
  type Household,
} from "./types";

type LogEntry = { from: "bot" | "user"; text: string };

const SHIFTABLE_TYPES: ApplianceType[] = ["ev_scooter", "ev_car", "water_pump", "washing_machine", "geyser", "ac"];
const ALWAYS_ON_TYPES: ApplianceType[] = ["fridge", "fan", "lights", "wifi"];

function Bubble({ entry }: { entry: LogEntry }) {
  return (
    <div style={{ display: "flex", justifyContent: entry.from === "user" ? "flex-end" : "flex-start", margin: "0.4rem 0" }}>
      <div
        style={{
          maxWidth: "80%",
          whiteSpace: "pre-wrap",
          background: entry.from === "user" ? "#dcf8c6" : "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "0.8rem",
          padding: "0.55rem 0.8rem",
          fontSize: "0.92rem",
          lineHeight: 1.4,
        }}
      >
        {entry.text}
      </div>
    </div>
  );
}

export function Chat({ householdId, onHouseholdId }: { householdId: string | null; onHouseholdId: (id: string) => void }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (householdId) {
      api.getHousehold(householdId).then(setHousehold).catch(() => onHouseholdId(""));
    }
  }, [householdId]);

  useEffect(() => {
    if (household?.conversationState === "onboarded") {
      api.getPlan(household.id).then((p) => {
        setPlan(p);
        setLog((l) => (l.some((e) => e.text === p.messageText) ? l : [...l, { from: "bot", text: p.messageText }]));
      });
    }
  }, [household?.conversationState]);

  function push(entries: LogEntry[]) {
    setLog((l) => [...l, ...entries]);
  }

  async function say() {
    setBusy(true);
    push([{ from: "user", text: "Hi" }]);
    const h = await api.startHousehold(`web-${Math.random().toString(36).slice(2, 8)}`);
    onHouseholdId(h.id);
    setHousehold(h);
    push([{ from: "bot", text: "Namaste! Welcome to BijliSaathi. Which language would you like?" }]);
    setBusy(false);
  }

  if (!household) {
    return (
      <div style={styles.panel}>
        <p style={{ color: "#555" }}>Scan the QR code or tap below to start, just like sending "Hi" on WhatsApp.</p>
        <button disabled={busy} onClick={say} style={styles.primaryBtn}>
          Say "Hi" to BijliSaathi
        </button>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.log}>
        {log.map((e, i) => (
          <Bubble key={i} entry={e} />
        ))}
        {household.conversationState === "ask_language" && (
          <LanguageStep
            onPick={async (lang) => {
              push([{ from: "user", text: SUPPORTED_LANGUAGES.find((l) => l.code === lang)!.name }]);
              const h = await api.setLanguage(household.id, lang);
              setHousehold(h);
              push([{ from: "bot", text: "Great. What's your pincode? This sets your tariff and weather." }]);
            }}
          />
        )}
        {household.conversationState === "ask_pincode" && (
          <PincodeStep
            onSubmit={async (pincode) => {
              push([{ from: "user", text: pincode }]);
              const h = await api.setPincode(household.id, pincode);
              setHousehold(h);
              push([{ from: "bot", text: "Thanks. Send a photo of your latest electricity bill, or enter it manually." }]);
            }}
          />
        )}
        {household.conversationState === "ask_bill" && !household.bill && (
          <BillStep
            onSubmit={async (opts) => {
              push([{ from: "user", text: opts.file ? "🖼️ (bill photo)" : "Entered bill manually" }]);
              const h = opts.file ? await api.submitBillImage(household.id, opts.file) : await api.submitBillManual(household.id, opts.manual!);
              setHousehold(h);
              push([{ from: "bot", text: "Here's what I read from your bill. Please confirm or correct it." }]);
            }}
          />
        )}
        {household.conversationState === "ask_bill" && household.bill && !household.bill.confirmed && (
          <BillConfirmStep
            bill={household.bill}
            onConfirm={async (corrections) => {
              const h = await api.confirmBill(household.id, corrections);
              setHousehold(h);
              push([
                { from: "user", text: "Confirmed" },
                { from: "bot", text: "Now tap the appliances your home runs." },
              ]);
            }}
          />
        )}
        {household.conversationState === "ask_appliances" && (
          <AppliancesStep
            onSubmit={async (appliances, rooftopSolarKw) => {
              push([{ from: "user", text: `Appliances: ${appliances.filter((a) => a.present).map((a) => APPLIANCE_LABELS[a.type]).join(", ")}` }]);
              if (rooftopSolarKw > 0) await api.setRooftopSolar(household.id, rooftopSolarKw);
              const { plan: firstPlan } = await api.setAppliances(household.id, appliances);
              const h = await api.getHousehold(household.id);
              setHousehold(h);
              setPlan(firstPlan);
              push([{ from: "bot", text: firstPlan.messageText }]);
            }}
          />
        )}
        {household.conversationState === "onboarded" && plan && (
          <OnboardedControls
            householdId={household.id}
            plan={plan}
            onAsk={(q, a) => push([{ from: "user", text: q }, { from: "bot", text: a }])}
            onDone={(text) => push([{ from: "bot", text }])}
            onOutage={() => push([{ from: "bot", text: "Got it — logged your power cut report." }])}
            onRegenerate={(p) => {
              setPlan(p);
              push([{ from: "bot", text: p.messageText }]);
            }}
          />
        )}
      </div>
    </div>
  );
}

function LanguageStep({ onPick }: { onPick: (lang: any) => void }) {
  return (
    <div style={styles.controls}>
      {SUPPORTED_LANGUAGES.map((l) => (
        <button key={l.code} style={styles.chipBtn} onClick={() => onPick(l.code)}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

function PincodeStep({ onSubmit }: { onSubmit: (pincode: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div style={styles.controls}>
      <input style={styles.input} placeholder="6-digit pincode" value={value} onChange={(e) => setValue(e.target.value)} />
      <button style={styles.primaryBtn} disabled={value.length !== 6} onClick={() => onSubmit(value)}>
        Send
      </button>
    </div>
  );
}

function BillStep({ onSubmit }: { onSubmit: (opts: { file?: File; manual?: Partial<Bill> }) => void }) {
  const [mode, setMode] = useState<"photo" | "manual">("photo");
  const [units, setUnits] = useState("350");
  const [amount, setAmount] = useState("3150");

  return (
    <div style={styles.controls}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <button style={mode === "photo" ? styles.chipBtnActive : styles.chipBtn} onClick={() => setMode("photo")}>
          Send photo
        </button>
        <button style={mode === "manual" ? styles.chipBtnActive : styles.chipBtn} onClick={() => setMode("manual")}>
          Enter manually
        </button>
      </div>
      {mode === "photo" ? (
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSubmit({ file });
          }}
        />
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input style={styles.input} placeholder="Units (kWh)" value={units} onChange={(e) => setUnits(e.target.value)} />
          <input style={styles.input} placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button
            style={styles.primaryBtn}
            onClick={() =>
              onSubmit({
                manual: {
                  unitsKWh: Number(units),
                  amountRupees: Number(amount),
                  periodStart: "",
                  periodEnd: "",
                  tariffCategory: "Domestic",
                  meterType: "unknown",
                },
              })
            }
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

function BillConfirmStep({ bill, onConfirm }: { bill: Bill; onConfirm: (corrections?: Partial<Bill>) => void }) {
  const [units, setUnits] = useState(String(bill.unitsKWh));
  const [amount, setAmount] = useState(String(bill.amountRupees));
  return (
    <div style={{ ...styles.controls, background: "#fffbe6", padding: "0.6rem", borderRadius: "0.6rem" }}>
      <div style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
        Units: <b>{units}</b> kWh, Amount: <b>₹{amount}</b>
        <DataLabelBadge label={bill.label} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input style={styles.input} value={units} onChange={(e) => setUnits(e.target.value)} />
        <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button style={styles.primaryBtn} onClick={() => onConfirm({ unitsKWh: Number(units), amountRupees: Number(amount) })}>
          Confirm
        </button>
      </div>
    </div>
  );
}

function AppliancesStep({ onSubmit }: { onSubmit: (appliances: ApplianceEntry[], rooftopSolarKw: number) => void }) {
  const [selected, setSelected] = useState<Set<ApplianceType>>(new Set());
  const [rooftopSolarKw, setRooftopSolarKw] = useState("0");
  const [ev, setEv] = useState<EvDetails>({
    vehicleType: "e_scooter",
    chargerType: "Standard",
    dailyKm: 20,
    parkedDaytime: "home",
    departureTime: "09:00",
    officeHasCharger: false,
  });

  function toggle(type: ApplianceType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        if (type === "ev_scooter") next.delete("ev_car");
        if (type === "ev_car") next.delete("ev_scooter");
        next.add(type);
      }
      return next;
    });
  }

  const hasEv = selected.has("ev_scooter") || selected.has("ev_car");

  function submit() {
    const appliances: ApplianceEntry[] = [...SHIFTABLE_TYPES, ...ALWAYS_ON_TYPES].map((type) => ({
      type,
      present: selected.has(type),
      ev: (type === "ev_scooter" || type === "ev_car") && selected.has(type) ? { ...ev, vehicleType: type === "ev_car" ? "car" : "e_scooter" } : undefined,
    }));
    onSubmit(appliances, Number(rooftopSolarKw) || 0);
  }

  return (
    <div style={styles.controls}>
      <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: "0.2rem" }}>Shiftable loads</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {SHIFTABLE_TYPES.map((t) => (
          <button key={t} style={selected.has(t) ? styles.chipBtnActive : styles.chipBtn} onClick={() => toggle(t)}>
            {APPLIANCE_LABELS[t]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: "0.8rem", color: "#666", margin: "0.5rem 0 0.2rem" }}>Always-on (not suggested)</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {ALWAYS_ON_TYPES.map((t) => (
          <button key={t} style={selected.has(t) ? styles.chipBtnActive : styles.chipBtn} onClick={() => toggle(t)}>
            {APPLIANCE_LABELS[t]}
          </button>
        ))}
      </div>

      {hasEv && (
        <div style={{ marginTop: "0.6rem", background: "#eef6ff", padding: "0.6rem", borderRadius: "0.6rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#333", marginBottom: "0.3rem" }}>EV details</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <label>
              Daily km:
              <input
                style={{ ...styles.input, width: "5rem" }}
                type="number"
                value={ev.dailyKm}
                onChange={(e) => setEv({ ...ev, dailyKm: Number(e.target.value) })}
              />
            </label>
            <label>
              Parked daytime:
              <select value={ev.parkedDaytime} onChange={(e) => setEv({ ...ev, parkedDaytime: e.target.value as EvDetails["parkedDaytime"] })}>
                <option value="home">Home</option>
                <option value="office">Office</option>
                <option value="varies">Varies</option>
              </select>
            </label>
            {ev.parkedDaytime === "office" && (
              <label>
                Office has charger?
                <input type="checkbox" checked={ev.officeHasCharger} onChange={(e) => setEv({ ...ev, officeHasCharger: e.target.checked })} />
              </label>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: "0.6rem" }}>
        <label style={{ fontSize: "0.8rem", color: "#333" }}>
          Rooftop solar? Panel capacity (kW, 0 if none):{" "}
          <input
            style={{ ...styles.input, width: "4rem", display: "inline-block" }}
            type="number"
            min="0"
            step="0.5"
            value={rooftopSolarKw}
            onChange={(e) => setRooftopSolarKw(e.target.value)}
          />
        </label>
      </div>

      <button style={{ ...styles.primaryBtn, marginTop: "0.6rem" }} onClick={submit} disabled={selected.size === 0}>
        Get my plan
      </button>
    </div>
  );
}

function OnboardedControls({
  householdId,
  plan,
  onAsk,
  onDone,
  onOutage,
  onRegenerate,
}: {
  householdId: string;
  plan: DailyPlan;
  onAsk: (q: string, a: string) => void;
  onDone: (text: string) => void;
  onOutage: () => void;
  onRegenerate: (p: DailyPlan) => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [speechState, setSpeechState] = useState<"idle" | "loading" | "unavailable">("idle");

  async function listen() {
    setSpeechState("loading");
    try {
      const { audioBase64, mimeType } = await api.getPlanSpeech(householdId);
      const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      new Audio(url).play();
      setSpeechState("idle");
    } catch {
      setSpeechState("unavailable");
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    const { answer } = await api.ask(householdId, question);
    onAsk(question, answer);
    setQuestion("");
    setBusy(false);
  }

  return (
    <div style={styles.controls}>
      <div style={{ fontSize: "0.8rem", color: "#666", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span>
          Tonight's cut risk: <b>{plan.cutRisk.level.toUpperCase()}</b>
          <DataLabelBadge label={plan.cutRisk.label} />
        </span>
        {speechState !== "unavailable" && (
          <button style={styles.chipBtn} disabled={speechState === "loading"} onClick={listen}>
            🔊 {speechState === "loading" ? "Loading..." : "Listen"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.4rem 0" }}>
        {plan.actions.map((a) => (
          <button
            key={a.applianceType}
            style={styles.chipBtn}
            onClick={async () => {
              await api.logDone(householdId, a.applianceType);
              onDone(`Logged: ${APPLIANCE_LABELS[a.applianceType]} done ✓ (₹${a.estSavingsRupees} saved)`);
            }}
          >
            DONE: {APPLIANCE_LABELS[a.applianceType]}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          style={styles.input}
          placeholder='Ask e.g. "Can I run the washing machine now?"'
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button style={styles.primaryBtn} disabled={busy} onClick={ask}>
          Ask
        </button>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button
          style={styles.chipBtn}
          onClick={async () => {
            await api.reportOutage(householdId);
            onOutage();
          }}
        >
          ⚡ Power's out
        </button>
        <button
          style={styles.chipBtn}
          onClick={async () => {
            const p = await api.regeneratePlan(householdId);
            onRegenerate(p);
          }}
        >
          Run pipeline now
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", height: "100%" },
  log: { flex: 1, overflowY: "auto", padding: "0.5rem" },
  controls: { padding: "0.5rem" },
  input: { padding: "0.4rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #ccc", flex: 1 },
  primaryBtn: {
    background: "#25d366",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    padding: "0.45rem 0.9rem",
    cursor: "pointer",
    fontWeight: 600,
  },
  chipBtn: {
    background: "#fff",
    border: "1px solid #25d366",
    color: "#128c4a",
    borderRadius: "999px",
    padding: "0.35rem 0.8rem",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  chipBtnActive: {
    background: "#25d366",
    border: "1px solid #25d366",
    color: "#fff",
    borderRadius: "999px",
    padding: "0.35rem 0.8rem",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
};
