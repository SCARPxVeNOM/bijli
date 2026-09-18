import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import {
  APPLIANCE_LABELS,
  type ApplianceShare,
  type DailyPlan,
  type Household,
  type LiveSmartPlugReading,
  type SavingsSummary,
  type SmartMeterReading,
} from "./types";

export function Dashboard({ householdId }: { householdId: string | null }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [shares, setShares] = useState<ApplianceShare[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [smartPlug, setSmartPlug] = useState<LiveSmartPlugReading | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function refreshBreakdown() {
    if (!householdId) return;
    api.getBreakdown(householdId).then(setShares).catch(() => {});
  }

  useEffect(() => {
    if (!householdId) return;
    api.getHousehold(householdId).then(setHousehold);
    refreshBreakdown();
    api.getPlan(householdId).then(setPlan).catch(() => {});
    api.getSavings(householdId).then(setSavings);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    const load = () => api.getSmartPlugLatest(householdId).then(setSmartPlug).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [householdId]);

  function parseSmartMeterCsv(text: string): SmartMeterReading[] {
    // Expected columns: date,kWh[,applianceType]
    return text
      .trim()
      .split("\n")
      .slice(1) // header row
      .filter((line) => line.trim())
      .map((line) => {
        const [date, kWh, applianceType] = line.split(",").map((c) => c.trim());
        return applianceType ? { date, kWh: Number(kWh), applianceType: applianceType as any } : { date, kWh: Number(kWh) };
      });
  }

  async function handleCsvUpload(file: File) {
    if (!householdId) return;
    const text = await file.text();
    const readings = parseSmartMeterCsv(text);
    await api.importSmartMeter(householdId, readings);
    setImportMessage(`Imported ${readings.length} smart meter reading(s) -- breakdown now anchored to real data.`);
    refreshBreakdown();
  }

  if (!householdId) return <div style={{ padding: "1rem", color: "#666" }}>Start a chat first to see your dashboard.</div>;
  if (!household) return <div style={{ padding: "1rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginTop: 0 }}>Your household</h2>
      {household.bill && (
        <section style={card}>
          <h3>Bill</h3>
          <p>
            {household.bill.unitsKWh} kWh &middot; ₹{household.bill.amountRupees}
            <DataLabelBadge label={household.bill.label} />
          </p>
        </section>
      )}

      <section style={card}>
        <h3>Appliance spending breakdown</h3>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <button style={{ fontSize: "0.8rem" }} onClick={() => fileInput.current?.click()}>
            Import smart meter CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvUpload(file);
              e.target.value = "";
            }}
          />
          <span style={{ fontSize: "0.75rem", color: "#666" }}>Columns: date,kWh[,applianceType]</span>
        </div>
        {importMessage && <p style={{ fontSize: "0.8rem", color: "#1a7f37" }}>{importMessage}</p>}
        {shares.length === 0 && <p style={{ color: "#666" }}>No appliances yet.</p>}
        {shares.map((s) => (
          <div key={s.type} style={{ margin: "0.4rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{APPLIANCE_LABELS[s.type]}</span>
              <span>
                {s.shareOfBillPercent[0]}–{s.shareOfBillPercent[1]}%<DataLabelBadge label={s.label} />
              </span>
            </div>
            <div style={{ background: "#eee", borderRadius: "4px", height: "8px", marginTop: "2px" }}>
              <div
                style={{
                  width: `${Math.min(s.shareOfBillPercent[1], 100)}%`,
                  background: "#25d366",
                  height: "100%",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>
        ))}
      </section>

      {plan && (
        <section style={card}>
          <h3>Tomorrow's cheap window</h3>
          <p>
            {plan.cheapWindow.startHour}:00 – {plan.cheapWindow.endHour}:00
            <DataLabelBadge label={plan.cheapWindow.label} />
          </p>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>{plan.cheapWindow.reason}</p>
          <h3>Tonight's cut risk</h3>
          <p>
            {plan.cutRisk.level.toUpperCase()} ({plan.cutRisk.windowStartHour}:00–{plan.cutRisk.windowEndHour}:00)
            <DataLabelBadge label={plan.cutRisk.label} />
          </p>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>{plan.cutRisk.reason}</p>
        </section>
      )}

      <section style={card}>
        <h3>
          Live-metered appliance
          <DataLabelBadge label="user-reported" />
        </h3>
        {smartPlug ? (
          <p>
            <b>{APPLIANCE_LABELS[smartPlug.applianceType]}</b>: {smartPlug.watts} W (as of {new Date(smartPlug.timestamp).toLocaleTimeString()})
          </p>
        ) : (
          <p style={{ color: "#666", fontSize: "0.85rem" }}>
            No live-metered device connected. POST to <code>/households/:id/smart-plug/reading</code> from a real smart
            plug's local API to light this up -- untested without hardware in this environment.
          </p>
        )}
      </section>

      {savings && (
        <section style={card}>
          <h3>Savings so far</h3>
          <p>
            ₹{savings.totalRupeesSaved} saved &middot; {savings.totalKWhMovedOutOfPeak} kWh moved out of the peak &middot;{" "}
            {savings.totalCo2AvoidedKg} kg CO₂ avoided
            <DataLabelBadge label={savings.label} />
          </p>
        </section>
      )}
    </div>
  );
}

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: "0.6rem",
  padding: "0.8rem 1rem",
  marginBottom: "0.8rem",
};
