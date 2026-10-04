// Jinoyat, qonun va mukofot (bounty).
//  • Jinoyatlar: o'g'rilik (kambag'al, ochko'z, vijdonsiz odamlar tunda), guvohlar oldida qotillik, bosqin.
//  • Guvoh bo'lsa — mahalliy qonun (qo'riqchilar, ular yo'q bo'lsa — joy egasi) jinoyatchi boshiga mukofot e'lon qiladi.
//  • Mukofot ovchilari (qo'riqchilar, ochko'z jasur sargardonlar) nishonni izlaydi; kim o'ldirsa — mukofot o'shaniki (o'yinchi ham).
//  • O'yinchi qidiruvda bo'lsa: shu fraksiya qo'riqchilari dushman, hibsga olishga urinadi; jarimani to'lab qutulish mumkin.
// Obro' (reputation) saqlanmaydi — joy aholisining o'yinchiga munosabatidan va qidiruvdan hisoblanadi (repAt).
import { noticed, vendetta } from './quests.js';
import type { NPC } from '../core/types.js';
import { basePower } from './combat.js';
import { addMemory, rel } from './memory.js';
import { isChild, residentsOf } from './settlement.js';
import { liberateHit, ownerOf } from './territory.js';
import type { World } from './world.js';

export type Crime = 'murder' | 'theft' | 'raid';
export interface Bounty { id: string; target: string; issuer: string; reward: number; reason: Crime; day: number; loc: string; hunter?: string; }
export interface Law { bounties: Bounty[]; seq: number; }

export function law(w: World): Law { return (w.law ??= { bounties: [], seq: w.seq }); }
export const bountiesOn = (w: World, id: string): Bounty[] => law(w).bounties.filter(b => b.target === id);
const LAWFUL = ['raid', 'ambush', 'expedition', 'bounty', 'patrol'];

/** Joyda qonunni kim himoya qiladi: qo'riqchilar (neytral) yoki joy egasi (to'g'ri yo'l sektasi). Qaroqchi hududida qonun yo'q. */
export function lawFaction(w: World, loc: string): string | null {
  const own = ownerOf(w, loc);
  if (own?.active && own.ideology === 'neutral') return own.id;
  const guards = Object.values(w.factions).filter(f => f.active && f.ideology === 'neutral');
  let best: string | null = null, bd = 30;
  for (const f of guards) { const h = w.hoursTo(loc, f.base); if (h <= bd) { bd = h; best = f.id; } }
  if (best) return best;
  return own?.active && own.ideology === 'righteous' ? own.id : null;
}

export function postBounty(w: World, target: NPC, reason: Crime, loc: string, reward: number, issuer = lawFaction(w, loc)): Bounty | null {
  if (!issuer || !target.alive || target.faction === issuer) return null;
  const L = law(w), ex = L.bounties.find(b => b.target === target.id && b.issuer === issuer);
  if (ex) { ex.reward += Math.round(reward * 0.6); ex.day = w.day; ex.loc = loc; return ex; }
  const b: Bounty = { id: w.nextId('bty'), target: target.id, issuer, reward: Math.round(reward), reason, day: w.day, loc };
  L.bounties.push(b);
  w.emit({ type: 'bounty_posted', location: loc, subject: issuer, object: target.id, data: { reward: b.reward, reason } });
  return b;
}

/** O'lim (combat.kill dan): mukofot to'lash, qotillik jinoyati, o'yinchining qahramonligi. */
export function onKill(w: World, n: NPC, killerId: string | null, cause: string, secret: boolean): void {
  const L = law(w), k = w.npc(killerId), loc = n.location;
  const mine = L.bounties.filter(b => b.target === n.id);
  if (mine.length) {
    L.bounties = L.bounties.filter(b => b.target !== n.id);
    if (k?.alive && !secret) {
      const reward = mine.reduce((a, b) => a + b.reward, 0);
      k.silver += reward;
      for (const b of mine) { const f = w.factions[b.issuer]; if (f) f.silver = Math.max(0, f.silver - b.reward); }
      w.emit({ type: 'bounty_claimed', location: loc, subject: k.id, object: n.id, data: { reward } });
      for (const g of k.goals) if (g.type === 'bounty' && g.target === n.id) g.done = true;
      k.goals = k.goals.filter(g => !g.done);
    }
  }
  if (!k || secret || k.id === n.id) return;
  const fn = n.faction ? w.factions[n.faction] : undefined;
  const criminal = mine.length > 0 || fn?.ideology === 'demonic';
  const war = !!(k.faction && n.faction && (w.factions[k.faction]?.wars?.includes(n.faction) || w.tension(k.faction, n.faction) >= 75));
  // Qahramonlik: o'yinchi qaroqchini yoki qidiruvdagi jinoyatchini o'ldirdi — yaqin joy aholisi eshitadi
  if (k.player && criminal) {
    const home = w.nearest(w.nodeOf(n), w.settlements(), 12);
    if (home) for (const o of residentsOf(w, home).slice(0, 12)) addMemory(w, o, { type: 'helped', subject: 'player', object: o.id, day: w.day, location: home, source: 'heard', confidence: 0.8, importance: 0.35, origin: `hero_${n.id}_${o.id}` });
    if (fn?.ideology === 'demonic') { liberateHit(w, w.nodeOf(n), fn.id, n.realm); vendetta(w, fn.id); }   // to'da keyinroq qasoskor yuboradi
    if (n.realm >= 3 || mine.length) noticed(w);                                                            // shon-shuhrat: sekta ko'rib qoladi
  }
  if (criminal || war || LAWFUL.includes(cause) || isChild(k)) return;
  const witnesses = w.at(loc).filter(o => o.alive && !o.player && o.id !== k.id && o.id !== n.id);
  if (!witnesses.length) return;
  postBounty(w, k, 'murder', w.nodeOf(k), 50 + 25 * n.realm);
}

/** Kunlik: bosqinchilar boshiga mukofot, o'g'rilik, mukofot ovchilari, eskirgan e'lonlar. */
export function lawDaily(w: World): void {
  const L = law(w), r = w.rng.get('law');
  for (let k = w.events.length - 1; k >= 0 && w.events[k].seq > L.seq; k--) {
    const e = w.events[k];
    if (e.type === 'raid' && e.subject) { const lead = w.npc(e.subject); if (lead?.alive) postBounty(w, lead, 'raid', e.location, 40 + 15 * lead.realm); }
  }
  L.seq = w.seq;
  // O'g'rilik: kambag'al, ochko'z, vijdonsiz odam qo'shnisini o'g'irlaydi
  for (const id of w.settlements()) {
    const ppl = residentsOf(w, id);
    for (const t of ppl) {
      if (t.faction || isChild(t) || t.player || t.silver >= 12 || t.traits.greed < 0.55 || t.traits.honor > 0.4 || !r.chance(0.03)) continue;
      const victim = ppl.filter(v => v !== t && !v.player && !isChild(v) && v.silver > 20).sort((a, b) => b.silver - a.silver)[0];
      if (!victim) continue;
      const amount = Math.min(40, Math.floor(victim.silver * 0.3));
      victim.silver -= amount; t.silver += amount;
      const guards = ppl.some(x => x.role === 'guard' || x.role === 'guard_captain');
      const seen = r.chance(guards ? 0.45 : 0.25);
      addMemory(w, victim, { type: 'stole', subject: seen ? t.id : 'unknown', object: victim.id, day: w.day, location: id, source: 'witnessed', confidence: 1, truth: seen ? undefined : t.id });
      w.emit({ type: 'theft', location: id, subject: t.id, object: victim.id, data: { amount, seen }, secret: !seen });
      if (seen) postBounty(w, t, 'theft', id, 15 + amount);
    }
  }
  // Eskirgan e'lonlar (120 kun) va o'lgan nishonlar
  L.bounties = L.bounties.filter(b => w.npcs[b.target]?.alive && w.day - b.day <= 120 && w.factions[b.issuer]?.active);
  const live = new Set(L.bounties.map(b => b.target));
  for (const n of w.alive()) if (n.goals.some(g => g.type === 'bounty' && (!live.has(g.target!) || w.day - g.since > 45))) n.goals = n.goals.filter(g => g.type !== 'bounty' || (live.has(g.target!) && w.day - g.since <= 45));   // 45 kunda topolmasa — voz kechadi
  // Mukofot ovchilari (o'yinchi ortidan NPC ovchi yuborilmaydi — uni qo'riqchilar hibsga oladi)
  const hunting = new Set(L.bounties.filter(b => b.hunter && w.npcs[b.hunter]?.alive && w.npcs[b.hunter].goals.some(g => g.type === 'bounty' && g.target === b.target)).map(b => b.issuer));
  for (const b of L.bounties) {
    if (b.target === 'player' || w.day - b.day < 2 || b.reward < 35 || hunting.has(b.issuer)) continue;   // har qonun fraksiyasidan bir vaqtda bitta ovchi
    if (b.hunter && w.npcs[b.hunter]?.alive && w.npcs[b.hunter].goals.some(g => g.type === 'bounty' && g.target === b.target)) continue;
    const t = w.npcs[b.target]; if (!t?.alive) continue;
    const node = w.nodeOf(t);
    const cands = w.alive().filter(h => !h.player && h.id !== t.id && !h.opId && !h.goals.some(g => g.type === 'bounty' || g.type === 'avenge') && h.injury < 0.3 && !bountiesOn(w, h.id).length
      && ((h.faction === b.issuer && (h.role === 'guard' || h.role === 'guard_captain' || h.role === 'elder' || h.role === 'inner_disciple'))
        || (h.role === 'wanderer' && h.traits.greed > 0.5 && h.traits.courage > 0.55))
      && basePower(h) >= basePower(t) * 0.9 && w.hoursTo(w.nodeOf(h), node) <= 30);
    if (!cands.length || !r.chance(0.25)) continue;
    const h = cands.sort((a, c) => basePower(c) - basePower(a))[0];
    h.goals.push({ type: 'bounty', target: t.id, since: w.day });
    b.hunter = h.id; hunting.add(b.issuer);
    w.emit({ type: 'bounty_hunter', location: w.nodeOf(h), subject: h.id, object: t.id, data: { reward: b.reward } });
  }
}

/** Mahalliy obro': joy aholisi (o'yinchini tanigan kattalar) munosabatining o'rtachasi; qidiruvda bo'lsa — keskin pasayadi. */
export function repAt(w: World, loc: string): { score: number; label: string; known: number; wanted: number } {
  const ppl = residentsOf(w, loc).filter(n => !isChild(n) && n.relations['player']);
  let sum = 0;
  for (const n of ppl) { const r = rel(n, 'player', w); sum += 0.35 * r.trust + 0.3 * r.respect + 0.35 * r.affection - 0.25 * r.fear; }
  const lf = lawFaction(w, loc);
  const wanted = bountiesOn(w, 'player').filter(b => b.issuer === lf).reduce((a, b) => a + b.reward, 0);
  let score = ppl.length ? Math.round(100 * sum / Math.max(ppl.length, 3)) : 0;
  if (wanted) score = Math.min(score, -40 - Math.min(40, Math.round(wanted / 10)));
  score = Math.max(-100, Math.min(100, score));
  const label = wanted ? 'Qidiruvdagi jinoyatchi' : score >= 45 ? 'Qahramon' : score >= 18 ? 'Hurmatli' : score > -18 ? (ppl.length ? 'Tanish' : 'Notanish') : score > -45 ? 'Shubhali' : 'Yomon otliq';
  return { score, label, known: ppl.length, wanted };
}
/** Jarima: mahalliy qonun fraksiyasining o'yinchi boshidagi mukofotlari (×1.2). */
export function fineFor(w: World, loc: string): { issuer: string | null; amount: number } {
  const lf = lawFaction(w, loc);
  return { issuer: lf, amount: Math.round(1.2 * bountiesOn(w, 'player').filter(b => b.issuer === lf).reduce((a, b) => a + b.reward, 0)) };
}
export function clearBounties(w: World, target: string, issuer: string | null): void {
  law(w).bounties = law(w).bounties.filter(b => !(b.target === target && (!issuer || b.issuer === issuer)));
}
