import type { DataLabel } from "@bijli/domain";

export interface WeatherForecast {
  date: string; // tomorrow, YYYY-MM-DD
  hourlyTempC: number[]; // 24 values
  hourlyCloudCoverPercent: number[]; // 24 values
  maxTempC: number;
  label: DataLabel;
  note?: string;
}

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Deterministic synthetic forecast for offline/sandboxed environments, seeded
 * by lat/lon so the same location always gets the same demo numbers. */
function syntheticForecast(lat: number, note: string): WeatherForecast {
  const seed = Math.abs(Math.round(lat * 1000)) % 10;
  const baseMax = 34 + seed; // hot Indian summer evening range
  const hourlyTempC = Array.from({ length: 24 }, (_, h) => {
    const swing = 6 * Math.sin(((h - 6) / 24) * Math.PI * 2);
    return Math.round((baseMax - 6 + swing) * 10) / 10;
  });
  const hourlyCloudCoverPercent = Array.from({ length: 24 }, (_, h) => {
    // Clearer at midday (good for solar), cloudier late afternoon.
    return h >= 9 && h <= 16 ? 10 + seed : 40 + seed;
  });
  return {
    date: tomorrowDateString(),
    hourlyTempC,
    hourlyCloudCoverPercent,
    maxTempC: Math.max(...hourlyTempC),
    label: "estimated",
    note,
  };
}

/** Real, free, no-key Open-Meteo forecast. Falls back to a labelled synthetic
 * forecast if the sandbox has no outbound network access. */
export async function fetchWeatherForecast(lat: number, lon: number): Promise<WeatherForecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,cloudcover&daily=temperature_2m_max&timezone=auto&forecast_days=2`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
    const json = await res.json();
    const date = tomorrowDateString();
    const times: string[] = json.hourly.time;
    const temps: number[] = json.hourly.temperature_2m;
    const clouds: number[] = json.hourly.cloudcover;

    const hourlyTempC: number[] = [];
    const hourlyCloudCoverPercent: number[] = [];
    for (let h = 0; h < 24; h++) {
      const idx = times.findIndex((t) => t.startsWith(date) && t.endsWith(`T${String(h).padStart(2, "0")}:00`));
      hourlyTempC.push(idx >= 0 ? temps[idx] : temps[temps.length - 1] ?? 30);
      hourlyCloudCoverPercent.push(idx >= 0 ? clouds[idx] : clouds[clouds.length - 1] ?? 30);
    }
    const dailyIdx = (json.daily.time as string[]).indexOf(date);
    const maxTempC = dailyIdx >= 0 ? json.daily.temperature_2m_max[dailyIdx] : Math.max(...hourlyTempC);

    return { date, hourlyTempC, hourlyCloudCoverPercent, maxTempC, label: "real" };
  } catch (err) {
    return syntheticForecast(lat, `Open-Meteo unreachable, using offline fallback (${(err as Error).message})`);
  }
}
