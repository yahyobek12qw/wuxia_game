// Shuhratparastlik: NPC'larning uzoq muddatli maqsadlari, raqiblik va kayfiyat.
// Maqsad → qarorga og'irlik (npcAI.decide) → harakat → bajarilganda dunyo o'zgaradi (unvon, do'kon, oilaga boylik, hurmat).
import { CATALOG, learn } from './cultivation.js';
import type { Goal, NPC, Role } from '../core/types.js';
import { addMemory, hasBond, MEMORY_DEFAULTS } from './memory.js';
import { threshold, WAGE } from './npcAI.js';
import type { World } from './world.js';

export const AMBITIONS: readonly Goal['type'][] = ['rank_up', 'wealth', 'surpass', 'find_manual'];
const isAmb = (g: Goal) => AMBITIONS.includes(g.type);
const NEXT_RANK: Partial<Record<Role, Role>> = { outer_disciple: 'inner_disciple', inner_disciple: 'elder' };
const RANK_ORDER: Role[] = ['outer_disciple', 'inner_disciple', 'elder', 'sect_leader'];
export const CIVIL: readonly Role[] = ['farmer', 'merchant', 'innkeeper', 'blacksmith', 'doctor'];
const MAX_SHOPS = 2;                    // bir joyda ko'pi bilan nechta savdogar bo'lishi mumkin (dehqon do'kon ochsa)

export function hashId(id: string): number { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return h >>> 0; }

/** Kunlik: maqsadlarni tekshirish, yangilarini tug'dirish (har NPC haftada bir marta), raqiblik paydo bo'lishi. */
export function ambitions(w: World): void {
  const r = w.rng.get('ambition');
  for (const n of w.alive()) {
    if (n.player) continue;
    if (n.goals.some(isAmb)) { for (const g of n.goals) if (isAmb(g)) check(w, n, g); n.goals = n.goals.filter(g => !g.done); }
    if ((w.day + hashId(n.id)) % 7 !== 0 || n.goals.some(isAmb)) continue;
    const t = n.traits, f = n.faction ? w.factions[n.faction] : undefined, next = NEXT_RANK[n.role];
    const rival = n.bonds.filter(b => b.type === 'rival').map(b => w.npcs[b.other]).find(o => o?.alive && o.realm >= n.realm);
    if (next && f?.active && f.ideology === 'righteous' && t.ambition > 0.55 && r.chance(0.5)) n.goals.push({ type: 'rank_up', target: next, since: w.day });
    else if (rival && t.ambition > 0.45 && r.chance(0.6)) n.goals.push({ type: 'surpass', target: rival.id, since: w.day });
    else if (CIVIL.includes(n.role) && (t.greed > 0.55 || t.ambition > 0.65) && r.chance(0.015)) n.goals.push({ type: 'wealth', amount: Math.round(n.silver + (WAGE[n.role] ?? 1) * 8 * 110), since: w.day });   // ~110 ish kunlik maosh
    else if (w.isMartial(n) && t.curiosity > 0.65 && n.realm >= 1 && n.role !== 'sect_leader' && r.chance(0.03)) {
      const site = w.nearest(n.home, w.ofKind('site'), 48);
      if (site) { n.goals.push({ type: 'find_manual', target: site, since: w.day, tries: 0 }); w.emit({ type: 'seeks_manual', location: n.location, subject: n.id, object: site }); }
    }
  }
  if (w.day % 7 === 3) rivalries(w);
}

function check(w: World, n: NPC, g: Goal): void {
  const done = (data: Record<string, unknown>) => { g.done = true; n.needs.purpose = 0; w.emit({ type: 'ambition_fulfilled', location: n.location, subject: n.id, data: { goal: g.type, ...data } }); };
  if (w.day - g.since > 360) { g.done = true; return; }                      // bir yilda erishilmagan orzu so'nadi
  switch (g.type) {
    case 'rank_up': {
      const want = RANK_ORDER.indexOf(g.target as Role), have = RANK_ORDER.indexOf(n.role);
      if (have < 0) { g.done = true; return; }                               // sektadan ketdi
      if (have >= want) done({ to: n.role });
      return;
    }
    case 'surpass': {
      const o = w.npc(g.target);
      if (!o?.alive) { g.done = true; return; }
      if (n.realm > o.realm) {
        done({ rival: o.id });
        addMemory(w, o, { type: 'breakthrough', subject: n.id, object: o.id, day: w.day, location: n.location, source: 'heard', confidence: 0.9, importance: 0.5 });
        w.emit({ type: 'surpassed_rival', location: n.location, subject: n.id, object: o.id });
      }
      return;
    }
    case 'wealth': {
      if (n.silver < (g.amount ?? Infinity)) return;
      const fam = w.alive().filter(o => o.id !== n.id && hasBond(o, n.id, 'family'));
      const shops = w.alive().filter(o => o.home === n.home && o.role === 'merchant').length;
      if (n.role === 'farmer' && shops < MAX_SHOPS) {
        n.role = 'merchant'; n.silver -= 80;
        done({ opened: true });
        w.emit({ type: 'opened_shop', location: n.home, subject: n.id });
      } else {
        const share = Math.floor(n.silver * 0.15);
        for (const o of fam) { o.silver += share; n.silver -= share; addMemory(w, o, { type: 'gift', subject: n.id, object: o.id, day: w.day, location: n.home, source: 'witnessed', confidence: 1 }); }
        done({ family: fam.length });
        w.emit({ type: 'prospered', location: n.home, subject: n.id, data: { family: fam.length } });
      }
      return;
    }
    case 'find_manual': if ((g.tries ?? 0) >= 12 || !w.locations[g.target ?? '']) g.done = true; return;
  }
}

/** Topilma qidirish (NPC nishondagi xarobada bo'lganda har soat). */
export function search(w: World, n: NPC): void {
  const g = n.goals.find(x => x.type === 'find_manual'); if (!g) return;
  g.tries = (g.tries ?? 0) + 1;
  if (!w.rng.get('ambition').chance(0.012 + 0.02 * n.traits.curiosity)) return;   // ~12 urinishda ~30%
  n.progress += threshold(n.realm) * 0.5; n.talent = Math.min(1.6, n.talent + 0.05);
  const arts = Object.values(CATALOG).filter(t => t.tier >= 2 && ['sword', 'fist', 'qi', 'body'].includes(t.aff) && !n.techs?.includes(t.id));
  const art = arts.find(t => t.aff === n.aff) ?? arts[0];
  if (art) learn(w, n, art.id, null, 'manual');   // xarobada topilgan risoladagi uslub
  n.goals = n.goals.filter(x => x !== g); n.needs.purpose = 0;
  w.emit({ type: 'found_manual', location: n.location, subject: n.id });
}

// Bir sektadagi teng kuchli, shuhratparast ikki shogird raqibga aylanadi
function rivalries(w: World): void {
  const r = w.rng.get('ambition');
  let made = 0;
  for (const n of w.alive()) {
    if (made >= 2) return;
    if (n.player || !n.faction || !w.isMartial(n) || n.traits.ambition < 0.6 || n.bonds.some(b => b.type === 'rival') || !r.chance(0.05)) continue;
    const peers = w.members(n.faction).filter(o => o.id !== n.id && !o.player && o.role === n.role && Math.abs(o.realm - n.realm) <= 1 && o.traits.ambition > 0.45
      && !o.bonds.some(b => b.type === 'rival') && !n.bonds.some(b => b.other === o.id));
    if (!peers.length) continue;
    const o = r.pick(peers);
    n.bonds.push({ other: o.id, type: 'rival' }); o.bonds.push({ other: n.id, type: 'rival' });
    w.emit({ type: 'rivalry', location: n.location, subject: n.id, object: o.id, data: { faction: n.faction } });
    made++;
  }
}

/** Kayfiyat: ehtiyojlar, jarohat, so'nggi 10 kunlik xotiralar, maqsadlar va qashshoqlikdan. Saqlanmaydi — har safar hisoblanadi. */
export function mood(w: World, n: NPC): { v: number; label: string; angry: boolean } {
  const nd = n.needs;
  let v = 0.7 - 0.22 * nd.hunger / 100 - 0.12 * nd.rest / 100 - 0.25 * nd.safety / 100 - 0.08 * nd.social / 100 - 0.08 * nd.purpose / 100 - 0.5 * n.injury;
  let harm = 0, good = 0;
  for (const m of n.memories) {
    if (m.day < w.day - 10 || m.subject === n.id) continue;
    const close = m.object === n.id || (m.object !== null && n.bonds.some(b => b.other === m.object && b.type !== 'rival'));
    if (!close) continue;
    if (MEMORY_DEFAULTS[m.type].harm) harm += m.importance * m.confidence; else good += m.importance * m.confidence;
  }
  v += 0.12 * Math.min(2, good) - 0.18 * Math.min(2.5, harm);
  if (n.goals.some(g => g.type === 'avenge')) v -= 0.1;
  if (CIVIL.includes(n.role) && n.silver < 5) v -= 0.1;
  v = Math.max(0, Math.min(1, v));
  const angry = harm > 0.4 && n.traits.temper > 0.55 && v < 0.45;
  const label = angry ? "G'azabnok" : v > 0.72 ? 'Baxtiyor' : v > 0.55 ? 'Mamnun' : v > 0.4 ? 'Xotirjam' : v > 0.25 ? 'Tashvishli' : "G'amgin";
  return { v, label, angry };
}

/** Maqsad matni (UI uchun). */
export function goalText(w: World, g: Goal): string {
  const RANK: Partial<Record<string, string>> = { inner_disciple: 'ichki shogird', elder: 'oqsoqol' };
  switch (g.type) {
    case 'avenge': return `${w.nameOf(g.target)}dan qasos olish`;
    case 'seek_master': return 'Yashirin ustoz topish';
    case 'rank_up': return `${RANK[g.target ?? ''] ?? g.target} bo'lish`;
    case 'surpass': return `Raqibi ${w.nameOf(g.target)}dan kuchliroq bo'lish`;
    case 'wealth': return `${g.amount} kumush yig'ish`;
    case 'find_manual': return `${w.nameOf(g.target)}da qadimiy risola izlash`;
    case 'bounty': return `${w.nameOf(g.target)} boshiga qo'yilgan mukofotni olish`;
  }
}
