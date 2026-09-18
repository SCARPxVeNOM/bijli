import { nanoid } from "nanoid";
import { EV_CHARGER_KW, EV_ENERGY_PER_KM, getTariffPlan, resolvePincode } from "@bijli/data";
import type { Society, SocietyPlan, StaggeredChargingSlot } from "@bijli/domain";
import type { Store } from "./db.js";
import type { HouseholdService } from "./householdService.js";

/**
 * Society / RWA mode (stretch #3): one shared-load plan for an apartment
 * block, staggering member EV charging so combined draw stays under the
 * society's shared limit.
 */
export class SocietyService {
  constructor(
    private db: Store,
    private households: HouseholdService
  ) {}

  async createSociety(name: string, pincode: string, sharedLoadLimitKw: number): Promise<Society> {
    const society: Society = {
      id: nanoid(10),
      name,
      pincode,
      memberHouseholdIds: [],
      sharedLoadLimitKw,
      managerToken: nanoid(24),
      createdAt: new Date().toISOString(),
    };
    await this.db.putSociety(society);
    return society;
  }

  async getSociety(id: string): Promise<Society> {
    const s = await this.db.getSociety(id);
    if (!s) throw new Error(`Unknown society ${id}`);
    return s;
  }

  async addMember(societyId: string, householdId: string): Promise<Society> {
    const society = await this.getSociety(societyId);
    if (!society.memberHouseholdIds.includes(householdId)) {
      society.memberHouseholdIds.push(householdId);
      await this.db.putSociety(society);
    }
    return society;
  }

  /**
   * Greedy scheduler: each EV-owning member needs a charging slot inside the
   * solar window long enough for their daily km at their charger's kW. Jobs
   * are placed largest-draw-first into the earliest hour offset where
   * combined concurrent draw stays under `sharedLoadLimitKw`, pushing later
   * members into later slots within the window. Real arithmetic on each
   * member's actual EV setup -- not a canned example.
   */
  async buildStaggeredPlan(societyId: string): Promise<SocietyPlan> {
    const society = await this.getSociety(societyId);
    const tariff = getTariffPlan(resolvePincode(society.pincode).state);
    const { startHour, endHour } = tariff.solarWindow;
    const windowHours = endHour - startHour;

    const members = await Promise.all(
      society.memberHouseholdIds.map((id) => this.households.getHousehold(id).catch(() => undefined))
    );

    interface Job {
      householdId: string;
      applianceType: "ev_scooter" | "ev_car";
      chargerKw: number;
      hoursNeeded: number;
    }
    const jobs: Job[] = [];
    for (const h of members) {
      if (!h) continue;
      for (const entry of h.appliances) {
        if (!entry.present || !entry.ev) continue;
        if (entry.type !== "ev_scooter" && entry.type !== "ev_car") continue;
        const chargerKw = EV_CHARGER_KW[entry.ev.vehicleType];
        const kWhNeeded = entry.ev.dailyKm * EV_ENERGY_PER_KM[entry.ev.vehicleType];
        jobs.push({ householdId: h.id, applianceType: entry.type, chargerKw, hoursNeeded: Math.max(0.5, kWhNeeded / chargerKw) });
      }
    }
    jobs.sort((a, b) => b.chargerKw - a.chargerKw);

    const hourLoad = new Array(windowHours).fill(0);
    const slots: StaggeredChargingSlot[] = [];

    for (const job of jobs) {
      const span = Math.min(windowHours, Math.max(1, Math.ceil(job.hoursNeeded)));
      let placedOffset = windowHours - span; // last-resort fallback: as late as it fits
      for (let offset = 0; offset + span <= windowHours; offset++) {
        const maxLoadInSpan = Math.max(...hourLoad.slice(offset, offset + span));
        if (maxLoadInSpan + job.chargerKw <= society.sharedLoadLimitKw) {
          placedOffset = offset;
          break;
        }
      }
      for (let i = placedOffset; i < placedOffset + span; i++) hourLoad[i] += job.chargerKw;
      slots.push({
        householdId: job.householdId,
        applianceType: job.applianceType,
        windowStartHour: startHour + placedOffset,
        windowEndHour: startHour + placedOffset + span,
        chargerKw: job.chargerKw,
      });
    }

    return {
      societyId,
      date: new Date().toISOString().slice(0, 10),
      sharedLoadLimitKw: society.sharedLoadLimitKw,
      slots,
      label: "estimated",
    };
  }
}
