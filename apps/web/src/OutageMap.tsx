import { useEffect, useState, type CSSProperties } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import type { OutageReportWithLocation } from "./types";

const WIDTH = 700;
const HEIGHT = 420;
const PAD = 40;

export function OutageMap() {
  const [reports, setReports] = useState<OutageReportWithLocation[]>([]);

  useEffect(() => {
    const load = () => api.getOutages(24).then(setReports).catch(() => {});
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const byPincode = new Map<string, { lat: number; lon: number; city: string; count: number }>();
  for (const r of reports) {
    const existing = byPincode.get(r.pincode);
    if (existing) existing.count += 1;
    else byPincode.set(r.pincode, { lat: r.lat, lon: r.lon, city: r.city, count: 1 });
  }
  const points = Array.from(byPincode.entries()).map(([pincode, p]) => ({ pincode, ...p }));

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = lats.length ? Math.min(...lats) - 0.3 : 8;
  const maxLat = lats.length ? Math.max(...lats) + 0.3 : 30;
  const minLon = lons.length ? Math.min(...lons) - 0.3 : 68;
  const maxLon = lons.length ? Math.max(...lons) + 0.3 : 90;

  function project(lat: number, lon: number) {
    const x = PAD + ((lon - minLon) / Math.max(0.001, maxLon - minLon)) * (WIDTH - 2 * PAD);
    // Latitude increases northward; SVG y increases downward, so invert.
    const y = PAD + (1 - (lat - minLat) / Math.max(0.001, maxLat - minLat)) * (HEIGHT - 2 * PAD);
    return { x, y };
  }

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginTop: 0 }}>
        Live "power's out" map
        <DataLabelBadge label="user-reported" />
      </h2>
      <p style={{ color: "#666" }}>
        Real reports, real coordinates for the reporting pincode -- plotted on a plain lat/lon grid rather than a
        stylized India outline, since a shape drawn from just a handful of demo pincodes would be exactly the kind
        of fake precision the spec warns against.
      </p>

      <section style={card}>
        {points.length === 0 ? (
          <p style={{ color: "#666" }}>No outage reports in the last 24 hours.</p>
        ) : (
          <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Outage report map">
            <rect x={PAD} y={PAD} width={WIDTH - 2 * PAD} height={HEIGHT - 2 * PAD} fill="#f7f7f7" stroke="#ddd" />
            {points.map((p) => {
              const { x, y } = project(p.lat, p.lon);
              const r = 6 + Math.min(20, p.count * 4);
              return (
                <g key={p.pincode}>
                  <circle cx={x} cy={y} r={r} fill="#c0392b" opacity={0.35} />
                  <circle cx={x} cy={y} r={4} fill="#c0392b" />
                  <text x={x + r + 4} y={y + 4} fontSize="12" fill="#333">
                    {p.city} ({p.pincode}) ×{p.count}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </section>
    </div>
  );
}

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: "0.6rem",
  padding: "0.8rem 1rem",
};
