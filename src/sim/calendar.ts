// Kalendar va ob-havo: yil = 360 kun, fasl = 90 kun, oy = 30 kun, hafta = 7 kun.
// Ob-havo kuniga bir marta o'zgaradi (Markov: o'tgan kun ob-havosi saqlanishga moyil) va sayohat, mehnat, mashq,
// qaroqchilar faolligi va NPC qarorlariga ta'sir qiladi.
import type { World } from './world.js';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export interface Weather { kind: WeatherKind; since: number; }

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAME: Record<Season, string> = { spring: 'Bahor', summer: 'Yoz', autumn: 'Kuz', winter: 'Qish' };
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: 'Ochiq osmon', cloudy: 'Bulutli', rain: "Yomg'ir", storm: "Bo'ron", fog: 'Tuman', snow: 'Qor' };
export const WEATHER_ICON: Record<WeatherKind, string> = { clear: '☀', cloudy: '☁', rain: '🌧', storm: '⛈', fog: '🌫', snow: '❄' };

export const season = (day: number): Season => SEASONS[Math.floor((((day % 360) + 360) % 360) / 90)];
export const dayOfSeason = (day: number): number => (((day % 360) + 360) % 360) % 90;

// Fasl bo'yicha ob-havo og'irliklari
const ODDS: Record<Season, Record<WeatherKind, number>> = {
  spring: { clear: 4, cloudy: 3, rain: 3, storm: 0.5, fog: 1.2, snow: 0 },
  summer: { clear: 6, cloudy: 2, rain: 1.6, storm: 1, fog: 0.3, snow: 0 },
  autumn: { clear: 3.5, cloudy: 3, rain: 2, storm: 0.5, fog: 2, snow: 0.2 },
  winter: { clear: 3, cloudy: 3, rain: 0.3, storm: 0.4, fog: 1.5, snow: 3 },
};
const PERSIST: Record<WeatherKind, number> = { clear: 0.55, cloudy: 0.4, rain: 0.45, storm: 0.2, fog: 0.3, snow: 0.55 };

/** Kun oxirida: ertangi ob-havo va fasl almashinuvi. */
export function updateWeather(w: World): void {
  const r = w.rng.get('weather'), tomorrow = w.day + 1, s = season(tomorrow), cur = w.weather.kind;
  if (dayOfSeason(tomorrow) === 0) w.emit({ type: 'season_change', location: w.settlements()[0] ?? Object.keys(w.locations)[0], data: { season: s } });
  if (ODDS[s][cur] > 0 && r.chance(PERSIST[cur])) return;
  const odds = ODDS[s], kinds = Object.keys(odds) as WeatherKind[];
  let x = r.next() * kinds.reduce((a, k) => a + odds[k], 0), next: WeatherKind = 'clear';
  for (const k of kinds) { x -= odds[k]; if (x <= 0) { next = k; break; } }
  if (next === cur) return;
  w.weather = { kind: next, since: tomorrow };
  if (next === 'storm' || (next === 'snow' && cur !== 'snow')) w.emit({ type: 'weather', location: w.settlements()[0] ?? Object.keys(w.locations)[0], data: { kind: next } });
}

/** Sayohat sekinlashuvi. */
export function travelMult(w: World): number {
  return { clear: 1, cloudy: 1, rain: 1.25, storm: 1.6, fog: 1.15, snow: 1.4 }[w.weather.kind];
}
/** Dala ishlari (dehqon daromadi) fasl va ob-havoga bog'liq: kuzda hosil, qishda tinchlik. */
export function fieldYield(w: World): number {
  const s = { spring: 0.85, summer: 1, autumn: 1.8, winter: 0.3 }[season(w.day)];
  return s * ({ clear: 1, cloudy: 1, rain: 0.7, storm: 0.2, fog: 0.9, snow: 0.4 }[w.weather.kind]);
}
/** Mashq samarasi: bo'ron diqqatni buzadi, tumanli tong — sirli qi. */
export function qiMult(w: World): number {
  return { clear: 1, cloudy: 1, rain: 0.95, storm: 0.8, fog: 1.08, snow: 0.95 }[w.weather.kind];
}
/** Ochiq havoda ko'chishni istamaslik (bo'ron, qor). */
export function outdoorPenalty(w: World): number {
  return { clear: 1, cloudy: 1, rain: 0.8, storm: 0.35, fog: 0.9, snow: 0.6 }[w.weather.kind];
}
export const isNight = (hod: number): boolean => hod >= 22 || hod < 5;
