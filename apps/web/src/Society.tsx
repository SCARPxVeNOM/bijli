import { useEffect, useState, type CSSProperties } from "react";
import { api } from "./api";
import { DataLabelBadge } from "./DataLabelBadge";
import { APPLIANCE_LABELS } from "./types";
import type { Society as SocietyType, SocietyPlan } from "./types";

export function Society() {
  const [societyId, setSocietyId] = useState<string | null>(() => localStorage.getItem("bijli.societyId"));
  const [managerToken, setManagerToken] = useState<string | null>(() => localStorage.getItem("bijli.managerToken"));
  const [society, setSociety] = useState<SocietyType | null>(null);
  const [plan, setPlan] = useState<SocietyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(s: SocietyType, token: string) {
    setSocietyId(s.id);
    setManagerToken(token);
    setSociety(s);
    localStorage.setItem("bijli.societyId", s.id);
    localStorage.setItem("bijli.managerToken", token);
  }

  useEffect(() => {
    if (societyId && managerToken) {
      api
        .getSocietyPlan(societyId, managerToken)
        .then(setPlan)
        .catch((e) => setError(e.message));
    }
  }, [societyId, managerToken]);

  if (!societyId || !managerToken) {
    return <CreateSociety onCreated={save} />;
  }

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginTop: 0 }}>Society / RWA mode</h2>
      <p style={{ color: "#666" }}>
        One shared-load plan for the apartment block, staggering EV charging so combined draw stays under the shared
        limit -- authorized with Cedar: only this society's manager token can view or manage it.
      </p>

      {society && (
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>{society.name}</h3>
          <p>
            Shared load limit: <b>{society.sharedLoadLimitKw} kW</b> &middot; {society.memberHouseholdIds.length} member household(s)
          </p>
        </section>
      )}

      <AddMember societyId={societyId} managerToken={managerToken} onAdded={setSociety} />

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>
          Today's staggered EV plan
          {plan && <DataLabelBadge label={plan.label} />}
        </h3>
        {error && <p style={{ color: "#b00" }}>{error}</p>}
        {!plan && !error && <p style={{ color: "#666" }}>Loading...</p>}
        {plan && plan.slots.length === 0 && <p style={{ color: "#666" }}>No members with an EV yet.</p>}
        {plan?.slots.map((slot, i) => (
          <div key={i} style={{ padding: "0.4rem 0", borderBottom: "1px solid #f0f0f0" }}>
            Household <code>{slot.householdId}</code>: charge {APPLIANCE_LABELS[slot.applianceType]} ({slot.chargerKw} kW) at{" "}
            {slot.windowStartHour}:00–{slot.windowEndHour}:00
          </div>
        ))}
        <button
          style={{ marginTop: "0.6rem" }}
          onClick={() => api.getSocietyPlan(societyId, managerToken).then(setPlan).catch((e) => setError(e.message))}
        >
          Refresh plan
        </button>
      </section>
    </div>
  );
}

function CreateSociety({ onCreated }: { onCreated: (s: SocietyType, token: string) => void }) {
  const [name, setName] = useState("Sunrise Apartments");
  const [pincode, setPincode] = useState("400001");
  const [limit, setLimit] = useState("6");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const s = await api.createSociety(name, pincode, Number(limit));
      onCreated(s, s.managerToken);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Create a society</h2>
      <p style={{ color: "#666" }}>You become the manager -- save the token this returns, it's your only credential.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "320px" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Society name" />
        <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" />
        <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Shared load limit (kW)" type="number" />
        <button disabled={busy} onClick={submit}>
          Create
        </button>
      </div>
    </div>
  );
}

function AddMember({
  societyId,
  managerToken,
  onAdded,
}: {
  societyId: string;
  managerToken: string;
  onAdded: (s: SocietyType) => void;
}) {
  const [householdId, setHouseholdId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const s = await api.addSocietyMember(societyId, householdId.trim(), managerToken);
      onAdded(s);
      setHouseholdId("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section style={card}>
      <h3 style={{ marginTop: 0 }}>Add a member household</h3>
      <p style={{ fontSize: "0.8rem", color: "#666" }}>
        Find a household's ID from the Chat tab (it's shown in the address bar / stored locally after "Say Hi").
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input value={householdId} onChange={(e) => setHouseholdId(e.target.value)} placeholder="Household ID" />
        <button onClick={submit}>Add</button>
      </div>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
    </section>
  );
}

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: "0.6rem",
  padding: "0.8rem 1rem",
  marginBottom: "0.8rem",
};
