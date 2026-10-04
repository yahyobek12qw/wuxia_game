// Kultivatsiya chuqurligi: iste'dod turi (moyillik), uslublar (texnikalar), ustozdan uzatish, yorilish natijalari.
// Kuch = bosqich × jarohat × uslublar (moyillikka mos uslub ko'proq beradi) — combat.basePower orqali butun sim'ga ta'sir qiladi
// (janglar, fraksiya kuchini baholash, qasos tayyorligi). Uslublar NPC'da saqlanadi; yaratilgan va sekta uslublari — w.techs da.
import type { NPC } from '../core/types.js';
import { hashId } from './ambition.js';
import type { World } from './world.js';

export type Affinity = 'sword' | 'fist' | 'qi' | 'body' | 'alchemy' | 'medicine' | 'craft';
export const AFF_NAME: Record<Affinity, string> = { sword: 'Qilich', fist: 'Musht', qi: 'Qi', body: 'Tana', alchemy: 'Kimyogarlik', medicine: 'Tabobat', craft: 'Hunarmandlik' };
const COMBAT_AFF: Affinity[] = ['sword', 'fist', 'qi', 'body'];
export interface Technique { id: string; name: string; aff: Affinity; tier: 1 | 2 | 3; owner?: string; secret?: boolean; }

export const CATALOG: Record<string, Technique> = Object.fromEntries(([
  ['t_iron_fist', 'Temir musht', 'fist', 1], ['t_light_step', 'Yengil qadam', 'body', 1], ['t_three_cuts', 'Uch zarbli qilich', 'sword', 1], ['t_gather_breath', "Nafas yig'ish", 'qi', 1],
  ['t_cloud_sword', 'Bulut qilichi', 'sword', 2], ['t_mountain_body', "Tog' tanasi", 'body', 2], ['t_snake_fist', 'Ilon mushti', 'fist', 2], ['t_river_qi', 'Oqar daryo qi', 'qi', 2],
  ['t_hundred_herbs', "Ming o't kitobi", 'medicine', 2], ['t_fire_hammer', "Olov bolg'asi", 'craft', 2], ['t_pill_furnace', "Dori o'chog'i", 'alchemy', 2],
  ['t_sky_splitter', 'Osmon yorar qilich', 'sword', 3], ['t_diamond_body', 'Olmos tana', 'body', 3], ['t_seven_stars', 'Yetti yulduz qi', 'qi', 3], ['t_dragon_fist', 'Ajdaho mushti', 'fist', 3],
] as const).map(([id, name, aff, tier]) => [id, { id, name, aff, tier } as Technique]));

export const techOf = (w: World, id: string): Technique | undefined => CATALOG[id] ?? w.techs?.[id];
const pickBy = <T>(arr: readonly T[], h: number) => arr[Math.abs(h) % arr.length];

/** Uslublar kuchi: har uslub darajasi × 0.08 (moyillikka mos — ×1.5), jami +60% gacha. NPC'da keshlanadi (combat.basePower o'qiydi). */
export function refreshPower(w: World, n: NPC): void {
  let s = 0;
  for (const id of n.techs ?? []) { const t = techOf(w, id); if (t && COMBAT_AFF.includes(t.aff)) s += t.tier * 0.08 * (t.aff === n.aff ? 1.5 : 1); }
  n.tp = +(1 + Math.min(0.6, s) + (n.aff === 'body' ? 0.05 : 0)).toFixed(3);
}
export function learn(w: World, n: NPC, id: string, from: string | null, how: 'master' | 'manual' | 'sect' | 'created' | 'player'): boolean {
  const t = techOf(w, id); if (!t || n.techs?.includes(id)) return false;
  (n.techs ??= []).push(id); refreshPower(w, n);
  if ((t.tier >= 2 && how !== 'sect') || (how === 'sect' && t.secret) || how === 'player' || how === 'manual') w.emit({ type: 'technique_learned', location: n.location, subject: n.id, object: from ?? undefined, data: { tech: id, name: t.name, tier: t.tier, how } });
  return true;
}

/** Sektaning o'z uslubi (II) va sirli san'ati (III) — birinchi so'ralganda yaratiladi. */
export function sectArts(w: World, fid: string): { style: string; secret: string } {
  const T = (w.techs ??= {}), style = `s_${fid}`, secret = `x_${fid}`;
  if (!T[style]) {
    const f = w.factions[fid], short = (f?.name ?? fid).split(' ')[0], aff = pickBy(COMBAT_AFF, hashId(fid));
    T[style] = { id: style, name: `${short} uslubi`, aff, tier: 2, owner: fid };
    T[secret] = { id: secret, name: `${short} sirli san'ati`, aff, tier: 3, owner: fid, secret: true };
  }
  return { style, secret };
}

/** Moyillik va boshlang'ich uslublar (yangi dunyo yoki eski saqlash uchun bir marta; keyin — tug'ilganda). */
export function cultInit(w: World): void {
  if (w.techs) return;
  w.techs = {};
  for (const n of Object.values(w.npcs)) initNpc(w, n);
}
export function initNpc(w: World, n: NPC): void {
  if (n.aff) return;
  const h = hashId(n.id);
  n.aff = n.role === 'doctor' ? 'medicine' : n.role === 'blacksmith' ? 'craft' : w.isMartial(n) || n.role === 'child' ? pickBy(COMBAT_AFF, h) : pickBy(['sword', 'fist', 'qi', 'body', 'alchemy', 'medicine', 'craft'] as Affinity[], h);
  n.techs = [];
  const f = n.faction ? w.factions[n.faction] : undefined;
  const basic = pickBy(['t_iron_fist', 't_light_step', 't_three_cuts', 't_gather_breath'], h >>> 3);
  if (w.isMartial(n) && n.role !== 'child') n.techs.push(basic);
  if (f?.ideology === 'righteous' || f?.ideology === 'demonic' && n.role === 'bandit_chief') {
    const a = sectArts(w, f.id);
    if (['inner_disciple', 'elder', 'sect_leader', 'bandit_chief'].includes(n.role)) n.techs.push(a.style);
    if (n.role === 'sect_leader' || n.role === 'bandit_chief') n.techs.push(a.secret);
  }
  if (n.role === 'elder' || n.role === 'hermit') n.techs.push(pickBy(Object.values(CATALOG).filter(t => t.tier === (n.role === 'hermit' ? 3 : 2) && COMBAT_AFF.includes(t.aff)).map(t => t.id), h >>> 5));
  if (n.role === 'doctor') n.techs.push('t_hundred_herbs');
  if (n.role === 'blacksmith') n.techs.push('t_fire_hammer');
  n.techs = [...new Set(n.techs)];
  refreshPower(w, n);
}

/** Oylik: ustozdan shogirdga uslub uzatish, sekta uslubi, unvon bilan sirli san'at. */
export function cultivationMonthly(w: World): void {
  cultInit(w);
  const r = w.rng.get('cultivation');
  for (const m of w.alive()) {
    if (!m.techs?.length) continue;
    for (const b of m.bonds) {
      if (b.type !== 'student') continue;
      const s = w.npcs[b.other];
      if (!s?.alive || s.role === 'child') continue;
      const can = m.techs.filter(id => !s.techs?.includes(id) && !(techOf(w, id)?.secret && !['elder', 'inner_disciple'].includes(s.role)));
      if (!can.length) continue;
      const id = r.pick(can), t = techOf(w, id)!;
      if (r.chance(0.2 + (t.aff === s.aff ? 0.15 : 0) + 0.1 * s.traits.discipline)) learn(w, s, id, m.id, 'master');
    }
  }
  for (const f of Object.values(w.factions)) {
    if (!f.active || f.ideology !== 'righteous') continue;
    const a = sectArts(w, f.id);
    for (const m of w.members(f.id)) {
      if (['inner_disciple', 'elder', 'sect_leader'].includes(m.role) || (m.role === 'outer_disciple' && m.realm >= 2 && r.chance(0.15))) learn(w, m, a.style, f.leader, 'sect');
      if (m.role === 'sect_leader') learn(w, m, a.secret, null, 'sect');
    }
  }
}

/** Yorilish natijasi (npcAI.train dan): ilhom — yangi uslub, mutatsiya, buyuk yorilish. */
export function onBreakthrough(w: World, n: NPC): void {
  const r = w.rng.get('cultivation');
  if (r.chance(0.03 + 0.03 * n.traits.curiosity) && n.realm >= 2) {
    const T = (w.techs ??= {}), id = `c_${n.id}_${n.realm}`;
    const aff = n.aff && COMBAT_AFF.includes(n.aff as Affinity) ? n.aff as Affinity : r.pick(COMBAT_AFF);
    const ROOT: Record<string, string[]> = { sword: ['Shamol', 'Oy', 'Chaqmoq', 'Qor'], fist: ['Yo\'lbars', 'Tosh', 'Momaqaldiroq', 'Bo\'ri'], qi: ['Tuman', 'Shafaq', 'Jilg\'a', 'Yulduz'], body: ['Bambuk', 'Qoya', 'Temir', 'Sharshara'] };
    const KIND: Record<string, string> = { sword: 'qilichi', fist: 'mushti', qi: 'nafasi', body: 'tanasi' };
    T[id] = { id, name: `${r.pick(ROOT[aff])} ${KIND[aff]}`, aff, tier: n.realm >= 5 ? 3 : 2, owner: n.id };
    learn(w, n, id, null, 'created');
    w.emit({ type: 'technique_created', location: n.location, subject: n.id, data: { tech: id, name: T[id].name, tier: T[id].tier } });
  }
  if (r.chance(0.025)) {
    const old = n.aff; n.talent = Math.min(1.7, n.talent + 0.12);
    if (r.chance(0.5)) n.aff = r.pick(COMBAT_AFF);
    refreshPower(w, n);
    w.emit({ type: 'mutation', location: n.location, subject: n.id, data: { from: old, to: n.aff } });
  }
  if (n.realm >= 7) w.emit({ type: 'great_breakthrough', location: n.location, subject: n.id, object: n.faction ?? undefined, data: { realm: n.realm } });
}

/** Yorilish muvaffaqiyatsiz: qi og'ishi; yuqori bosqichda, jarohatli va intizomsiz bo'lsa — o'lim xavfi. */
export function deviationDeath(n: NPC, roll: number): boolean {
  if (n.realm < 2) return false;
  const p = Math.max(0, Math.min(0.3, 0.01 + 0.015 * n.realm - 0.04 * n.traits.discipline + 0.25 * n.injury));
  return roll < p;
}

/** Ustoz yonida mashq tezroq; qi moyilligi ham. */
export function trainMult(w: World, n: NPC): number {
  let k = n.aff === 'qi' ? 1.15 : 1;
  for (const b of n.bonds) if (b.type === 'master') { const m = w.npcs[b.other]; if (m?.alive && m.location === n.location) { k *= 1.25; break; } }
  return k;
}
