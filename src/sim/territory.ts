// Hudud nazorati: har qishloq/shahar/yo'lning egasi (fraksiya) bor. Egalik o'zgaradi:
//  • qaroqchilar bir oy ichida qishloqni 3 marta talasa va egasi himoya qila olmasa — qishloqni bosib oladi (o'lpon yig'adi);
//  • jazo yurishi to'da uyasini yengsa yoki to'da tarqalsa — bosib olingan qishloqlar ozod bo'ladi;
//  • sektalar urushida g'olib yengilganning qishloqlarini egallaydi;
//  • o'yinchi bosqinchilarni qishloqda o'ldirib, uni ozod qila oladi (o'yin qatlami — liberateHit).
// Hudud fraksiyaga daromad beradi (soliq/o'lpon), urush esa kumushni yeydi — kumush tugasa urushdan charchash sulhga olib keladi.
// Joylar (w.locations) saqlanmaydi, shuning uchun o'zgarishlar shu yerda saqlanadi va yuklashda qayta qo'llanadi (applyTerritory).
import type { Faction } from '../core/types.js';
import { addMemory } from './memory.js';
import { econ, residentsOf } from './settlement.js';
import type { World } from './world.js';

export interface Hold { by: string; prev: string | null; since: number; control: number; }
export interface Territory { held: Record<string, Hold>; strikes: Record<string, { f: string; n: number; day: number }>; seq: number; fort?: Record<string, number>; }

export function terr(w: World): Territory { return (w.terr ??= { held: {}, strikes: {}, seq: w.seq }); }
export const ownerOf = (w: World, loc: string): Faction | undefined => { const o = w.locations[loc]?.owner; return o ? w.factions[o] : undefined; };
/** Yuklashdan keyin: o'zgargan egaliklarni joylarga qayta yozish. */
export function applyTerritory(w: World): void { for (const [loc, h] of Object.entries(w.terr?.held ?? {})) if (w.locations[loc]) w.locations[loc].owner = h.by; }

function setOwner(w: World, loc: string, by: string, prev: string | null): void {
  const T = terr(w);
  w.locations[loc].owner = by;
  const orig = T.held[loc]?.prev;
  if (orig !== undefined && orig === by) delete T.held[loc];                       // asl egasiga qaytdi
  else T.held[loc] = { by, prev: orig !== undefined ? orig : prev, since: w.day, control: 60 };
}

/** Bosib olingan joyni ozod qilish (asl egasiga, u yo'q bo'lsa — ozod qiluvchiga). */
export function liberate(w: World, loc: string, liberator: string): void {
  const h = terr(w).held[loc]; if (!h) return;
  const occupier = h.by, back = h.prev && w.factions[h.prev]?.active ? h.prev : (w.factions[liberator] ? liberator : h.prev);
  if (back) setOwner(w, loc, back, occupier); else { delete terr(w).held[loc]; w.locations[loc].owner = undefined; }
  (terr(w).fort ??= {})[loc] = w.day + 60;                                     // ozod bo'lgan qishloq mustahkamlanadi
  const st = econ(w).s[loc]; if (st) st.security = Math.min(100, st.security + 20);
  w.emit({ type: 'territory_liberated', location: loc, subject: liberator, object: occupier, data: { to: back } });
}

/** O'yinchi bosqinchi to'da a'zosini shu qishloqda o'ldirdi: nazorat zaiflashadi. Ozod bo'lsa — true. */
export function liberateHit(w: World, loc: string, gang: string, realm: number): boolean {
  const h = terr(w).held[loc]; if (!h || h.by !== gang) return false;
  h.control -= 35 + 10 * realm;
  if (h.control > 0) return false;
  liberate(w, loc, 'player');
  for (const n of residentsOf(w, loc)) addMemory(w, n, { type: 'saved_life', subject: 'player', object: n.id, day: w.day, location: loc, source: 'witnessed', confidence: 1, importance: 0.7, origin: `free_${loc}_${n.id}` });
  return true;
}

export function territory(w: World): void {
  const T = terr(w);
  for (let k = w.events.length - 1; k >= 0 && w.events[k].seq > T.seq; k--) {
    const e = w.events[k];
    if (e.type === 'raid' && e.object && w.locations[e.location]?.kind === 'village') {
      const st = T.strikes[e.location];
      T.strikes[e.location] = st && st.f === e.object && w.day - st.day <= 30 ? { f: e.object, n: st.n + 1, day: st.day } : { f: e.object, n: 1, day: w.day };
    } else if (e.type === 'expedition_victory' && e.object) {
      const loser = Object.values(w.factions).find(f => f.base === e.location && f.id !== e.object);
      if (!loser) continue;
      for (const [loc, h] of Object.entries(T.held)) if (h.by === loser.id) liberate(w, loc, e.object);
      if (loser.ideology === 'righteous' && w.factions[e.object]?.ideology === 'righteous') conquer(w, w.factions[e.object], loser);
    } else if (e.type === 'faction_disbanded' && e.object) {
      for (const [loc, h] of Object.entries(T.held)) if (h.by === e.object) liberate(w, loc, h.prev ?? e.object);
    }
  }
  T.seq = w.seq;
  // Bosib olish: 30 kunda 3 bosqin
  for (const [loc, st] of Object.entries(T.strikes)) {
    if (w.day - st.day > 30) { delete T.strikes[loc]; continue; }
    const gang = w.factions[st.f], owner = ownerOf(w, loc);
    if (st.n < 3 || !gang?.active || owner?.id === gang.id || (T.fort?.[loc] ?? -1) >= w.day) continue;
    delete T.strikes[loc];
    setOwner(w, loc, gang.id, owner?.id ?? null);
    if (owner?.active) w.addTension(owner.id, gang.id, 35);                         // egasi qasos yurishiga tayyorlanadi
    w.emit({ type: 'territory_seized', location: loc, subject: gang.leader ?? undefined, object: gang.id, data: { from: owner?.id ?? null } });
  }
  // Daromad va urush xarajati
  const E = econ(w);
  for (const [loc, s] of Object.entries(E.s)) {
    const f = ownerOf(w, loc); if (!f?.active) continue;
    f.silver += (f.ideology === 'demonic' ? 2.5 : 1.5) * (0.5 + s.prosperity / 100);   // soliq yoki o'lpon
    if (f.ideology === 'demonic') s.prosperity = Math.max(0, s.prosperity - 0.2);
  }
  // Nazorat: kuchli to'da mustahkamlanadi, kuchsizi bo'shashadi; asl egasi yaqin bo'lsa — bosim o'tkazadi; 0 da qishloq ozod
  for (const [loc, h] of Object.entries(T.held)) {
    const by = w.factions[h.by]; if (!by?.active) continue;
    if (by.ideology !== 'demonic') { h.control = Math.min(100, h.control + 1); continue; }
    const prev = h.prev ? w.factions[h.prev] : undefined;
    let d = w.members(by.id).length >= 5 ? 0.6 : -1;
    if (prev?.active && prev.ideology !== 'demonic' && w.hoursTo(loc, prev.base) <= 30) d -= 1;
    h.control = Math.min(100, h.control + d);
    if (h.control <= 0) liberate(w, loc, prev?.active ? prev.id : loc);
  }
  for (const f of Object.values(w.factions)) {
    if (!f.active || !f.wars?.length) continue;
    f.silver = Math.max(0, f.silver - 0.8 * w.members(f.id).length);                  // urush ta'minoti
    if (f.silver < 150) for (const e of f.wars) w.addTension(f.id, e, -1.5);         // kumush tugadi — urushdan charchash
  }
}

// Sektalar urushi: g'olib yengilganning o'z bazasiga eng yaqin 2 qishlog'ini egallaydi
function conquer(w: World, win: Faction, lose: Faction): void {
  const vill = w.ofKind('village').filter(v => w.locations[v].owner === lose.id).sort((a, b) => w.hoursTo(win.base, a) - w.hoursTo(win.base, b)).slice(0, 2);
  for (const v of vill) { setOwner(w, v, win.id, lose.id); w.emit({ type: 'territory_gained', location: v, subject: win.id, object: lose.id }); }
}
