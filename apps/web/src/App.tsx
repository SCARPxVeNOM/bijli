import { useState } from "react";
import { Backtest } from "./Backtest";
import { Chat } from "./Chat";
import { Dashboard } from "./Dashboard";
import { Impact } from "./Impact";
import { OutageMap } from "./OutageMap";
import { Society } from "./Society";

type Tab = "chat" | "dashboard" | "impact" | "backtest" | "outages" | "society";

const TAB_LABELS: Record<Tab, string> = {
  chat: "Chat",
  dashboard: "Dashboard",
  impact: "Impact",
  backtest: "Backtest",
  outages: "Outage Map",
  society: "Society",
};

export default function App() {
  const [householdId, setHouseholdId] = useState<string | null>(() => localStorage.getItem("bijli.householdId"));
  const [tab, setTab] = useState<Tab>("chat");

  function updateHouseholdId(id: string) {
    setHouseholdId(id || null);
    if (id) localStorage.setItem("bijli.householdId", id);
    else localStorage.removeItem("bijli.householdId");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          background: "#075e54",
          color: "#fff",
          padding: "0.7rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <strong>BijliSaathi</strong>
        <nav style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#075e54" : "#fff",
                border: "1px solid #fff",
                borderRadius: "999px",
                padding: "0.3rem 0.7rem",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ flex: 1, minHeight: 0, background: "#e5ddd5" }}>
        {tab === "chat" && <Chat householdId={householdId} onHouseholdId={updateHouseholdId} />}
        {tab === "dashboard" && <Dashboard householdId={householdId} />}
        {tab === "impact" && <Impact />}
        {tab === "backtest" && <Backtest />}
        {tab === "outages" && <OutageMap />}
        {tab === "society" && <Society />}
      </main>
    </div>
  );
}
