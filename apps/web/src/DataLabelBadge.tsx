import type { DataLabel } from "./types";

const COLORS: Record<DataLabel, string> = {
  real: "#1a7f37",
  estimated: "#9a6700",
  "user-reported": "#0969da",
  projection: "#8250df",
  modelled: "#bf3989",
};

const TEXT: Record<DataLabel, string> = {
  real: "Real",
  estimated: "Estimated",
  "user-reported": "User-reported",
  projection: "Projection",
  modelled: "Modelled",
};

export function DataLabelBadge({ label }: { label: DataLabel }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.65rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "#fff",
        background: COLORS[label],
        borderRadius: "999px",
        padding: "0.1rem 0.5rem",
        marginLeft: "0.4rem",
      }}
    >
      {TEXT[label]}
    </span>
  );
}
