import { useEffect, useState } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import type { ImpactTotals } from "./types";

export function Impact() {
  const [impact, setImpact] = useState<ImpactTotals | null>(null);

  useEffect(() => {
    const load = () => api.getImpact().then(setImpact);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!impact) return <div style={{ padding: "1rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginTop: 0 }}>National impact counter</h2>
      <p style={{ color: "#666" }}>Millions of small shifts are how India gets through its evening peak. Here's what's logged so far.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem", marginTop: "1rem" }}>
        <Stat label="Households" value={impact.householdCount} />
        <Stat label="Rupees saved" value={`₹${impact.totalRupeesSaved}`} badge="user-reported" />
        <Stat label="kWh moved out of peak" value={impact.totalKWhMovedOutOfPeak} badge="user-reported" />
        <Stat label="CO₂ avoided (kg)" value={impact.totalCo2AvoidedKg} badge="user-reported" />
      </div>

      <div style={{ marginTop: "1.5rem", background: "#f3edff", borderRadius: "0.6rem", padding: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>
          Projected, at national scale
          <DataLabelBadge label="projection" />
        </h3>
        <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0.3rem 0" }}>
          {Math.round(impact.projectedNationalKWhPerDay.value).toLocaleString("en-IN")} kWh/day
        </p>
        <p style={{ fontSize: "0.8rem", color: "#555" }}>{impact.projectedNationalKWhPerDay.note}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, badge }: { label: string; value: number | string; badge?: any }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: "0.6rem", padding: "0.8rem" }}>
      <div style={{ fontSize: "0.75rem", color: "#666" }}>
        {label}
        {badge && <DataLabelBadge label={badge} />}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
