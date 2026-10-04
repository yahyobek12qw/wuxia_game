// Xotira va munosabatlar: munosabat hech qachon to'g'ridan-to'g'ri o'zgartirilmaydi,
// u bog'lanishlar (bonds) va xotiralardan qayta hisoblanadi.
import type { BondType, Memory, MemoryType, NPC, Relation } from '../core/types.js';
import { REL_KEYS } from '../core/types.js';
import type { World } from './world.js';

export const MEMORY_DEFAULTS: Record<MemoryType, { importance: number; permanence: number; harm: boolean }> = {
  saved_life: { importance: 0.9, permanence: 1, harm: false },
  helped: { importance: 0.3, permanence: 0, harm: false },
  gift: { importance: 0.35, permanence: 0, harm: false },
  taught: { importance: 0.8, permanence: 0.8, harm: false },
  insulted: { importance: 0.4, permanence: 0, harm: true },
  attacked: { importance: 0.6, permanence: 0.3, harm: true },
  killed: { importance: 1.0, permanence: 1, harm: true },
  stole: { importance: 0.5, permanence: 0.3, harm: true },
  betrayed: { importance: 0.9, permanence: 1, harm: true },
  breakthrough: { importance: 0.3, permanence: 0, harm: false },
  promoted: { importance: 0.3, permanence: 0, harm: false },
  bribed: { importance: 0.7, permanence: 0.6, harm: true },
  raided: { importance: 0.5, permanence: 0.2, harm: true },
  mourned: { importance: 0.6, permanence: 0.3, harm: true },
};

// Subyektga nisbatan ta'sir (kuzatuvchi = obyektning o'zi bo'lsa)
const EFFECTS: Record<MemoryType, Partial<Relation>> = {
  saved_life: { trust: 0.5, respect: 0.3, affection: 0.5, debt: 0.9 },
  helped: { trust: 0.15, affection: 0.15, debt: 0.2 },
  gift: { affection: 0.25, trust: 0.05, debt: 0.1 },
  taught: { respect: 0.35, affection: 0.2, trust: 0.15, debt: 0.3 },
  insulted: { affection: -0.35, respect: -0.1, trust: -0.05 },
  attacked: { trust: -0.5, affection: -0.45, fear: 0.35 },
  killed: { trust: -0.9, affection: -1, fear: 0.4 },
  stole: { trust: -0.5, affection: -0.25 },
  betrayed: { trust: -1, affection: -0.6 },
  breakthrough: { respect: 0.25 },
  promoted: { respect: 0.2 },
  bribed: { trust: -0.6, respect: -0.4 },
  raided: { trust: -0.5, affection: -0.35, fear: 0.3 },
  mourned: { affection: 0.1 },
};

const BOND_STRENGTH: Record<BondType, number> = { master: 0.8, student: 0.75, family: 0.9, lover: 1, sworn: 0.9, friend: 0.6, rival: 0, spouse: 1 };
const BOND_BASE: Record<BondType, Partial<Relation>> = {
  master: { respect: 0.5, affection: 0.3, trust: 0.35, debt: 0.2 },
  student: { affection: 0.3, trust: 0.2 },
  family: { affection: 0.6, trust: 0.5 },
  friend: { affection: 0.4, trust: 0.3 },
  rival: { respect: 0.2, affection: -0.3 },
  lover: { affection: 0.8, trust: 0.5 },
  sworn: { affection: 0.6, trust: 0.7, debt: 0.2 },
  spouse: { affection: 0.75, trust: 0.6 },
};

export const zeroRel = (): Relation => ({ trust: 0, respect: 0, affection: 0, fear: 0, debt: 0 });
const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));

export function bondStrength(a: NPC, b: string): number {
  let s = 0;
  for (const bd of a.bonds) if (bd.other === b) s = Math.max(s, BOND_STRENGTH[bd.type]);
  return s;
}
export function hasBond(a: NPC, b: string, type?: BondType): boolean {
  return a.bonds.some(bd => bd.other === b && (!type || bd.type === type));
}
/** Munosabat: saqlangan shaxsiy qism (rishtalar + xotiralar) + jonli fraksiya qismi, so'ng chegaralanadi. */
export function rel(a: NPC, b: string, w?: World): Relation {
  const p = a.relations[b], r = p ? { ...p } : zeroRel();
  if (w && a.faction) {
    const o = w.npcs[b];
    if (o?.alive && o.faction && o.id !== a.id) {
      if (o.faction === a.faction) { r.trust += 0.1; r.affection += 0.05; }
      else if (w.tension(a.faction, o.faction) > 50) { r.trust -= 0.2; r.affection -= 0.1; }
    }
  }
  for (const k of REL_KEYS) r[k] = clamp(r[k], k === 'fear' || k === 'debt' ? 0 : -1, 1);
  return r;
}

// Kuzatuvchi nuqtai nazaridan xotira ta'siri koeffitsienti
function scaleFor(w: World, obs: NPC, m: Memory): { k: number; judge: boolean } {
  if (m.object === obs.id) return { k: 1, judge: false };
  if (m.object === null) return { k: 0.6, judge: false };
  const close = Math.max(bondStrength(obs, m.object), rel(obs, m.object, w).affection);
  if (close > 0.25) return { k: 0.4 + 0.6 * Math.min(1, close), judge: false };
  if (rel(obs, m.object, w).affection < -0.3) return { k: -0.3, judge: false };
  return { k: 0, judge: true };
}

export function recomputeRelations(w: World, n: NPC): void {
  const out: Record<string, Relation> = {};
  const get = (id: string) => (out[id] ??= zeroRel());
  for (const b of n.bonds) {
    const r = get(b.other);
    for (const k of REL_KEYS) r[k] += BOND_BASE[b.type][k] ?? 0;
  }
  for (const m of n.memories) contribute(w, n, m, out);
  n.relations = out;   // xom (chegaralanmagan) shaxsiy qism; o'qish — rel() orqali
}

/** Bitta xotiraning munosabatga hissasi (to'liq qayta hisoblashda ham, yangi xotira qo'shilganda ham). */
function contribute(w: World, n: NPC, m: Memory, out: Record<string, Relation>): void {
    if (m.subject === n.id || m.subject === 'unknown') return;
    const { k, judge } = scaleFor(w, n, m);
    const e = EFFECTS[m.type];
    const wgt = m.importance * m.confidence;
    const r = (out[m.subject] ??= zeroRel());
    if (judge) {
      const h = n.traits.honor;
      if (MEMORY_DEFAULTS[m.type].harm) {
        r.trust += (e.trust ?? 0) * 0.25 * h * wgt;
        r.affection += (e.affection ?? 0) * 0.15 * h * wgt;
        r.fear += (e.fear ?? 0) * 0.4 * wgt;
      } else {
        for (const key of REL_KEYS) r[key] += (e[key] ?? 0) * 0.2 * wgt;
      }
      if (m.type === 'bribed') { r.trust += (e.trust ?? 0) * h * wgt; r.respect += (e.respect ?? 0) * h * wgt; }
    } else {
      for (const key of REL_KEYS) r[key] += (e[key] ?? 0) * k * wgt;
    }
}

// Keshlar (2600+ NPC): NPC biladigan xotiralar (origin) to'plami va "aytishga arziydigan" eng muhim xotiralari.
// Xotiralar faqat addMemory orqali qo'shiladi (oxiriga); so'nish/siqish massivni almashtiradi yoki qisqartiradi — kesh yangilanadi.
const knownC = new WeakMap<Memory[], { len: number; set: Set<string> }>();
function knownOf(n: NPC): Set<string> {
  const arr = n.memories; let c = knownC.get(arr);
  if (!c || c.len > arr.length) { c = { len: 0, set: new Set() }; knownC.set(arr, c); }
  for (let i = c.len; i < arr.length; i++) c.set.add(arr[i].origin);
  c.len = arr.length; return c.set;
}
const topC = new WeakMap<Memory[], { len: number; list: Memory[] }>();
function topOf(n: NPC): Memory[] {
  const arr = n.memories; let c = topC.get(arr);
  if (!c || c.len !== arr.length) {
    c = { len: arr.length, list: arr.filter(m => m.confidence >= 0.35 && m.importance * m.confidence > 0.25).sort((a, b) => b.importance * b.confidence - a.importance * a.confidence).slice(0, 24) };
    topC.set(arr, c);
  }
  return c.list;
}

export function addMemory(w: World, n: NPC, m: Omit<Memory, 'id' | 'origin' | 'importance' | 'permanence'> & Partial<Pick<Memory, 'importance' | 'permanence' | 'origin'>>): Memory | null {
  if (!n.alive) return null;
  const d = MEMORY_DEFAULTS[m.type];
  const origin = m.origin ?? w.nextId('m');
  if (knownOf(n).has(origin)) return null;
  const mem: Memory = { importance: d.importance, permanence: d.permanence, ...m, id: w.nextId('m'), origin };
  n.memories.push(mem);
  if (n.memories.length > 200) { compress(n); recomputeRelations(w, n); }
  else contribute(w, n, mem, n.relations);   // inkremental; to'liq qayta hisob — haftalik so'nishda
  onMemory(w, n, mem);
  return mem;
}

function compress(n: NPC): void {
  n.memories.sort((a, b) => b.importance * b.confidence - a.importance * a.confidence);
  n.memories.length = 160;
}

// Xotiradan maqsad (goal) paydo bo'lishi
function onMemory(w: World, n: NPC, m: Memory): void {
  if (m.type !== 'killed' || !m.object || m.subject === 'unknown' || m.subject === n.id) return;
  const killer = w.npc(m.subject);
  if (!killer?.alive) return;
  const b = bondStrength(n, m.object);
  if (b <= 0) return;
  const t = n.traits;
  const vengeance = 0.3 * t.temper + 0.25 * t.courage + 0.25 * t.loyalty + 0.4 * b;
  if (vengeance < 0.72 || n.goals.some(g => g.type === 'avenge' && g.target === killer.id)) return;
  if (n.faction && n.faction === killer.faction) return;
  n.goals.push({ type: 'avenge', target: killer.id, since: w.day });
  w.emit({ type: 'vow_revenge', location: n.location, subject: n.id, object: killer.id, data: { victim: m.object } });
}

// Kuzatuvchilarga xotira tarqatish
export function witness(w: World, type: MemoryType, subject: string, object: string | null, loc: string,
  opts: { bystanders?: boolean; extra?: Partial<Memory>; present?: NPC[] } = {}): void {
  const present = opts.present ?? w.at(loc);
  for (const o of present) {
    if (o.id === subject) continue;
    const personal = o.id === object || (object !== null && (bondStrength(o, object) > 0 || rel(o, object, w).affection > 0.25));
    if (!personal && (!opts.bystanders || o.role === 'child')) continue;   // bolalar faqat o'ziga va yaqinlariga tegishlisini eslaydi
    addMemory(w, o, { type, subject, object, day: w.day, location: loc, source: 'witnessed', confidence: 1, ...opts.extra });
  }
}

// Gossip: so'zlovchi tinglovchi bilmagan eng muhim xotirani aytadi; ishonch 20% kamayadi
export function gossip(w: World, a: NPC, b: NPC): void {
  const known = knownOf(b);
  let best: Memory | null = null;
  for (const m of topOf(a)) {      // muhimlik bo'yicha saralangan: birinchi mos kelgani — eng muhimi
    if (known.has(m.origin) || m.subject === b.id) continue;
    if (m.secret) {
      // Sirni faqat ishonchli odamga, qo'rquvni yenga olsa aytadi
      const fear = rel(a, m.subject, w).fear;
      if (rel(a, b.id, w).trust < 0.25 || b.id === m.subject) continue;
      if (!w.rng.get('social').chance(0.12 * a.traits.courage * (1 - fear))) continue;
    }
    best = m; break;
  }
  if (!best) return;
  addMemory(w, b, { ...best, source: 'heard', confidence: best.confidence * 0.8, importance: best.importance * 0.85, origin: best.origin });
}

// Xotiralar sekin so'nadi: har NPC haftada bir marta (kunlarga taqsimlangan) 7 kunlik so'nish bilan qayta hisoblanadi — tezlik uchun
const slot = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return ((h % 7) + 7) % 7; };
export function decayMemories(w: World): void {
  for (const n of w.alive()) {
    if ((w.day + slot(n.id)) % 7 !== 0) continue;
    for (const m of n.memories) m.importance *= Math.pow(0.985, 7 * (1 - m.permanence));
    n.memories = n.memories.filter(m => m.importance > 0.05);
    recomputeRelations(w, n);
  }
}
