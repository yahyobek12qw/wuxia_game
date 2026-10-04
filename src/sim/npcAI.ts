// Utility AI: har soatda har NPC harakatlarni baholaydi va eng yuqorisini tanlaydi.
// Score(a) = w_a * prod(C_i) * (1 + jitter)
import type { NPC, Role } from '../core/types.js';
import { basePower, battle, kill } from './combat.js';
import { deviationDeath, onBreakthrough, trainMult } from './cultivation.js';
import { addMemory, witness, gossip, rel } from './memory.js';
import type { World } from './world.js';
import { hashId, mood, search } from './ambition.js';
import { fieldYield, outdoorPenalty, qiMult } from './calendar.js';
import { settlementOf, type Settlement } from './settlement.js';

const SECT: Role[] = ['sect_leader', 'elder', 'inner_disciple', 'outer_disciple'];
const BANDIT: Role[] = ['bandit_chief', 'bandit_lieutenant', 'bandit'];
export const WAGE: Partial<Record<Role, number>> = { farmer: 0.6, merchant: 2.5, innkeeper: 1.5, doctor: 1.5, blacksmith: 1.8, guard: 1, guard_captain: 1.5, magistrate: 4 };

export function threshold(realm: number): number { return 100 * Math.pow(realm + 1, 1.8); }

// Kasbga xos ish smenasi: dehqon tongdan, taverna kechqurun, bozor kun bo'yi, qo'riqchilarning uchdan biri tunda
export const nightShift = (n: NPC): boolean => (n.role === 'guard' || n.role === 'guard_captain') && hashId(n.id) % 3 === 0;
function onShift(w: World, n: NPC, hod: number, workH: boolean): boolean {
  switch (n.role) {
    case 'farmer': return w.weather.kind === 'snow' ? hod >= 9 && hod < 14 : (hod >= 6 && hod < 12) || (hod >= 13 && hod < 18);
    case 'innkeeper': return (hod >= 10 && hod < 14) || (hod >= 17 && hod < 23);
    case 'merchant': return hod >= 8 && hod < 18 && hod !== 12;
    case 'guard': case 'guard_captain': return nightShift(n) ? hod >= 22 || hod < 6 : workH;
    default: return workH;
  }
}

function workplace(w: World, n: NPC): string | null {
  if (n.role === 'merchant') return w.day % 7 === 2 ? (w.tradePartner(n.home) ?? n.home) : n.home;
  if (WAGE[n.role] !== undefined) return n.home;
  return null;
}
const sectOf = (w: World, n: NPC) => { const f = n.faction ? w.factions[n.faction] : undefined; return f?.active && f.ideology === 'righteous' ? f : undefined; };
function trainPlace(w: World, n: NPC): string {
  if (SECT.includes(n.role)) return sectOf(w, n)?.base ?? n.home;
  return n.home;
}
function socialPlace(w: World, n: NPC): string {
  if (SECT.includes(n.role) && w.day % 7 === 6 && n.traits.curiosity > 0.5 && n.role !== 'sect_leader') {
    const base = sectOf(w, n)?.base ?? n.home;
    return w.nearest(base, w.ofKind('village')) ?? n.home;
  }
  return n.home;
}
// Shifokor: avval o'z joyidagi, bo'lmasa 12 soat ichidagi eng yaqini
function doctorPlace(w: World, n: NPC): string | null {
  const docs = w.perHour('doctors', () => w.alive().filter(x => x.role === 'doctor')).filter(d => d.alive);
  if (!docs.length) return null;
  if (docs.some(d => d.home === n.home)) return n.home;
  return w.nearest(n.home, [...new Set(docs.map(d => d.home))], 12);
}
// Yashirin ustoz (zohid) yashaydigan joy; bo'lmasa eng yaqin g'or
export function masterPlace(w: World, n: NPC): string | null {
  const hermits = w.perHour('hermits', () => w.alive().filter(x => x.role === 'hermit')).filter(h => h.alive);
  return w.nearest(n.home, hermits.length ? [...new Set(hermits.map(h => h.home))] : w.ofKind('cave'));
}

interface Choice { action: string; loc: string; score: number; target?: string }

// Qaror konteksti: decide() qayta kirmaydi, shuning uchun bitta umumiy obyekt (har chaqiriqda yangi yopilma yaratmaslik — tezlik)
const D = { c: [] as Choice[], pen: 1, here: '', jit: null as unknown as ReturnType<World['rng']['get']> };
function add(action: string, loc: string, score: number, target?: string): void {
  if (D.pen < 1 && loc !== D.here && action !== 'sleep' && action !== 'flee' && action !== 'heal' && action !== 'eat') score *= D.pen;
  D.c.push({ action, loc, score: score * (1 + 0.1 * D.jit.next()), target });
}

export function decide(w: World, n: NPC): Choice {
  const hod = w.hod;
  const night = hod >= 23 || hod < 6;
  const meal = hod === 7 || hod === 12 || hod === 18;
  const workH = (hod >= 8 && hod < 12) || (hod >= 13 && hod < 17);
  const dawn = hod >= 5 && hod < 7;
  const evening = hod >= 19 && hod < 23;
  const t = n.traits, nd = n.needs, inj = n.injury;
  D.c = []; D.pen = outdoorPenalty(w); D.here = n.location; D.jit = w.rng.get('ai');   // bo'ron/qorda uydan chiqishni istamaydi
  const c = D.c;
  const sleepTime = nightShift(n) ? hod >= 7 && hod < 14 : night;

  add('sleep', n.home, Math.pow(nd.rest / 100, 1.5) * (sleepTime ? 1.3 : 0.25) + (sleepTime ? 0.4 : 0));
  add('eat', w.locations[n.location]?.kind === 'road' ? n.home : n.location, Math.pow(nd.hunger / 100, 2) * (meal ? 1.6 : 0.7));
  const wp = workplace(w, n);
  if (wp) add('work', wp, (onShift(w, n, hod, workH) ? 0.6 : 0.03) * (0.6 + 0.4 * t.discipline) * (1 - inj));
  if (wp && hod >= 17 && hod < 21 && n.goals.some(g => g.type === 'wealth')) add('work', wp, 0.45 * (0.6 + 0.4 * t.discipline) * (1 - inj));   // boylik orzusi: kechgacha ishlaydi
  if (w.isMartial(n)) {
    const avenging = n.goals.some(g => g.type === 'avenge');
    const driven = n.goals.some(g => g.type === 'surpass') ? 0.3 : n.goals.some(g => g.type === 'rank_up') ? 0.2 : 0;   // shuhratparastlik mashqqa undaydi
    const motive = 0.35 * nd.purpose / 100 + 0.3 * t.ambition + 0.25 * t.discipline + (avenging ? 0.35 : 0) + driven;
    add('train', trainPlace(w, n), motive * (workH || dawn ? 0.95 : 0.25) * (1 - inj));
  }
  add('socialize', socialPlace(w, n), (nd.social / 100) * (evening ? 1.3 : 0.3));
  if (inj > 0.2) add('heal', doctorPlace(w, n) ?? n.home, inj * 1.5);
  if (nd.safety > 60 && n.location !== n.home) add('flee', n.home, 1.3);

  for (const g of n.goals) {
    if (g.type === 'avenge' || g.type === 'bounty') {   // qasos yoki mukofot ovi: kuch yetsa — izlab topadi
      const tgt = w.npc(g.target);
      if (!tgt?.alive) continue;
      const ratio = basePower(n) / Math.max(0.1, basePower(tgt));
      const ready = ratio >= 0.85 || (t.courage > 0.85 && ratio > 0.5);
      if (!ready || inj > 0.3) continue;
      if (g.type === 'bounty' && w.at(w.nodeOf(tgt)).some(x => x.id !== tgt.id && !!x.faction && x.faction === tgt.faction)) continue;   // ovchi nishonni yolg'iz tutadi
      if (tgt.location === n.location && w.locations[n.location].kind !== 'road') add('attack', n.location, 1.5, tgt.id);
      else if (!night && !guarded(w, tgt)) add('hunt', w.nodeOf(tgt), 0.85, tgt.id);
    }
    if (g.type === 'seek_master' && !night) { const mp = masterPlace(w, n); if (mp) add('seek_master', mp, 0.9); }
    if (g.type === 'find_manual' && !night && g.target && inj < 0.4) add('search', g.target, 0.8);
  }
  let best = c[0]; for (const x of c) if (x.score > best.score) best = x;
  return best;
}

// Nishon o'z qo'rg'onida ko'p odam bilan bo'lsa, yolg'iz bostirib kirmaydi
export function guarded(w: World, tgt: NPC): boolean {
  const loc = w.nodeOf(tgt);
  const allies = w.at(loc).filter(x => x.faction && x.faction === tgt.faction && x.id !== tgt.id);
  return allies.length >= 3;
}

// Simulyatsiya darajalari (LOD): o'yinchidan uzoqdagi NPC'lar har soatda qayta o'ylamaydi — joriy ishini (uyqu, ish, mashq,
// suhbat, davolanish) davom ettiradi va natijasi har soat hisoblanadi. Jangchilar har 3, oddiy aholi har 4 soatda qaror qiladi;
// shoshilinch ehtiyoj, ovqat vaqti yoki qasos/ov maqsadi bo'lsa — darhol qayta o'ylaydi. O'yinchi yaqinidagilar har doim to'liq AI.
const COAST = new Set(['sleep', 'work', 'socialize', 'train', 'heal']);
const slotOf = new Map<string, number>();
function nearPlayer(w: World, n: NPC): boolean {
  const near = w.perHour('lodNear', () => { const p = w.npcs['player']; return p?.alive ? w.distances(w.nodeOf(p)) : null; });
  return !!near && (near.get(w.nodeOf(n)) ?? Infinity) <= 10;
}
function coast(w: World, n: NPC): boolean {
  if (!COAST.has(n.action)) return false;
  const nd = n.needs;
  if (nd.hunger > 70 || nd.rest > 85 || nd.safety > 40 || n.injury > 0.5) return false;
  if ((w.hod === 7 || w.hod === 12 || w.hod === 18) && nd.hunger > 40) return false;
  let slot = slotOf.get(n.id); if (slot === undefined) { slot = hashId(n.id); slotOf.set(n.id, slot); }
  if ((w.h + slot) % (w.isMartial(n) ? 3 : 4) === 0) return false;
  for (const g of n.goals) if (g.type === 'avenge' || g.type === 'bounty' || g.type === 'seek_master' || g.type === 'find_manual') return false;
  return !nearPlayer(w, n);
}

export function act(w: World, n: NPC): void {
  if (n.opId) {
    const op = w.ops.find(o => o.id === n.opId);
    if (op && !op.resolved && w.h <= op.end) { n.action = `op:${op.type}`; return; }
    n.opId = undefined;
  }
  if (n.travel) { n.action = 'travel'; return; }
  if (n.role === 'child') { childAct(w, n); return; }
  if (coast(w, n)) { perform(w, n, { action: n.action, loc: n.location, score: 0 }); return; }
  const ch = decide(w, n);
  n.action = ch.action;
  if (ch.loc !== n.location) {
    if (!w.startTravel(n, ch.loc, ch.action)) n.action = 'idle';
    return;
  }
  perform(w, n, ch);
}

// Bolalar: oddiy kun tartibi (yengil simulyatsiya — utility AI'siz)
function childAct(w: World, n: NPC): void {
  const hod = w.hod, nd = n.needs;
  if (hod >= 21 || hod < 7) { n.action = 'sleep'; nd.rest = Math.max(0, nd.rest - 12); }
  else if (hod === 7 || hod === 12 || hod === 18) { n.action = 'eat'; const s = settlementOf(w, n.home); nd.hunger = Math.max(0, nd.hunger - (s && s.food < 1 ? 25 : 60)); }
  else { n.action = 'play'; nd.social = Math.max(0, nd.social - 20); nd.purpose = Math.max(0, nd.purpose - 10); }
}
// Maosh joy iqtisodiga bog'liq: dehqon — hosil va don narxi, savdogar — farovonlik, tabib — dori narxi
function wageMult(w: World, n: NPC, s: Settlement | undefined): number {
  switch (n.role) {
    case 'farmer': return fieldYield(w) * Math.min(2, s?.prices.food ?? 1);
    case 'merchant': case 'innkeeper': return 0.5 + (s?.prosperity ?? 50) / 100;
    case 'blacksmith': return (0.5 + (s?.prosperity ?? 50) / 100) * (n.aff === 'craft' ? 1.3 : 1);
    case 'doctor': return s?.prices.medicine ?? 1;
    default: return 1;
  }
}

function perform(w: World, n: NPC, ch: Choice): void {
  const nd = n.needs; const loc = w.locations[n.location];
  switch (ch.action) {
    case 'sleep': nd.rest = Math.max(0, nd.rest - 12); nd.hunger -= 2.5; break;
    case 'eat': { const s = settlementOf(w, n.location); nd.hunger = Math.max(0, nd.hunger - (s && s.food < 1 ? 25 : 60)); n.silver = Math.max(0, n.silver - 0.5 * (s?.prices.food ?? 1)); break; }   // ocharchilikda to'yib bo'lmaydi
    case 'work': n.silver += (WAGE[n.role] ?? 0.5) * wageMult(w, n, settlementOf(w, n.home)); nd.purpose = Math.max(0, nd.purpose - 6); break;
    case 'socialize': nd.social = Math.max(0, nd.social - 25); break;
    case 'flee': nd.safety = Math.max(0, nd.safety - 30); break;
    case 'heal': {
      const docN = w.at(n.location).find(x => x.role === 'doctor'), doc = !!docN;
      n.injury = Math.max(0, n.injury - (docN ? (docN.aff === 'medicine' ? 0.03 : 0.02) : 0.008));   // tabobat iste'dodli tabib tezroq davolaydi
      if (doc) n.silver = Math.max(0, n.silver - 0.3);
      break;
    }
    case 'train': train(w, n, loc.qi * qiMult(w)); break;
    case 'search': search(w, n); break;
    case 'attack': {
      const tgt = w.npc(ch.target);
      if (!tgt?.alive || tgt.location !== n.location) break;
      const defenders = w.at(n.location).filter(x => x.id !== tgt.id && x.faction && x.faction === tgt.faction && w.isMartial(x));
      const hunt = n.goals.some(g => g.type === 'bounty' && g.target === tgt.id) && !n.goals.some(g => g.type === 'avenge' && g.target === tgt.id);
      w.emit({ type: hunt ? 'bounty_attack' : 'revenge_attack', location: n.location, subject: n.id, object: tgt.id });
      battle(w, n.location, [n], [tgt, ...defenders], hunt ? 'bounty' : 'revenge');
      if (hunt && tgt.alive) { const g = n.goals.find(x => x.type === 'bounty' && x.target === tgt.id); if (g && (g.tries = (g.tries ?? 0) + 1) >= 3) n.goals = n.goals.filter(x => x !== g); }   // 3 urinishdan so'ng voz kechadi
      if (!tgt.alive && tgt.killer === n.id) {
        n.goals = n.goals.filter(g => !((g.type === 'avenge' || g.type === 'bounty') && g.target === tgt.id));
        if (!hunt) w.emit({ type: 'revenge_fulfilled', location: n.location, subject: n.id, object: tgt.id });
      }
      break;
    }
    case 'seek_master': {
      n.goals = n.goals.filter(g => g.type !== 'seek_master');
      const hermit = w.at(n.location).find(x => x.role === 'hermit');
      if (!hermit) { w.emit({ type: 'cave_empty', location: n.location, subject: n.id }); break; }
      if (n.traits.honor >= 0.55 && w.rng.get('ai').chance(0.75)) {
        n.progress += threshold(n.realm) * 0.6;
        n.taughtByHermit = true;
        n.bonds.push({ other: hermit.id, type: 'master' }); hermit.bonds.push({ other: n.id, type: 'student' });
        addMemory(w, n, { type: 'taught', subject: hermit.id, object: n.id, day: w.day, location: n.location, source: 'witnessed', confidence: 1 });
        w.emit({ type: 'taught', location: n.location, subject: hermit.id, object: n.id });
      } else {
        w.emit({ type: 'rejected', location: n.location, subject: hermit.id, object: n.id });
      }
      break;
    }
  }
}

function train(w: World, n: NPC, qi: number): void {
  const t = n.traits;
  n.progress += 0.45 * (0.5 + t.discipline) * qi * n.talent * (1 - n.injury) * trainMult(w, n);   // qi moyilligi, ustoz yonida
  n.needs.purpose = Math.max(0, n.needs.purpose - 8);
  n.needs.rest += 1;
  const th = threshold(n.realm);
  if (n.progress < th || n.realm >= 8) return;
  const r = w.rng.get('cultivation');
  const p = 0.75 - 0.07 * n.realm + 0.15 * (t.discipline - 0.5) - 0.3 * n.injury;
  if (r.chance(p)) {
    n.realm++; n.progress = 0;
    witness(w, 'breakthrough', n.id, null, n.location, { bystanders: true });
    w.emit({ type: 'breakthrough', location: n.location, subject: n.id, data: { realm: n.realm } });
    onBreakthrough(w, n);   // ilhom, mutatsiya, buyuk yorilish
  } else if (deviationDeath(n, r.next())) {
    w.emit({ type: 'qi_deviation', location: n.location, subject: n.id, data: { realm: n.realm, fatal: true } });
    kill(w, n, null, 'qi_deviation');
  } else {
    n.injury = Math.min(0.9, n.injury + 0.35); n.progress *= 0.6;
    w.emit({ type: 'qi_deviation', location: n.location, subject: n.id, data: { realm: n.realm } });
  }
}

export function updateNeeds(n: NPC): void {
  const nd = n.needs; const sleeping = n.action === 'sleep';
  nd.hunger = Math.min(100, nd.hunger + (sleeping ? 1.5 : 4));
  if (!sleeping) nd.rest = Math.min(100, nd.rest + 3);
  nd.social = Math.min(100, nd.social + 1.5);
  nd.purpose = Math.min(100, nd.purpose + 1);
  nd.safety = Math.max(0, nd.safety - 6);
}

// Bir joyda suhbatlashayotganlar orasida gossip, ba'zan haqorat yoki do'stlik
export function socialHour(w: World): void {
  const r = w.rng.get('social');
  const byLoc = new Map<string, NPC[]>();
  for (const n of w.alive()) if (n.action === 'socialize') byLoc.set(n.location, [...(byLoc.get(n.location) ?? []), n]);
  for (const [loc, group] of byLoc) {
    r.shuffle(group);
    for (let i = 0; i + 1 < group.length && i < 8; i += 2) {   // ko'pi bilan 4 juft
      const a = group[i], b = group[i + 1];
      if (w.h % 2) gossip(w, a, b); else gossip(w, b, a);   // har soat bir tomonlama (navbat bilan)
      const ra = rel(a, b.id, w);
      if ((ra.affection < -0.2 && a.traits.temper > 0.6 && r.chance(0.25)) || (a.traits.temper > 0.55 && r.chance(0.1) && mood(w, a).angry)) {   // g'azabnok odam alamini boshqadan oladi
        addMemory(w, b, { type: 'insulted', subject: a.id, object: b.id, day: w.day, location: loc, source: 'witnessed', confidence: 1 });
        w.emit({ type: 'insult', location: loc, subject: a.id, object: b.id });
      } else if (ra.affection > 0.15 && r.chance(0.03) && !a.bonds.some(x => x.other === b.id)) {
        a.bonds.push({ other: b.id, type: 'friend' }); b.bonds.push({ other: a.id, type: 'friend' });
        w.emit({ type: 'friendship', location: loc, subject: a.id, object: b.id });
      } else if (r.chance(0.04)) {
        addMemory(w, b, { type: 'helped', subject: a.id, object: b.id, day: w.day, location: loc, source: 'witnessed', confidence: 1 });
      }
    }
  }
}
