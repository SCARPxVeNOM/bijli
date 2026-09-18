import { getTariffPlan, MAY_2026_HEATWAVE_BACKTEST } from "@bijli/data";
import type { CheapWindow, CutRiskAssessment } from "@bijli/domain";
import { computeCheapWindow } from "./cheapHours.js";
import { computeCutRisk } from "./riskService.js";
import type { WeatherForecast } from "./weather.js";

export interface BacktestResult {
  scenario: typeof MAY_2026_HEATWAVE_BACKTEST;
  cheapWindow: CheapWindow;
  cutRisk: CutRiskAssessment;
  /** 24 hourly values, GW. Flat inside the cited deficit window, zero outside -- a shape, not an hour-by-hour archived reading. */
  hourlyDeficitGW: number[];
}

/**
 * Replays the May 2026 heatwave through the *actual* pipeline
 * (computeCheapWindow, computeCutRisk) instead of a canned string -- this is
 * "what BijliSaathi would have sent" only in the sense that it's the real
 * product logic, run against a heatwave-shaped reconstruction of that day's
 * weather (the exact archived hourly reading for that day isn't sourced, so
 * the forecast fed in is honestly labelled "estimated"; only the national
 * GW figures it's compared against, from gridFacts.ts, are "real").
 */
export function runMay2026Backtest(): BacktestResult {
  const scenario = MAY_2026_HEATWAVE_BACKTEST;
  const tariff = getTariffPlan(scenario.state);

  const hourlyTempC = Array.from({ length: 24 }, (_, h) => 30 + 12 * Math.sin(((h - 6) / 24) * Math.PI * 2));
  const forecast: WeatherForecast = {
    date: scenario.date,
    hourlyTempC,
    hourlyCloudCoverPercent: Array.from({ length: 24 }, () => 8),
    maxTempC: Math.max(...hourlyTempC),
    label: "estimated",
    note: "Heatwave-shaped reconstruction for the backtest -- the actual archived hourly reading for this day isn't sourced.",
  };

  const cheapWindow = computeCheapWindow(tariff, forecast);
  const cutRisk = computeCutRisk({ tariff, forecast, recentOutageReports: 3 });

  const hourlyDeficitGW = Array.from({ length: 24 }, (_, h) =>
    h >= scenario.deficitWindow.startHour && h < scenario.deficitWindow.endHour ? scenario.eveningDeficitGW : 0
  );

  return { scenario, cheapWindow, cutRisk, hourlyDeficitGW };
}
