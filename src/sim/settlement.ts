// Aholi punkti iqtisodi: har shahar va qishloqning oziq-ovqat zaxirasi, xavfsizligi, farovonligi, aholisi va narxlari.
// Dehqonlar hosil yetishtiradi (fasl va ob-havoga bog'liq) → qishloq ortiqchasini savdo yo'li orqali shaharga yuboradi →
// yo'lda pistirma yoki bo'ron bo'lsa savdo to'xtaydi → shaharda oziq kamayadi, narx oshadi, baxt pasayadi →
// odamlar ko'chib ketadi, kambag'allar qaroqchilarga qo'shiladi; qaroqchilar boy, lekin himoyasiz joylarni tanlaydi.
// Hisob kuniga bir marta, joy darajasida (NPC emas) — unumdorlikka deyarli ta'sir qilmaydi.
import type { NPC } from '../core/types.js';
import { fieldYield, season } from './calendar.js';
import type { World } from './world.js';

export type Good = 'food' | 'medicine' | 'iron' | 'weapon' | 'cloth' | 'luxury';
export const GOODS: Good[] = ['food', 'medicine', 'iron', 'weapon', 'cloth', 'luxury'];
export const GOOD_NAME: Record<Good, string> = { food: 'Oziq-ovqat', medicine: 'Dori-darmon', iron: 'Temir', weapon: 'Qurol-yarog\'', cloth: 'Teri va mato', luxury: 'Noyob buyumlar' };

export interface Settlement {
  food: number;          // zaxira: aholi necha kun yeta oladi (0..90)
  security: number;      // 0..100
  prosperity: number;    // 0..100
  pop: number; cap: number; base: number;   // aholi, sig'im (farovonlikka bog'liq), boshlang'ich sig'im
  prices: Record<Good, number>;             // ko'paytiruvchi (1 = odatiy narx)
  flow: number;          // bugungi savdo oqimi (birlik)
  famine?: number;       // ocharchilik boshlangan kun
}
export interface Economy { s: Record<string, Settlement>; seq: number; danger: Record<string, number>; }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const isChild = (n: NPC) => n.role === 'child';

export function econ(w: World): Economy {
  if (w.econ) return w.econ;
  const e: Economy = { s: {}, seq: w.seq, danger: {} };
  const res = residents(w);
  for (const id of w.settlements()) {
    const n = res.get(id)?.length ?? 0, city = w.locations[id].kind === 'city';
    e.s[id] = { food: city ? 40 : 50, security: city ? 65 : 50, prosperity: city ? 60 : 40, pop: n, base: Math.round(n * 1.15 + 1), cap: Math.round(n * 1.15 + 1),
      prices: { food: 1, medicine: 1, iron: 1, weapon: 1, cloth: 1, luxury: 1 }, flow: 0 };
  }
  return (w.econ = e);
}
export const settlementOf = (w: World, loc: string | undefined | null): Settlement | undefined => (loc ? econ(w).s[loc] : undefined);
export function happiness(s: Settlement): number { return Math.round(0.4 * Math.min(100, s.food * 100 / 45) + 0.35 * s.security + 0.25 * s.prosperity); }

function residents(w: World): Map<string, NPC[]> {
  return w.perHour('residents', () => {
    const m = new Map<string, NPC[]>();
    for (const n of w.alive()) { if (n.player) continue; const a = m.get(n.home); if (a) a.push(n); else m.set(n.home, [n]); }
    return m;
  });
}
export const residentsOf = (w: World, id: string): NPC[] => residents(w).get(id) ?? [];

/** Yo'l xavfli: so'nggi kunlarda pistirma yoki bosqin bo'lgan. */
export function routeSafe(w: World, from: string, to: string): boolean {
  if (w.weather.kind === 'storm') return false;
  const E = econ(w), bad = (id: string) => (E.danger[id] ?? -1) >= w.day;
  if (bad(from) || bad(to)) return false;
  return !(w.route(from, to) ?? []).some(l => bad(l.road));
}

/** Kunlik iqtisod. */
export function economy(w: World): void {
  const E = econ(w);
  // 1) Kecha bo'lgan voqealar joylarga ta'sir qiladi
  for (let k = w.events.length - 1; k >= 0 && w.events[k].seq > E.seq; k--) {
    const ev = w.events[k], s = E.s[ev.location];
    if (ev.type === 'raid') { E.danger[ev.location] = w.day + 5; if (s) { s.security -= 20; s.prosperity -= 10; s.food *= 0.85; } }
    else if (ev.type === 'raid_repelled' && s) s.security -= 6;
    else if (ev.type === 'ambush') E.danger[ev.location] = w.day + 6;
    else if (ev.type === 'death' && ev.object && s) s.security -= 3;
  }
  E.seq = w.seq;
  for (const [k, d] of Object.entries(E.danger)) if (d < w.day) delete E.danger[k];

  // Urushdagi fraksiyalar (qurol narxi uchun)
  const atWar = Object.values(w.factions).filter(f => f.active && ((f.wars?.length ?? 0) > 0 || w.ops.some(o => !o.resolved && o.faction === f.id && (o.type === 'raid' || o.type === 'expedition'))));
  const y = fieldYield(w);
  const exports = new Map<string, number>();
  // 2) Ishlab chiqarish, iste'mol, eksport (qishloq → savdo sherigi shahar)
  for (const [id, s] of Object.entries(E.s)) {
    const ppl = residentsOf(w, id), city = w.locations[id].kind === 'city';
    const adults = ppl.filter(n => !isChild(n)).length, kids = ppl.length - adults;
    const farmers = ppl.filter(n => n.role === 'farmer').length, merchants = ppl.filter(n => n.role === 'merchant').length;
    const cons = Math.max(1, adults + 0.5 * kids);
    let units = s.food * cons + farmers * 3.2 * y - cons;
    const safe = routeSafe(w, id, w.tradePartner(id) ?? id);
    units += ((city ? 1 : 0.35) * cons + merchants * 1.2) * (safe ? 1 : 0.3);   // bozor atrofdan va uzoqdan don oladi; yo'l xavfli bo'lsa — to'xtaydi
    s.food = Math.max(0, units / cons); s.flow = 0;
    const keep = season(w.day) === 'autumn' ? 75 : 60;          // kuzda qish uchun ko'proq saqlanadi
    if (!city && s.food > keep) {
      const partner = w.tradePartner(id);
      if (partner && E.s[partner] && routeSafe(w, id, partner)) {
        const surplus = (s.food - keep) * cons * (merchants ? 1 : 0.6);
        s.food -= surplus / cons; s.flow = surplus; exports.set(partner, (exports.get(partner) ?? 0) + surplus);
      }
    }
    s.food = Math.min(90, s.food);
  }
  for (const [id, units] of exports) { const s = E.s[id]; const cons = Math.max(1, residentsOf(w, id).length); s.food = Math.min(90, s.food + units / cons); s.flow += units; }

  // 3) Xavfsizlik, farovonlik, narxlar, sig'im, ocharchilik
  for (const [id, s] of Object.entries(E.s)) {
    const ppl = residentsOf(w, id), loc = w.locations[id], city = loc.kind === 'city';
    const guards = ppl.filter(n => n.role === 'guard' || n.role === 'guard_captain').length;
    const owner = loc.owner ? w.factions[loc.owner] : undefined;
    const merchants = ppl.filter(n => n.role === 'merchant').length;
    const occupied = !!owner?.active && owner.ideology === 'demonic';   // qaroqchilar bosib olgan
    const secT = 30 + Math.min(30, 9 * guards) + (owner?.active && owner.ideology !== 'demonic' ? 15 : 0) - (occupied ? 15 : 0) + (city ? 10 : 0) - ((E.danger[id] ?? -1) >= w.day ? 15 : 0);
    s.security = clamp(s.security + (secT - s.security) * 0.05, 0, 100);
    const prosT = 20 + 7 * Math.min(4, merchants) + 0.25 * s.security + Math.min(15, s.flow * 1.5) + (city ? 10 : 0) - (s.food < 10 ? 20 : 0) - (occupied ? 15 : 0);
    s.prosperity = clamp(s.prosperity + (prosT - s.prosperity) * 0.04, 0, 100);
    s.pop = ppl.length;
    s.cap = Math.round(s.base * (0.75 + 0.5 * s.prosperity / 100) * (s.food < 10 ? 0.85 : 1));
    const injured = ppl.length ? ppl.filter(n => n.injury > 0.2).length / ppl.length : 0;
    const wars = atWar.filter(f => w.hoursTo(id, f.base) <= 48).length;
    const danger = (E.danger[id] ?? -1) >= w.day;
    s.prices = {
      food: +clamp((1.7 - s.food / 40) * (danger ? 1.15 : 1), 0.6, 3).toFixed(2),
      medicine: +clamp(1 + 1.5 * injured + (ppl.some(n => n.role === 'doctor') ? 0 : 0.25), 0.8, 2.5).toFixed(2),
      iron: +clamp(1 + 0.2 * wars + (ppl.some(n => n.role === 'blacksmith') ? 0 : 0.15), 0.8, 2).toFixed(2),
      weapon: +clamp(1 + 0.3 * wars + (s.security < 30 ? 0.3 : 0), 0.8, 2.5).toFixed(2),
      cloth: +clamp(1.15 - s.prosperity / 300, 0.8, 1.5).toFixed(2),
      luxury: +clamp(0.7 + s.prosperity / 100, 0.6, 1.8).toFixed(2),
    };
    if (s.food < 4 && s.pop >= 3 && s.famine === undefined) { s.famine = w.day; w.emit({ type: 'famine', location: id, data: { pop: s.pop } }); }
    else if (s.famine !== undefined && s.food > 18) { w.emit({ type: 'famine_over', location: id, data: { days: w.day - s.famine } }); s.famine = undefined; }
  }
  if (w.day % 30 === 20) emigrate(w);
}

// Baxtsiz joydan oila ko'chib ketadi (ochlik, xavf, qashshoqlik)
function emigrate(w: World): void {
  const E = econ(w), r = w.rng.get('econ');
  for (const [id, s] of Object.entries(E.s)) {
    if (happiness(s) >= 32 || s.pop < 3 || !r.chance(0.6)) continue;
    const head = residentsOf(w, id).find(n => !n.faction && !isChild(n) && !n.travel && ['farmer', 'merchant', 'innkeeper', 'doctor', 'blacksmith', 'wanderer'].includes(n.role));
    if (!head) continue;
    const dest = w.settlements().filter(x => x !== id && happiness(E.s[x]) > 50 && E.s[x].pop < E.s[x].cap && w.hoursTo(id, x) <= 48)
      .sort((a, b) => w.hoursTo(id, a) - w.hoursTo(id, b))[0];
    if (!dest) continue;
    const kin = residentsOf(w, id).filter(n => n !== head && !n.faction && n.bonds.some(b => b.other === head.id && (b.type === 'spouse' || b.type === 'family')));
    for (const n of [head, ...kin]) { n.home = dest; w.startTravel(n, dest, 'emigrate'); }
    w.emit({ type: 'emigrated', location: id, subject: head.id, object: dest, data: { count: 1 + kin.length, happiness: happiness(s) } });
  }
}
