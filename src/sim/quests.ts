// Paydo bo'luvchi vazifalar (iltimoslar) va kechikkan oqibatlar.
// Iltimoslar qo'lda yozilmaydi — dunyo voqealaridan tug'iladi: karvon talandi, guvohsiz o'g'rilik, sirli qotillik, qishloq bosib olindi,
// ocharchilik, tabibsiz og'ir yarador. Ularni o'yinchi ham, dunyoning o'zi ham hal qilishi mumkin (jazo yurishi, ovchi, sulh);
// hech kim hal qilmasa — oqibat: savdogar kambag'allashib do'konini yopadi, ochlikdan odam o'ladi, yarador cho'loq bo'lib qoladi.
// Kechikkan oqibatlar (later): to'da qasoskor yuboradi, sekta taklif qiladi, ozod qilingan qishloq minnatdorlik yuboradi.
import type { NPC } from '../core/types.js';
import { kill } from './combat.js';
import { addMemory } from './memory.js';
import { econ, isChild, residentsOf } from './settlement.js';
import { terr } from './territory.js';
import { postBounty } from './law.js';
import type { World } from './world.js';

export type QuestKind = 'caravan' | 'theft' | 'liberate' | 'relief' | 'murder' | 'healer';
export interface Quest {
  id: string; kind: QuestKind; giver: string; place: string; target?: string; gang?: string; victim?: string;
  reward: number; day: number; due: number; status: 'open' | 'done' | 'failed'; taken?: boolean; solver?: string | null;
  amount?: number; clues?: string[]; wrong?: number;
}
export interface Later { at: number; kind: 'vendetta' | 'invite' | 'gratitude'; gang?: string; place?: string; giver?: string; }
export interface QuestBook { list: Quest[]; seq: number; later: Later[]; invites: Record<string, number>; lastInvite?: number; }

export function book(w: World): QuestBook { return (w.quests ??= { list: [], seq: w.seq, later: [], invites: {} }); }
export const openQuests = (w: World) => book(w).list.filter(q => q.status === 'open');
const MAX_OPEN = 90;

function post(w: World, q: Omit<Quest, 'id' | 'day' | 'status'>): Quest | null {
  const B = book(w);
  if (openQuests(w).length >= MAX_OPEN || B.list.some(x => x.status === 'open' && x.kind === q.kind && x.giver === q.giver)) return null;
  const full: Quest = { ...q, id: w.nextId('q'), day: w.day, status: 'open' };
  B.list.push(full);
  w.emit({ type: 'quest_posted', location: full.place, subject: full.giver, object: full.target, data: { kind: full.kind, id: full.id } });   // statistika va tarix uchun (yilnomada ko'rinmaydi)
  return full;
}
const adultAt = (w: World, loc: string) => residentsOf(w, loc).filter(n => !isChild(n) && !n.player);

/** Kunlik: yangi iltimoslar, hal bo'lganlarini yopish, muddati o'tganlariga oqibat, kechikkan oqibatlar. */
export function questsDaily(w: World): void {
  const B = book(w), r = w.rng.get('quests');
  for (let k = w.events.length - 1; k >= 0 && w.events[k].seq > B.seq; k--) {
    const e = w.events[k];
    if (e.type === 'ambush' && e.object) {   // bitta pistirma — bitta karvon: iltimosni eng boy savdogar qiladi
      const m = ((e.data?.victims as string[]) ?? []).map(v => w.npcs[v]).filter(x => x?.alive && x.role === 'merchant').sort((a, b) => b.silver - a.silver)[0];
      if (m) post(w, { kind: 'caravan', giver: m.id, place: m.home, gang: e.object, reward: Math.round(40 + 0.2 * m.silver), due: w.day + 20 });
    } else if (e.type === 'theft' && e.secret && e.object && (e.data?.amount as number) >= 10) {
      post(w, { kind: 'theft', giver: e.object, place: e.location, target: e.subject, amount: e.data!.amount as number, reward: 10 + (e.data!.amount as number), due: w.day + 15, clues: [] });
    } else if (e.type === 'territory_seized' && e.object) {
      const g = adultAt(w, e.location).sort((a, b) => b.silver - a.silver)[0];
      if (g) post(w, { kind: 'liberate', giver: g.id, place: e.location, gang: e.object, reward: 80, due: w.day + 120 });
    } else if (e.type === 'famine') {
      const g = adultAt(w, e.location)[0];
      if (g) post(w, { kind: 'relief', giver: g.id, place: e.location, reward: 0, due: w.day + 20 });
    } else if (e.type === 'death' && e.secret && e.object && e.subject) {
      const victim = w.npcs[e.subject];
      const g = victim?.bonds.filter(b => b.type === 'spouse' || b.type === 'family').map(b => w.npcs[b.other]).find(o => o?.alive && !isChild(o) && !o.player);
      if (g) post(w, { kind: 'murder', giver: g.id, place: g.home, target: e.object, victim: e.subject, reward: 60, due: w.day + 40, clues: [] });
    }
  }
  B.seq = w.seq;
  // Tabibsiz og'ir yaradorlar (haftada bir)
  if (w.day % 7 === 1) {
    let made = 0;
    for (const n of w.alive()) {
      if (made >= 5) break;
      if (n.player || isChild(n) || n.injury < 0.5 || n.opId || !econ(w).s[n.home] || residentsOf(w, n.home).some(d => d.role === 'doctor')) continue;
      if (post(w, { kind: 'healer', giver: n.id, place: n.home, reward: 15, due: w.day + 12 })) made++;
    }
  }
  // Holatni tekshirish
  for (const q of B.list) {
    if (q.status !== 'open') continue;
    const giver = w.npcs[q.giver];
    if (!giver?.alive) { q.status = 'failed'; q.solver = null; continue; }
    const t = q.target ? w.npcs[q.target] : undefined;
    if (q.kind === 'caravan' && !w.factions[q.gang!]?.active) complete(w, q, null);
    else if ((q.kind === 'theft' || q.kind === 'murder') && t && !t.alive) complete(w, q, t.killer === 'player' ? 'player' : null);
    else if (q.kind === 'liberate' && terr(w).held[q.place]?.by !== q.gang) {
      const lib = w.lastEventOf(['territory_liberated'], q.day, e => e.location === q.place);
      complete(w, q, lib?.subject === 'player' ? 'player' : null);
    } else if (q.kind === 'relief' && econ(w).s[q.place]?.famine === undefined) complete(w, q, null);
    else if (q.kind === 'relief' && lordAid(w, q, r.next())) continue;
    else if (q.kind === 'healer' && giver.injury < 0.2) complete(w, q, null);
    else if (w.day > q.due) fail(w, q, r.next());
  }
  if (B.list.length > 400) B.list = B.list.filter(q => q.status === 'open' || q.taken || w.day - q.day < 120);
  // Kechikkan oqibatlar
  const due = B.later.filter(l => l.at <= w.h);
  B.later = B.later.filter(l => l.at > w.h);
  for (const l of due) fire(w, l);
}

/** Och qishloqqa don olib kelish (o'yinchi yoki hudud egasi): ~900 birlik don aholiga bo'linadi. */
export function sendGrain(w: World, place: string): boolean {
  const s = econ(w).s[place]; if (!s) return false;
  s.food += 900 / Math.max(3, s.pop);
  return true;
}
/** Dunyoning o'zi hal qiladi: hudud egasi (sekta yoki hokimiyat) xazinasi yetsa, och qishloqqa don karvoni yuboradi. */
function lordAid(w: World, q: Quest, roll: number): boolean {
  const f = w.factions[w.locations[q.place]?.owner ?? ''];
  if (!f?.active || f.ideology === 'demonic' || f.silver < 300 || roll >= 0.06 || !sendGrain(w, q.place)) return false;
  f.silver -= 60;
  w.emit({ type: 'relief_sent', location: q.place, subject: f.id });
  return true;
}

/** Iltimos bajarildi: o'yinchi bajargan bo'lsa — mukofot, minnatdorlik, shon-shuhrat. */
export function complete(w: World, q: Quest, solver: string | null): void {
  if (q.status !== 'open') return;
  q.status = 'done'; q.solver = solver;
  if (solver !== 'player') return;
  const p = w.npcs['player'], giver = w.npcs[q.giver];
  let pay = 0;
  if (q.reward && giver) {
    const lord = q.kind === 'liberate' ? w.factions[terr(w).held[q.place]?.prev ?? ''] ?? w.factions[w.locations[q.place]?.owner ?? ''] : undefined;
    if (lord?.active && lord.ideology !== 'demonic') { pay = Math.min(q.reward, Math.floor(lord.silver)); lord.silver -= pay; }
    else { pay = Math.min(q.reward, Math.floor(giver.silver)); giver.silver -= pay; }
    if (p) p.silver += pay;
  }
  if (giver?.alive) addMemory(w, giver, { type: q.kind === 'liberate' || q.kind === 'healer' ? 'saved_life' : 'helped', subject: 'player', object: giver.id, day: w.day, location: q.place, source: 'witnessed', confidence: 1, importance: 0.7, origin: `quest_${q.id}` });
  if (q.kind === 'liberate' || q.kind === 'relief') for (const n of adultAt(w, q.place).slice(0, 12)) addMemory(w, n, { type: 'helped', subject: 'player', object: n.id, day: w.day, location: q.place, source: 'heard', confidence: 0.9, importance: 0.4, origin: `questv_${q.id}_${n.id}` });
  w.emit({ type: 'quest_done', location: q.place, subject: 'player', object: q.giver, data: { kind: q.kind, reward: pay } });
  const r = w.rng.get('quests');
  if (q.kind === 'liberate' || q.kind === 'relief') book(w).later.push({ at: w.h + 24 * r.int(10, 30), kind: 'gratitude', place: q.place, giver: q.giver });
  noticed(w);
}

/** Shon-shuhrat: biror sekta o'yinchini ko'rib qoladi (5–15 kundan keyin taklif). */
export function noticed(w: World): void {
  const B = book(w);
  if (B.lastInvite !== undefined && w.day - B.lastInvite < 60) return;
  if (B.later.some(l => l.kind === 'invite')) return;
  B.later.push({ at: w.h + 24 * w.rng.get('quests').int(5, 15), kind: 'invite' });
}
/** To'da a'zosini o'ldirdingiz — to'da 3–10 kundan keyin qasoskor yuboradi. */
export function vendetta(w: World, gang: string): void {
  const B = book(w);
  if (B.later.some(l => l.kind === 'vendetta' && l.gang === gang)) return;
  B.later.push({ at: w.h + 24 * w.rng.get('quests').int(3, 10), kind: 'vendetta', gang });
}

function fail(w: World, q: Quest, roll: number): void {
  q.status = 'failed'; q.solver = null;
  const g = w.npcs[q.giver];
  if (q.kind === 'caravan' && g?.alive) {
    g.silver = Math.floor(g.silver / 2);
    if (g.silver < 60 && g.role === 'merchant') {
      g.role = 'farmer';
      const s = econ(w).s[g.home]; if (s) s.prosperity = Math.max(0, s.prosperity - 8);
      w.emit({ type: 'shop_closed', location: g.home, subject: g.id, data: { gang: q.gang } });
    }
  } else if (q.kind === 'relief' && econ(w).s[q.place]?.famine !== undefined) {
    const weak = adultAt(w, q.place).sort((a, b) => b.age - a.age)[0];
    if (weak && (weak.age >= 55 || roll < 0.5)) kill(w, weak, null, 'famine');
  } else if (q.kind === 'healer' && g?.alive && g.injury >= 0.4) {
    g.talent = Math.max(0.5, g.talent - 0.08);
    w.emit({ type: 'crippled', location: g.location, subject: g.id });
  }
  if (q.taken) w.emit({ type: 'quest_failed', location: q.place, subject: 'player', object: q.giver, data: { kind: q.kind } });
}

function fire(w: World, l: Later): void {
  const p = w.npcs['player'];
  if (!p?.alive) return;
  if (l.kind === 'vendetta') {
    const f = w.factions[l.gang ?? '']; if (!f?.active) return;
    const m = w.members(f.id).filter(x => x.id !== f.leader && !x.opId && !x.travel && x.injury < 0.4).sort((a, b) => b.realm - a.realm)[0];
    if (!m) return;
    m.location = w.nodeOf(p); w.dirty();
    w.emit({ type: 'vendetta', location: m.location, subject: m.id, object: 'player', data: { gang: f.id } });
  } else if (l.kind === 'invite') {
    const node = w.nodeOf(p);
    const f = Object.values(w.factions).filter(x => x.active && x.ideology === 'righteous' && x.id !== p.faction && w.npcs[x.leader ?? '']?.alive)
      .sort((a, b) => w.hoursTo(node, a.base) - w.hoursTo(node, b.base))[0];
    if (!f) return;
    const B = book(w); B.invites[f.id] = w.day; B.lastInvite = w.day;
    const lead = w.npcs[f.leader!];
    addMemory(w, lead, { type: 'helped', subject: 'player', object: lead.id, day: w.day, location: f.base, source: 'heard', confidence: 0.9, importance: 0.4, origin: `fame_${f.id}_${w.day}` });
    w.emit({ type: 'invitation', location: f.base, subject: lead.id, object: 'player', data: { faction: f.id } });
  } else if (l.kind === 'gratitude') {
    const gift = 25 + w.rng.get('quests').int(0, 35);
    p.silver += gift;
    w.emit({ type: 'gratitude', location: l.place ?? p.location, subject: l.giver, object: 'player', data: { gift } });
  }
}

/** O'yinchi ayblaydi (o'g'rilik/qotillik iltimosi). To'g'ri bo'lsa — adolat, noto'g'ri bo'lsa — haqorat. */
export function accuse(w: World, q: Quest, n: NPC): 'right' | 'wrong' {
  if (n.id === q.target) {
    const g = w.npcs[q.giver];
    if (q.kind === 'theft' && g) { const back = Math.min(n.silver, q.amount ?? 0); n.silver -= back; g.silver += back; }
    postBounty(w, n, q.kind === 'theft' ? 'theft' : 'murder', w.nodeOf(n), q.kind === 'theft' ? 20 + (q.amount ?? 0) : 60 + 25 * n.realm);
    addMemory(w, n, { type: 'insulted', subject: 'player', object: n.id, day: w.day, location: n.location, source: 'witnessed', confidence: 1, importance: 0.6 });
    w.emit({ type: q.kind === 'murder' ? 'murder_exposed' : 'thief_exposed', location: n.location, subject: n.id, object: q.kind === 'murder' ? q.victim : q.giver, data: { by: 'player' } });
    complete(w, q, 'player');
    return 'right';
  }
  addMemory(w, n, { type: 'insulted', subject: 'player', object: n.id, day: w.day, location: n.location, source: 'witnessed', confidence: 1, importance: 0.5 });
  q.wrong = (q.wrong ?? 0) + 1;
  if (q.wrong >= 2) { q.status = 'failed'; q.solver = null; w.emit({ type: 'quest_failed', location: q.place, subject: 'player', object: q.giver, data: { kind: q.kind, wrong: true } }); }
  return 'wrong';
}
