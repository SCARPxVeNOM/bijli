import type { ApplianceEntry, ApplianceShare, Bill, DailyPlan, Household, ImpactTotals, Language, SavingsSummary } from "./types";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: options?.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  startHousehold: (phone: string) => req<Household>("/households", { method: "POST", body: JSON.stringify({ phone }) }),
  getHousehold: (id: string) => req<Household>(`/households/${id}`),
  setLanguage: (id: string, language: Language) =>
    req<Household>(`/households/${id}/language`, { method: "POST", body: JSON.stringify({ language }) }),
  setPincode: (id: string, pincode: string) =>
    req<Household>(`/households/${id}/pincode`, { method: "POST", body: JSON.stringify({ pincode }) }),
  submitBillManual: (id: string, manual: Partial<Bill>) =>
    req<Household>(`/households/${id}/bill`, { method: "POST", body: JSON.stringify({ manual }) }),
  submitBillImage: (id: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return req<Household>(`/households/${id}/bill`, { method: "POST", body: form });
  },
  confirmBill: (id: string, corrections?: Partial<Bill>) =>
    req<Household>(`/households/${id}/bill/confirm`, { method: "POST", body: JSON.stringify({ corrections }) }),
  setAppliances: (id: string, appliances: ApplianceEntry[]) =>
    req<{ household: Household; shares: ApplianceShare[]; plan: DailyPlan }>(`/households/${id}/appliances`, {
      method: "POST",
      body: JSON.stringify({ appliances }),
    }),
  getBreakdown: (id: string) => req<ApplianceShare[]>(`/households/${id}/breakdown`),
  getPlan: (id: string) => req<DailyPlan>(`/households/${id}/plan`),
  regeneratePlan: (id: string) => req<DailyPlan>(`/households/${id}/plan`, { method: "POST" }),
  ask: (id: string, question: string) => req<{ answer: string }>(`/households/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) }),
  logDone: (id: string, applianceType: string) =>
    req<any>(`/households/${id}/done`, { method: "POST", body: JSON.stringify({ applianceType }) }),
  reportOutage: (id: string) => req<{ ok: true }>(`/households/${id}/outage`, { method: "POST" }),
  getSavings: (id: string) => req<SavingsSummary>(`/households/${id}/savings`),
  getImpact: () => req<ImpactTotals>("/impact"),
};
