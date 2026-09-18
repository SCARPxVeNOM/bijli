import type { TariffPlan } from "@bijli/data";
import type { CheapWindow } from "@bijli/domain";
import type { WeatherForecast } from "./weather.js";

/**
 * Tomorrow's best 2-4 hour window: the state's ToD solar (cheap) hours,
 * narrowed to the clearest sub-window per the cloud-cover forecast (clearer
 * sky -> more solar on the grid -> cleaner, and it's already the cheap band).
 */
export function computeCheapWindow(tariff: TariffPlan, forecast: WeatherForecast): CheapWindow {
  const { startHour, endHour } = tariff.solarWindow;
  const windowSize = 3;
  let bestStart = startHour;
  let bestAvgCloud = Infinity;

  for (let s = startHour; s + windowSize <= endHour; s++) {
    const slice = forecast.hourlyCloudCoverPercent.slice(s, s + windowSize);
    const avg = slice.reduce((sum, c) => sum + c, 0) / slice.length;
    if (avg < bestAvgCloud) {
      bestAvgCloud = avg;
      bestStart = s;
    }
  }

  const label = forecast.label === "real" ? "estimated" : "estimated";
  return {
    date: forecast.date,
    startHour: bestStart,
    endHour: bestStart + windowSize,
    reason: `Inside ${tariff.state}'s ToD solar hours (${startHour}:00-${endHour}:00), clearest skies forecast ~${Math.round(bestAvgCloud)}% cloud cover`,
    label,
  };
}
