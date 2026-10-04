// Oila: nikoh, tug'ilish, bolalik, voyaga yetish (kasb tanlash), meros va motam.
// Tug'ilish aholi punktining holatiga bog'liq (oziq, xavfsizlik, farovonlik, sig'im) — dunyo o'zini o'zi to'ldiradi,
// lekin och va xavfli joylarda aholi kamayadi.
import type { NPC, NPCData, Role, Traits } from '../core/types.js';
import { TRAITS } from '../core/types.js';
import { addMemory, rel } from './memory.js';
import { econ, happiness, isChild, residentsOf } from './settlement.js';
import { join, nearFaction } from './faction.js';
import { World } from './world.js';

const GIV = ['Chen', 'Xiao', 'Yi', 'Jian', 'Hen', 'Lie', 'Shuang', 'Wu', 'Zhi', 'Ce', 'An', 'Ye', 'Lan', 'Ming', 'Rou', 'Tao', 'Yun', 'Qing', 'Hui', 'Ling'];
export const ADULT = 16;
const spouseOf = (w: World, n: NPC) => { for (const b of n.bonds) if (b.type === 'spouse') { const o = w.npcs[b.other]; if (o?.alive) return o; } return undefined; };
const parentsOf = (w: World, n: NPC) => n.bonds.filter(b => b.type === 'family').map(b => w.npcs[b.other]).filter(o => o && o.age >= n.age + 14);
const kidsOf = (w: World, n: NPC) => n.bonds.filter(b => b.type === 'family').map(b => w.npcs[b.other]).filter(o => o?.alive && o.age + 14 <= n.age);
const SHOP_CAP = 2;

/** Kunlik: tug'ilish, voyaga yetish; oyda bir: nikohlar. */
export function family(w: World): void {
  births(w);
  comingOfAge(w);
  if (w.day % 30 === 10) marriages(w);
}

function births(w: World): void {
  const E = econ(w), r = w.rng.get('family');
  for (const [id, s] of Object.entries(E.s)) {
    const fert = Math.max(0.15, Math.min(1.4, happiness(s) / 55)) * (s.pop >= s.cap ? 0.12 : 1) * (s.famine !== undefined ? 0.3 : 1);
    for (const a of residentsOf(w, id)) {
      const b = spouseOf(w, a);
      if (!b || a.id > b.id || b.home !== id || Math.min(a.age, b.age) < 18 || Math.min(a.age, b.age) > 44) continue;
      if (kidsOf(w, a).length >= 4 || !r.chance(0.0023 * fert)) continue;
      const child = bear(w, a, b, id);
      w.emit({ type: 'born', location: id, subject: child.id, data: { parents: [a.id, b.id] } });
      a.needs.purpose = 0; b.needs.purpose = 0;
    }
  }
}

/** Bola: ota-onaning xarakteri va iste'dodi o'rtachasi ± tasodif. */
export function bear(w: World, a: NPC, b: NPC, home: string): NPC {
  const r = w.rng.get('family'), mix = (x: number, y: number, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, (x + y) / 2 + r.range(-d, d)));
  const traits = Object.fromEntries(TRAITS.map(k => [k, +mix(a.traits[k], b.traits[k], 0.18, 0.05, 0.95).toFixed(2)])) as Traits;
  const name = `${a.name.split(' ')[0]} ${r.pick(GIV)}`;
  const d: NPCData = { id: `${name.toLowerCase().replace(' ', '_')}_${w.nextId('b')}`, name, age: 0, role: 'child', faction: null, home, realm: 0, progress: 0,
    talent: +mix(a.talent, b.talent, 0.15, 0.7, 1.5).toFixed(2), silver: 0, traits, bonds: [] };
  const c = w.addNpc(World.spawn(d));
  c.aff = r.chance(0.5) ? a.aff : b.aff; c.techs = []; c.tp = 1;   // iste'dod turi — ota yoki onadan
  for (const p of [a, b]) {
    for (const sib of kidsOf(w, p)) if (!c.bonds.some(x => x.other === sib.id)) { c.bonds.push({ other: sib.id, type: 'family' }); sib.bonds.push({ other: c.id, type: 'family' }); }
    c.bonds.push({ other: p.id, type: 'family' }); p.bonds.push({ other: c.id, type: 'family' });
  }
  return c;
}

// 16 yoshda kasb tanlaydi: iste'dodli va oliyjanob — sektaga; aks holda ota-ona kasbi
function comingOfAge(w: World): void {
  for (const n of w.alive()) {
    if (!isChild(n) || n.age < ADULT) continue;
    const parents = parentsOf(w, n), t = n.traits;
    const sect = nearFaction(w, n.home, f => f.ideology === 'righteous' && !f.parent);
    const gang = parents.map(p => p.faction ? w.factions[p.faction] : undefined).find(f => f?.active && f.ideology === 'demonic');
    const guardF = parents.map(p => p.faction ? w.factions[p.faction] : undefined).find(f => f?.active && f.ideology === 'neutral');
    const shops = residentsOf(w, n.home).filter(o => o.role === 'merchant').length;
    let role: Role;
    if (sect && n.talent > 1.08 && t.honor > 0.45) { join(w, n, sect, 'outer_disciple'); role = 'outer_disciple'; }
    else if (gang && t.greed > 0.45) { join(w, n, gang, 'bandit'); role = 'bandit'; }
    else if (guardF && t.courage > 0.5 && w.members(guardF.id).length < 10) { join(w, n, guardF, 'guard'); role = 'guard'; }
    else {
      const civil = parents.map(p => p.role).find(x => x === 'merchant' ? shops < SHOP_CAP : ['innkeeper', 'doctor', 'blacksmith', 'farmer'].includes(x));
      role = civil ?? (w.locations[n.home]?.kind === 'village' ? 'farmer' : 'wanderer');
      n.role = role;
    }
    n.silver += 5;
    w.emit({ type: 'came_of_age', location: n.home, subject: n.id, data: { role, faction: n.faction } });
  }
}

// Bir joydagi turmush qurmaganlar orasida, bir-birini yomon ko'rmasa — to'y
function marriages(w: World): void {
  const r = w.rng.get('family');
  for (const id of w.settlements()) {
    const singles = residentsOf(w, id).filter(n => !n.player && !isChild(n) && n.age >= 18 && n.age <= 50 && !n.travel && !['hermit', 'sect_leader'].includes(n.role) && !spouseOf(w, n));
    if (singles.length < 2) continue;
    const taken = new Set<string>();
    for (const a of r.shuffle([...singles])) {
      if (taken.has(a.id) || !r.chance(0.18)) continue;
      const cands = singles.filter(b => b !== a && !taken.has(b.id) && Math.abs(a.age - b.age) <= 12 && !a.bonds.some(x => x.other === b.id && x.type === 'family')
        && rel(a, b.id, w).affection > -0.2 && rel(b, a.id, w).affection > -0.2);
      if (!cands.length) continue;
      const b = cands.sort((x, y) => rel(a, y.id, w).affection - rel(a, x.id, w).affection)[0];
      taken.add(a.id); taken.add(b.id);
      a.bonds.push({ other: b.id, type: 'spouse' }); b.bonds.push({ other: a.id, type: 'spouse' });
      for (const [x, y] of [[a, b], [b, a]]) addMemory(w, x, { type: 'gift', subject: y.id, object: x.id, day: w.day, location: id, source: 'witnessed', confidence: 1, importance: 0.5, origin: `wed_${a.id}_${b.id}_${x.id}` });
      w.emit({ type: 'married', location: id, subject: a.id, object: b.id });
    }
  }
}

/** O'lim: mol-mulk merosxo'rlarga, do'kon farzandga; yaqinlar motam tutadi. */
export function inherit(w: World, n: NPC): void {
  if (n.player) return;
  const heirs = n.bonds.filter(b => b.type === 'spouse' || b.type === 'family').map(b => w.npcs[b.other]).filter(o => o?.alive && !o.player);
  const amount = Math.floor(n.silver);
  if (heirs.length && amount > 0) {
    const spouse = heirs.find(o => o.bonds.some(b => b.other === n.id && b.type === 'spouse'));
    const rest = heirs.filter(o => o !== spouse);
    const sp = spouse ? (rest.length ? Math.floor(amount / 2) : amount) : 0;
    if (spouse) spouse.silver += sp;
    for (const o of rest) o.silver += Math.floor((amount - sp) / rest.length);
    n.silver = 0;
    if (amount >= 40) w.emit({ type: 'inheritance', location: n.home, subject: n.id, data: { amount, heirs: heirs.length } });
  } else if (amount > 0 && n.faction && w.factions[n.faction]?.active) { w.factions[n.faction].silver += amount; n.silver = 0; }
  if (n.role === 'merchant') {
    const heir = heirs.find(o => o.home === n.home && o.role === 'farmer' && !isChild(o));
    if (heir) { heir.role = 'merchant'; w.emit({ type: 'inherited_shop', location: n.home, subject: heir.id, object: n.id }); }
  }
  if (!n.killer) for (const o of heirs) addMemory(w, o, { type: 'mourned', subject: n.id, object: o.id, day: w.day, location: n.home, source: 'heard', confidence: 1, origin: `mourn_${n.id}_${o.id}` });
}
