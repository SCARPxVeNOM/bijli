import { useEffect, useState, type CSSProperties } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import type { BacktestResult } from "./types";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const BAR_GAP = 2;

export function Backtest() {
  const [data, setData] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBacktest().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: "1rem", color: "#b00" }}>{error}</div>;
  if (!data) return <div style={{ padding: "1rem" }}>Loading...</div>;

  const maxDeficit = Math.max(1, ...data.hourlyDeficitGW);
  const barWidth = CHART_WIDTH / 24 - BAR_GAP;

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginTop: 0 }}>May 2026 heatwave backtest</h2>
      <p style={{ color: "#666" }}>
        The proof slide: what BijliSaathi's real pipeline (not a canned example) would have flagged, replayed against
        the spec's cited heatwave figures.
      </p>

      <section style={card}>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <Stat label="Peak demand met" value={`${data.scenario.peakDemandMetGW} GW`} badge={data.scenario.label} />
          <Stat label="Evening deficit" value={`${data.scenario.eveningDeficitGW} GW`} badge={data.scenario.label} />
          <Stat
            label="Deficit window"
            value={`${data.scenario.deficitWindow.startHour}:00–${data.scenario.deficitWindow.endHour}:00`}
            badge={data.scenario.label}
          />
        </div>
        <p style={{ fontSize: "0.8rem", color: "#666" }}>{data.scenario.note}</p>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Hourly evening deficit (GW)</h3>
        <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 24}`} role="img" aria-label="Hourly deficit chart">
          {data.hourlyDeficitGW.map((gw, hour) => {
            const height = (gw / maxDeficit) * CHART_HEIGHT;
            const x = hour * (barWidth + BAR_GAP);
            const inRiskWindow = hour >= data.cutRisk.windowStartHour && hour < data.cutRisk.windowEndHour;
            return (
              <g key={hour}>
                <rect
                  x={x}
                  y={CHART_HEIGHT - height}
                  width={barWidth}
                  height={height || 1}
                  fill={gw > 0 ? "#c0392b" : inRiskWindow ? "#f5c26b" : "#cfd8dc"}
                />
                {hour % 3 === 0 && (
                  <text x={x} y={CHART_HEIGHT + 16} fontSize="10" fill="#666">
                    {hour}:00
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p style={{ fontSize: "0.75rem", color: "#666" }}>
          Red = the cited evening deficit window. Amber = the pipeline's own modelled cut-risk window (may differ
          slightly, since it's computed independently from a reconstructed heatwave forecast).
        </p>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>
          What the pipeline would have sent
          <DataLabelBadge label={data.cutRisk.label} />
        </h3>
        <p>
          Cut risk: <b>{data.cutRisk.level.toUpperCase()}</b> ({data.cutRisk.windowStartHour}:00–{data.cutRisk.windowEndHour}:00)
        </p>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>{data.cutRisk.reason}</p>
        <h3>
          Cheap window
          <DataLabelBadge label={data.cheapWindow.label} />
        </h3>
        <p>
          {data.cheapWindow.startHour}:00–{data.cheapWindow.endHour}:00
        </p>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>{data.cheapWindow.reason}</p>
      </section>
    </div>
  );
}

function Stat({ label, value, badge }: { label: string; value: string; badge: any }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "#666" }}>
        {label}
        <DataLabelBadge label={badge} />
      </div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{value}</div>
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
