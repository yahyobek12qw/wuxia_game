// Fraksiya AI (kunlik), operatsiyalar, vorislik, maxfiy fitnalar, yollash.
import { residentsOf, settlementOf } from './settlement.js';
import { travelMult } from './calendar.js';
import type { Faction, NPC, Operation, OpType } from '../core/types.js';
import { MARTIAL_ROLES } from '../core/types.js';
import { basePower, battle, kill } from './combat.js';
import { addMemory, rel, witness, hasBond } from './memory.js';
import type { World } from './world.js';
import { Rng } from '../core/rng.js';

const ready = (n: NPC) => n.alive && n.injury < 0.5 && !n.opId && !n.dismissed;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
// Masofalar (soat): katta dunyoda fraksiyalar faqat o'z atrofida harakat qiladi
const RAID_RANGE = 24, AMBUSH_RANGE = 20, MARCH_RANGE = 40, JOIN_RANGE = 30;
const rankOf: Record<string, number> = { sect_leader: 5, elder: 4, bandit_chief: 5, bandit_lieutenant: 4, guard_captain: 4, inner_disciple: 3, magistrate: 3, outer_disciple: 2, bandit: 2, guard: 2 };

// ---------- Operatsiyalar ----------
function planOp(w: World, f: Faction, type: OpType, target: string, members: NPC[], startHod: number, hours: number): Operation | null {
  if (!members.length) return null;
  let start = (w.day + 1) * 24 + startHod;
  // Uzoq nishon: a'zolar oyna tugaguncha yetib bora olmasa, operatsiya keyingi kunga suriladi
  const far = travelMult(w) * Math.max(...members.map(m => w.hoursTo(w.nodeOf(m), target)));
  if (Number.isFinite(far) && w.h + far > start + hours) start += 24 * Math.ceil((w.h + far - start - hours) / 24);
  const op: Operation = { id: w.nextId('op'), faction: f.id, type, target, start, end: start + hours, members: members.map(m => m.id), resolved: false, engaged: [] };
  for (const m of members) { m.opId = op.id; w.startTravel(m, target, `op:${type}`, start); }
  w.ops.push(op);
  f.lastOpDay = w.day;
  w.emit({ type: 'op_planned', location: f.base, subject: f.leader ?? undefined, object: f.id, data: { op: type, target, members: op.members.length }, secret: true });
  return op;
}

function recent(w: World, types: string[], days: number, pred: (e: { location: string; object?: string; subject?: string; data?: Record<string, unknown> }) => boolean): number {
  let c = 0;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = w.events[i];
    if (e.day < w.day - days) break;
    if (types.includes(e.type) && pred(e)) c++;
  }
  return c;
}

export function factionAI(w: World): void {
  const r = w.rng.get('faction');
  for (const f of Object.values(w.factions)) {
    if (!f.active) continue;
    const leader = w.npc(f.leader);
    const mem = w.members(f.id);
    if (f.ideology === 'demonic' && leader?.alive) banditAI(w, f, leader, mem, r);
    if (f.ideology === 'righteous') sectAI(w, f, leader, mem, r);
    if (f.ideology === 'neutral') guardAI(w, f, mem, r);
  }
}

function banditAI(w: World, f: Faction, leader: NPC, mem: NPC[], r: Rng): void {
  f.silver -= mem.length * 1.5 + f.silver * 0.015; // saqlash xarajati + isrof (qimor, pora, yo'qotish)
  if (f.silver < 0) { f.silver = 0; f.cohesion = Math.max(0.2, f.cohesion - 0.01); }
  if (w.weather.kind === 'storm') return;                // bo'ronda qaroqchilar ham uyada o'tiradi
  if (w.day - f.lastOpDay < 3 || mem.length < 4) return;
  const avail = mem.filter(ready);
  const pressure = Math.max(0, Math.min(1, 1 - f.silver / 1200));
  const atkPower = sum(avail.map(basePower));
  const g = leader.traits.greed, amb = leader.traits.ambition;
  const options: [OpType, string, number][] = [];
  const near = (ids: string[], range: number) => ids.map(id => [id, w.hoursTo(f.base, id)] as const).filter(([, h]) => h <= range).sort((a, b) => a[1] - b[1]).map(([id]) => id);
  for (const v of near(w.ofKind('village'), RAID_RANGE)) {
    const owner = w.locations[v].owner, guarded = owner && w.factions[owner]?.active && w.factions[owner].ideology !== 'demonic';
    const patrols = w.ops.filter(o => !o.resolved && o.target === v && o.faction !== f.id).flatMap(o => o.members.map(id => w.npcs[id]).filter(m => m?.alive && m.opId === o.id));
    const villageDef = sum([...residentsOf(w, v), ...patrols].filter(n => MARTIAL_ROLES.includes(n.role)).map(basePower)) + (guarded ? 6 : 0);
    const st = settlementOf(w, v);   // boy, lekin himoyasiz qishloq — eng yaxshi o'lja
    options.push(['raid', v, 0.35 * g + 0.4 * pressure + 0.2 * amb - 0.5 * villageDef / Math.max(1, atkPower) + 0.15 + (st ? 0.25 * st.prosperity / 100 - 0.25 * st.security / 100 : 0)]);
  }
  const caravans = (w.day + 1) % 7 === 2 ? caravanRoads(w) : null;   // ertaga bozor kuni: josuslar karvon qaysi yo'ldan o'tishini biladi
  for (const road of near(caravans ? [...new Set([...w.tradeRoads(), ...caravans])] : w.tradeRoads(), AMBUSH_RANGE)) {
    const owner = w.locations[road]?.owner, patrolled = !f.bribed && !!owner && !!w.factions[owner]?.active;
    options.push(['ambush', road, 0.3 * g + 0.35 * pressure + (patrolled ? 0.05 : 0.3) + (caravans?.has(road) ? CARAVAN_BONUS : 0)]);
  }
  for (const x of Object.values(w.factions)) {
    if (!x.active || x.ideology !== 'righteous' || x.parent || w.tension(f.id, x.id) <= 60) continue;
    const road = w.nearest(f.base, w.roadsAt(x.base), MARCH_RANGE);
    if (road) options.push(['ambush', road, 0.25 * leader.traits.temper + 0.2]);
  }
  if (!options.length) return;
  options.sort((a, b) => b[2] - a[2]);
  const [type, target, score] = options[0];
  if (score < 0.45 || !r.chance(0.55)) return;
  const n = type === 'raid' ? Math.ceil(avail.length * 0.7) : Math.min(4, avail.length);
  const team = r.shuffle([...avail]).slice(0, n);
  if (type === 'raid' && !team.includes(leader) && ready(leader) && r.chance(0.6)) team[0] = leader;
  planOp(w, f, type, target, team, type === 'raid' ? 1 : 8, type === 'raid' ? 2 : 10);
}

/** Savdogarlar bozor kuni (npcAI workplace: haftada bir) qo'shni bozorga boradigan yo'llar — pistirma uchun eng boy o'lja. */
const CARAVAN_BONUS = 0.05;
function caravanRoads(w: World): Set<string> {
  return w.perHour('caravanRoads', () => {
    const roads = new Set<string>();
    for (const n of w.alive()) {
      if (n.role !== 'merchant' || n.player) continue;
      const to = w.tradePartner(n.home);
      if (to) for (const l of w.route(n.home, to) ?? []) roads.add(l.road);
    }
    return roads;
  });
}

function sectAI(w: World, f: Faction, leader: NPC | undefined, mem: NPC[], r: Rng): void {
  if (f.succession) return;
  const avail = mem.filter(ready);
  // Qishloqqa hujum bo'lgan bo'lsa — patrul
  const patrolling = w.ops.some(o => !o.resolved && o.faction === f.id && o.type === 'patrol');
  const owned = w.ofKind('village').filter(v => w.locations[v].owner === f.id);
  const hit = owned.find(v => recent(w, ['raid', 'raid_repelled'], 10, e => e.location === v) > 0);
  if (hit && !patrolling) {
    const team = avail.filter(n => n.role === 'outer_disciple' || n.role === 'inner_disciple').slice(0, 4);
    planOp(w, f, 'patrol', hit, team, 9, 72);
  }
  // Jazo yurishi
  const enemy = Object.entries(f.tension).find(([fid, t]) => t >= 75 && w.factions[fid]?.active && (w.factions[fid].ideology === 'demonic' || !!f.wars?.includes(fid)) && w.hoursTo(f.base, w.factions[fid].base) <= MARCH_RANGE);
  if (enemy && leader?.alive && w.day - f.lastOpDay >= 5 && r.chance(0.5)) {
    const team = avail.filter(n => n.role === 'elder' || n.role === 'inner_disciple' || (n.role === 'outer_disciple' && n.realm >= 2));
    const target = w.factions[enemy[0]].base;
    const foePower = sum(w.members(enemy[0]).map(basePower));
    if (sum(team.map(basePower)) >= 1.2 * foePower && planOp(w, f, 'expedition', target, team, 10, 3)) {
      w.emit({ type: 'expedition_declared', location: f.base, subject: leader.id, object: enemy[0] });
      // Ittifoqchilar umumiy dushmanga qarshi yurishga qo'shiladi
      for (const aid of f.allies ?? []) {
        const al = w.factions[aid]; if (!al?.active || al.succession || w.tension(al.id, enemy[0]) < 50) continue;
        const allyTeam = w.members(al.id).filter(ready).filter(n => n.role === 'elder' || n.role === 'inner_disciple');
        if (allyTeam.length && planOp(w, al, 'expedition', target, allyTeam, 10, 3)) w.emit({ type: 'ally_joins', location: al.base, subject: al.id, object: f.id, data: { enemy: enemy[0] } });
      }
    }
  }
}

function guardAI(w: World, f: Faction, mem: NPC[], r: Rng): void {
  // Eng yaqin faol to'da va shu to'da tomonidan sotib olingan amaldor
  const gangs = Object.values(w.factions).filter(x => x.active && x.ideology === 'demonic' && w.hoursTo(f.base, x.base) <= MARCH_RANGE);
  const bandits = gangs.sort((a, b) => w.tension(f.id, b.id) - w.tension(f.id, a.id))[0];
  const corrupt = gangs.some(x => { const m = w.npc(x.bribed); return !!m?.alive && !m.dismissed && m.faction === f.id; });
  const avail = mem.filter(n => ready(n) && (n.role === 'guard' || n.role === 'guard_captain'));
  const roads = w.roadsAt(f.base), road = roads.find(x => w.locations[x]?.owner === f.id) ?? roads.find(x => w.tradeRoads().includes(x));
  if (!corrupt && road && avail.length >= 2 && !w.ops.some(o => !o.resolved && o.faction === f.id && o.type === 'patrol'))
    planOp(w, f, 'patrol', road, r.shuffle([...avail.filter(n => n.role === 'guard')]).slice(0, 2), 9, 8);
  if (!corrupt && bandits?.active && w.tension(f.id, bandits.id) >= 85 && w.day - f.lastOpDay >= 7 && avail.length >= 3) {
    if (planOp(w, f, 'expedition', bandits.base, avail, 11, 3))
      w.emit({ type: 'expedition_declared', location: f.base, subject: avail.find(n => n.role === 'guard_captain')?.id, object: bandits.id });
  }
}

// Har soatda: operatsiya nishonida jang
export function resolveOps(w: World): void {
  for (const op of w.ops) {
    if (op.resolved) continue;
    if (w.h > op.end) { op.resolved = true; for (const id of op.members) { const m = w.npcs[id]; if (m?.opId === op.id) m.opId = undefined; } continue; }
    if (w.h < op.start) continue;
    const team = op.members.map(id => w.npcs[id]).filter(m => m.alive && m.location === op.target && m.opId === op.id);
    if (!team.length) continue;
    if (op.type === 'raid' || op.type === 'expedition') {
      const expected = op.members.filter(id => w.npcs[id]?.alive && w.npcs[id].opId === op.id).length;
      if (team.length < expected && w.h < op.start + 3) continue; // kechikkanlarni kutadi
      fightAt(w, op, team);
      op.resolved = true;
      for (const m of team) { m.opId = undefined; }
    } else if (op.type === 'ambush') {
      const victims = w.at(op.target).filter(n => n.faction !== op.faction && !op.engaged.includes(n.id) && !n.opId);
      if (!victims.length) continue;
      op.engaged.push(...victims.map(v => v.id));
      fightAt(w, op, team, victims);
    }
  }
}

function fightAt(w: World, op: Operation, team: NPC[], targets?: NPC[]): void {
  const loc = op.target;
  const f = w.factions[op.faction];
  const others = targets ?? w.at(loc).filter(n => n.faction !== op.faction);
  // Ayni joydagi patrul/himoyachilar qo'shiladi
  const helpers = targets ? w.at(loc).filter(n => n.opId && n.faction !== op.faction && w.ops.find(o => o.id === n.opId)?.type === 'patrol' && !targets.includes(n)) : [];
  const pool = [...others, ...helpers];
  const fighters = pool.filter(n => !n.player && n.role !== 'child' && (MARTIAL_ROLES.includes(n.role) ? n.traits.courage > 0.3 || !!n.faction : n.traits.courage > 0.75)); // o'yinchi bosqinda tinch aholi
  const civilians = pool.filter(n => !fighters.includes(n));
  const leadId = team.slice().sort((a, b) => (rankOf[b.role] ?? 1) - (rankOf[a.role] ?? 1))[0].id;
  const kind = op.type === 'expedition' ? 'expedition' : op.type;
  w.emit({ type: `${kind}_start`, location: loc, subject: leadId, object: f.id, data: { attackers: team.length, defenders: fighters.length } });
  for (const c of civilians) { c.needs.safety = 100; }
  const res = battle(w, loc, team, fighters, kind);
  const win = res.winner === 'A' || (res.winner === 'none' && fighters.length === 0);
  const owner = w.locations[loc].owner ?? (targets?.[0]?.faction ?? null);

  if (win) {
    let loot = 0;
    for (const v of [...civilians, ...fighters.filter(x => x.alive)]) { const take = Math.floor(v.silver * 0.4); v.silver -= take; loot += take; }
    if (op.type === 'expedition') {
      const enemy = Object.values(w.factions).find(x => x.base === loc);
      if (enemy) { loot += Math.floor(enemy.silver * 0.5); enemy.silver -= Math.floor(enemy.silver * 0.5); w.addTension(f.id, enemy.id, -35); }
    }
    f.silver += loot;
    witness(w, 'raided', leadId, null, loc, { present: [...civilians, ...fighters].filter(x => x.alive), bystanders: true });
    w.emit({ type: op.type === 'ambush' ? 'ambush' : op.type === 'expedition' ? 'expedition_victory' : 'raid', location: loc, subject: leadId, object: f.id,
      data: { loot, killed: res.killed.length, victims: [...civilians, ...fighters].map(v => v.id) } });
  } else {
    w.emit({ type: op.type === 'expedition' ? 'expedition_failed' : op.type === 'ambush' ? 'ambush_repelled' : 'raid_repelled', location: loc, subject: leadId, object: f.id,
      data: { killed: res.killed.length, defenders: fighters.map(x => x.id) } });
  }
  if (owner && owner !== f.id && w.factions[owner]) w.addTension(f.id, owner, op.type === 'expedition' ? 5 : 12);
  for (const v of targets ?? []) if (v.faction && v.faction !== f.id) w.addTension(f.id, v.faction, 8);
  for (const m of team) if (m.alive) { m.opId = undefined; w.startTravel(m, m.home, 'return'); }
}

// ---------- Rahbarlik va vorislik ----------
export function leadership(w: World): void {
  const r = w.rng.get('politics');
  for (const f of Object.values(w.factions)) {
    if (!f.active) continue;
    const mem = w.members(f.id);
    if (mem.length < 3 && f.ideology === 'demonic') { disband(w, f); continue; }
    if (mem.length === 0) {
      f.active = false;
      for (const o of Object.values(w.factions)) { delete o.tension[f.id]; delete f.tension[o.id]; }
      continue;
    }
    if (f.leader && w.npc(f.leader)?.alive) continue;
    if (f.succession) { succession(w, f, r); continue; }

    if (f.ideology !== 'righteous') {
      const next = mem.slice().sort((a, b) => (rankOf[b.role] ?? 0) * 10 + basePower(b) - ((rankOf[a.role] ?? 0) * 10 + basePower(a)))[0];
      f.leader = next.id;
      if (f.ideology === 'demonic') next.role = w.locations[f.base]?.kind === 'sect' ? 'sect_leader' : 'bandit_chief';
      w.emit({ type: 'new_leader', location: f.base, subject: next.id, object: f.id, data: { peaceful: true } });
      continue;
    }
    const elders = mem.filter(n => n.role === 'elder');
    const claimants = elders.filter(e => e.traits.ambition > 0.5).sort((a, b) => claim(w, f, b) - claim(w, f, a)).slice(0, 2);
    if (claimants.length < 2) {
      const winner = claimants[0] ?? elders.sort((a, b) => b.realm - a.realm)[0] ?? mem.sort((a, b) => b.realm - a.realm)[0];
      crown(w, f, winner, true);
    } else {
      f.succession = { start: w.day, end: w.day + r.int(6, 14), claimants: claimants.map(c => c.id) };
      f.cohesion = Math.max(0, f.cohesion - 0.25);
      w.emit({ type: 'succession_crisis', location: f.base, object: f.id, data: { claimants: f.succession.claimants } });
    }
  }
}

function supporters(w: World, f: Faction, c: NPC): NPC[] {
  const s = f.succession!;
  return w.members(f.id).filter(m => !s.claimants.includes(m.id) && vote(w, m, s.claimants) === c.id);
}
function vote(w: World, m: NPC, claimants: string[]): string | null {
  let best: string | null = null; let bs = 0.1;
  for (const c of claimants) {
    const rr = rel(m, c, w);
    const s = rr.respect + rr.affection + rr.trust + 0.5 * rr.debt + (hasBond(m, c, 'master') ? 0.8 : 0) - 0.3 * rr.fear;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}
function claim(w: World, f: Faction, c: NPC): number {
  const s = f.succession ? supporters(w, f, c).length : 0;
  return c.realm * 0.3 + s + c.traits.ambition;
}

function succession(w: World, f: Faction, r: Rng): void {
  const s = f.succession!;
  s.claimants = s.claimants.filter(id => w.npc(id)?.alive && w.npcs[id].faction === f.id);
  const alive = s.claimants.map(id => w.npcs[id]);
  if (alive.length === 0) { f.succession = undefined; return; }
  if (alive.length === 1) { f.succession = undefined; crown(w, f, alive[0], true); return; }

  for (const c of alive) {
    if (!c.alive || c.faction !== f.id) continue;
    // Fitna: undecided shogirdga sovg'a
    const undecided = w.members(f.id).filter(m => !s.claimants.includes(m.id) && vote(w, m, s.claimants) !== c.id);
    if (undecided.length && c.silver > 10 && r.chance(0.5 + 0.4 * c.traits.ambition)) {
      const t = r.pick(undecided);
      const amount = Math.min(c.silver, 10 + Math.floor(20 * c.traits.greed));
      c.silver -= amount; t.silver += amount;
      addMemory(w, t, { type: 'gift', subject: c.id, object: t.id, day: w.day, location: f.base, source: 'witnessed', confidence: 1 });
      w.emit({ type: 'scheme_gift', location: f.base, subject: c.id, object: t.id, data: { amount }, secret: true });
    }
    // Maxfiy suiqasd urinishi
    const rival = alive.find(x => x.id !== c.id && x.alive)!;
    const p = 0.1 * c.traits.ambition * (1 - c.traits.honor) * 2;
    if (rival && r.chance(p)) assassinate(w, c, rival, 'succession');
  }
  if (w.day < s.end) return;
  // Suiqasdlar tufayli da'vogarlar o'lgan bo'lishi mumkin
  s.claimants = s.claimants.filter(id => w.npcs[id].alive && w.npcs[id].faction === f.id);
  if (s.claimants.length < 2) {
    f.succession = undefined;
    if (s.claimants.length === 1) crown(w, f, w.npcs[s.claimants[0]], true);
    return;
  }
  const tally = s.claimants.map(id => ({ c: w.npcs[id], n: supporters(w, f, w.npcs[id]).length }));
  tally.sort((a, b) => b.n - a.n);
  const total = sum(tally.map(t => t.n)) || 1;
  f.succession = undefined;
  if (tally[0].n / total >= 0.6) crown(w, f, tally[0].c, true, tally);
  else schism(w, f, tally[0].c, tally[1].c, tally);
}

function crown(w: World, f: Faction, c: NPC, peaceful: boolean, tally?: { c: NPC; n: number }[]): void {
  f.leader = c.id;
  if (f.ideology === 'righteous') c.role = 'sect_leader';
  f.cohesion = Math.min(1, f.cohesion + 0.15);
  witness(w, 'promoted', c.id, null, f.base, { bystanders: true, present: w.members(f.id) });
  w.emit({ type: 'new_leader', location: f.base, subject: c.id, object: f.id, data: { peaceful, votes: tally?.map(t => [t.c.id, t.n]) } });
}

function schism(w: World, f: Faction, winner: NPC, loser: NPC, tally: { c: NPC; n: number }[]): void {
  crown(w, f, winner, false, tally);
  const followers = supporters(w, { ...f, succession: { start: 0, end: 0, claimants: [winner.id, loser.id] } }, loser);
  const home = w.nearest(f.base, w.ofKind('village')) ?? w.nearest(f.base, w.settlements()) ?? f.base;
  const nf: Faction = { id: `split_${w.day}`, name: `${loser.name.split(' ')[1]} vodiysi sektasi`, ideology: 'righteous', base: home,
    leader: loser.id, silver: Math.floor(f.silver * 0.3), tension: { [f.id]: 60 }, cohesion: 0.7, active: true, lastOpDay: w.day,
    foundedDay: w.day, parent: f.id };
  f.silver -= nf.silver; f.tension[nf.id] = 60;
  w.factions[nf.id] = nf;
  for (const m of [loser, ...followers]) {
    m.faction = nf.id; m.home = home; w.dirty();
    if (m.id === loser.id) m.role = 'sect_leader';
    for (const o of w.members(f.id)) if (hasBond(o, m.id)) addMemory(w, o, { type: 'betrayed', subject: m.id, object: o.id, day: w.day, location: f.base, source: 'witnessed', confidence: 1 });
    w.startTravel(m, home, 'schism');
  }
  w.emit({ type: 'schism', location: f.base, subject: loser.id, object: nf.id, data: { from: f.id, followers: followers.map(x => x.id) } });
}

function disband(w: World, f: Faction): void {
  f.active = false; f.disbandedDay = w.day;
  for (const o of Object.values(w.factions)) { delete o.tension[f.id]; delete f.tension[o.id]; }
  const city = w.nearest(f.base, w.ofKind('city')) ?? w.nearest(f.base, w.settlements()) ?? f.base;
  for (const m of w.members(f.id)) { m.faction = null; m.role = 'wanderer'; m.home = city; w.startTravel(m, city, 'disband'); }
  w.dirty();
  w.emit({ type: 'faction_disbanded', location: f.base, object: f.id });
}

// ---------- Maxfiy fitnalar ----------
export function assassinate(w: World, culprit: NPC, victim: NPC, motive: string): void {
  const r = w.rng.get('politics');
  const ok = basePower(culprit) * r.range(0.7, 1.4) > basePower(victim) * r.range(0.6, 1.2) || motive === 'poison';
  w.emit({ type: ok ? 'secret_kill' : 'assassination_failed', location: victim.location, subject: culprit.id, object: victim.id, data: { motive }, secret: true });
  // Uxlayotganlar deyarli hech narsa ko'rmaydi
  const witnesses = w.at(victim.location).filter(x => x.id !== culprit.id && x.id !== victim.id
    && r.chance((x.action === 'sleep' ? 0.03 : 0.25) * (motive === 'poison' ? 0.3 : 1)));
  if (!ok) {
    victim.injury = Math.min(0.9, victim.injury + 0.4);
    addMemory(w, victim, { type: 'attacked', subject: culprit.id, object: victim.id, day: w.day, location: victim.location, source: 'witnessed', confidence: 0.7 });
    return;
  }
  for (const x of witnesses) addMemory(w, x, { type: 'killed', subject: culprit.id, object: victim.id, day: w.day, location: victim.location, source: 'witnessed', confidence: 0.6, origin: `seen_${victim.id}`, secret: true });
  kill(w, victim, culprit.id, motive === 'poison' ? 'sudden_illness' : 'assassination', true);
}

export function plots(w: World): void {
  const r = w.rng.get('politics');
  // Zaharlash: ambitsiyali, sharafsiz elder qari rahbarni
  for (const f of Object.values(w.factions)) {
    const leader = w.npc(f.leader);
    if (!f.active || !leader?.alive || leader.age < 75 || f.succession) continue;
    for (const e of w.members(f.id).filter(n => n.role === 'elder' && n.traits.ambition > 0.8 && n.traits.honor < 0.35))
      if (r.chance(0.004)) assassinate(w, e, leader, 'poison');
  }
  // Pora: qaroqchi boshlig'i -> ochko'z hokim
  const mags = w.alive().filter(n => n.role === 'magistrate' && !n.dismissed && !!n.faction && w.factions[n.faction]?.active);
  for (const bw of Object.values(w.factions)) {
    if (!bw.active || bw.ideology !== 'demonic') continue;
    const chief = w.npc(bw.leader);
    const mag = bw.bribed ? mags.find(m => m.id === bw.bribed) : mags.filter(m => w.hoursTo(bw.base, m.home) <= MARCH_RANGE)[0];
    const office = mag ? w.factions[mag.faction!] : undefined;
    if (chief?.alive && mag && office && !bw.bribed && chief.traits.greed > 0.6 && mag.traits.greed > 0.6 && w.tension(office.id, bw.id) > 45 && bw.silver > 150 && r.chance(0.04)) {
      bw.bribed = mag.id; bw.silver -= 150; mag.silver += 150;
      w.addTension(office.id, bw.id, -40);
      w.emit({ type: 'bribe', location: office.base, subject: mag.id, object: chief.id, data: { amount: 150 }, secret: true });
      for (const x of w.at(mag.location).filter(n => n.id !== mag.id && r.chance(0.4)))
        addMemory(w, x, { type: 'bribed', subject: mag.id, object: chief.id, day: w.day, location: mag.location, source: 'witnessed', confidence: 0.8 });
    }
    // Fosh qilish: halol qo'riqchi pora haqida bilsa
    if (bw.bribed && mag && office && mag.id === bw.bribed) {
      const whistle = w.alive().find(n => n.faction === office.id && n.traits.honor > 0.7 && n.memories.some(m => m.type === 'bribed' && m.subject === mag.id && m.confidence > 0.5));
      if (whistle && r.chance(0.06)) {
        mag.dismissed = true; mag.faction = null; mag.role = 'wanderer'; w.dirty();
        bw.bribed = undefined; office.leader = whistle.id;
        w.addTension(office.id, bw.id, 45);
        w.emit({ type: 'official_exposed', location: office.base, subject: whistle.id, object: mag.id });
      }
    }
  }
  // Sir ochilishi: noma'lum qotilni bir necha kishi biladi (haftada bir — butun aholi xotirasini ko'rib chiqish qimmat)
  if (w.day % 7 !== 4) return;
  const exposed = new Set(w.eventsOf('murder_exposed').map(e => e.object));
  const hidden = new Map<string, string>();   // fosh bo'lmagan qurbon → tirik qotil
  for (const victim of Object.values(w.npcs)) {
    if (victim.alive || victim.causeOfDeath === undefined || !['assassination', 'sudden_illness'].includes(victim.causeOfDeath)) continue;
    if (exposed.has(victim.id)) continue;
    const culprit = w.npc(victim.killer);
    if (culprit?.alive) hidden.set(victim.id, culprit.id);
  }
  if (!hidden.size) return;
  // Kim nimani biladi — butun aholi xotirasi bo'ylab bitta o'tish (har qurbon uchun alohida emas)
  const known = new Map<string, NPC[]>();
  for (const n of w.alive()) {
    const seen = new Set<string>();
    for (const m of n.memories) {
      if (m.type !== 'killed' || m.confidence <= 0.35 || !m.object || seen.has(m.object) || hidden.get(m.object) !== m.subject) continue;
      seen.add(m.object);
      let l = known.get(m.object); if (!l) known.set(m.object, l = []); l.push(n);
    }
  }
  for (const [vid, cid] of hidden) {
    const victim = w.npcs[vid], culprit = w.npcs[cid];
    if (!culprit.alive) continue;
    const knowers = known.get(vid) ?? [];
    if (knowers.length >= 3) {
      w.emit({ type: 'murder_exposed', location: culprit.location, subject: culprit.id, object: victim.id, data: { knowers: knowers.map(k => k.id) } });
      const f = culprit.faction ? w.factions[culprit.faction] : undefined;
      for (const o of w.alive()) if (o.id !== culprit.id && (hasBond(o, victim.id) || o.faction === culprit.faction))
        addMemory(w, o, { type: 'betrayed', subject: culprit.id, object: o.id, day: w.day, location: culprit.location, source: 'heard', confidence: 0.8, origin: `exposed_${victim.id}` });
      if (f && f.leader === culprit.id) { f.leader = null; culprit.faction = null; w.dirty(); culprit.role = 'wanderer'; culprit.home = w.nearest(f.base, w.ofKind('cave')) ?? f.base; w.emit({ type: 'leader_ousted', location: f.base, subject: culprit.id, object: f.id }); }
      else if (f) { culprit.faction = null; w.dirty(); culprit.role = 'wanderer'; culprit.home = w.nearest(f.base, w.ofKind('city')) ?? f.base; w.emit({ type: 'expelled', location: f.base, subject: culprit.id, object: f.id }); }
    }
  }
}

// ---------- Sekta tekshiruvi, yollash, sarson-sargardonlar ----------
export function monthly(w: World): void {
  for (const f of Object.values(w.factions)) {
    if (!f.active || f.ideology !== 'righteous') continue;
    for (const m of w.members(f.id)) {
      if (m.role === 'outer_disciple' && m.realm >= 3) { m.role = 'inner_disciple'; witness(w, 'promoted', m.id, null, f.base, { bystanders: true, present: w.members(f.id) }); w.emit({ type: 'promoted', location: f.base, subject: m.id, object: f.id, data: { to: 'inner_disciple' } }); }
    }
    const elders = w.members(f.id).filter(m => m.role === 'elder');
    if (elders.length < 3) {
      const cand = w.members(f.id).filter(m => m.role === 'inner_disciple' && m.realm >= 4).sort((a, b) => b.realm - a.realm || b.progress - a.progress)[0];
      if (cand) { cand.role = 'elder'; w.emit({ type: 'promoted', location: f.base, subject: cand.id, object: f.id, data: { to: 'elder' } }); }
    }
  }
}

const SUR = ['Qin', 'Bai', 'Ouyang', 'Shangguan', 'Murong', 'Duan', 'Hua', 'Ling', 'Mu', 'Nie', 'Qiao', 'Rong'];
const GIV = ['Chen', 'Xiao', 'Yi', 'Jian', 'Hen', 'Lie', 'Shuang', 'Wu', 'Zhi', 'Ce', 'An', 'Ye'];
export function daily(w: World): void {
  const r = w.rng.get('world');
  // Taranglik asta-sekin so'nadi; qo'shin saqlash xarajati va daromad
  for (const f of Object.values(w.factions)) {
    if (!f.active) continue;
    for (const k of Object.keys(f.tension)) f.tension[k] = Math.max(0, f.tension[k] - 0.15);
    if (f.ideology === 'demonic') continue;
    const income = 2 + 0.45 * w.members(f.id).length; // soliq/xayriya
    f.silver = Math.max(0, f.silver + income - 0.5 * w.members(f.id).length - 0.003 * f.silver); // saqlash + isrof
  }
  // Qarilik
  for (const n of w.alive()) {
    if (w.day % 360 === 359) n.age++;
    const eff = n.age - 3 * n.realm; // cultivation umrni uzaytiradi
    if (n.role !== 'hermit' && eff > 60 && r.chance(0.0004 * Math.pow(eff - 60, 1.4))) kill(w, n, null, 'old_age');
    n.injury = Math.max(0, n.injury - 0.03);
  }
  // Sarson-sargardon kelishi
  if (r.chance(0.09 * Math.max(0, Math.min(1, (w.popCap - w.alive().length) / (w.popCap * 2 / 7))))) { // aholi chegaraga yetganda sargardonlar kelmaydi
    const nm = `${r.pick(SUR)} ${r.pick(GIV)}`;
    const id = `${nm.toLowerCase().replace(' ', '_')}_${w.day}`;
    const t = { ambition: r.range(0.2, 0.9), loyalty: r.range(0.2, 0.8), greed: r.range(0.1, 0.9), courage: r.range(0.3, 0.9), honor: r.range(0.1, 0.9), curiosity: r.range(0.3, 0.9), temper: r.range(0.1, 0.8), discipline: r.range(0.3, 0.9) };
    const home = r.pick(w.settlements());
    const n = { id, name: nm, age: r.int(18, 40), role: 'wanderer' as const, faction: null, home, realm: r.int(0, 3), progress: 0, talent: r.range(0.8, 1.3), silver: r.int(5, 60), traits: t, bonds: [] };
    w.addNpc({ ...n, location: home, injury: 0, alive: true, goals: [], memories: [], relations: {}, action: 'idle', needs: { hunger: 30, rest: 30, safety: 0, social: 50, purpose: 50 } });
    w.emit({ type: 'wanderer_arrived', location: home, subject: id });
  }
  // Qaroqchilar bo'shlig'ini yangi to'da to'ldiradi
  for (const camp of w.ofKind('camp')) {
    const here = Object.values(w.factions).filter(f => f.ideology === 'demonic' && f.base === camp);
    if (here.some(f => f.active)) continue;
    const last = Math.max(-1, ...here.map(f => f.disbandedDay ?? -1));
    if (last >= 0 && w.day - last > 20 && r.chance(0.08)) foundGang(w, r, camp);
  }
  // Yollash
  for (const n of w.alive().filter(x => x.role === 'wanderer' && !x.dismissed)) {
    const sect = nearFaction(w, n.home, f => f.ideology === 'righteous' && !f.parent) ?? nearFaction(w, n.home, f => f.ideology === 'righteous');
    const imp = nearFaction(w, n.home, f => f.ideology === 'neutral');
    const bw = nearFaction(w, n.home, f => f.ideology === 'demonic');
    if (n.traits.honor > 0.55 && sect && n.realm <= 3 && r.chance(0.04)) join(w, n, sect, 'outer_disciple');
    else if (n.traits.honor > 0.5 && n.realm <= 2 && imp && w.members(imp.id).length < 8 && r.chance(0.03)) join(w, n, imp, 'guard');
    else if (n.traits.greed > 0.6 && n.traits.honor < 0.45 && bw && r.chance(0.04)) join(w, n, bw, 'bandit');
  }
  // Kambag'al dehqon qaroqchilarga qo'shiladi
  for (const n of w.alive().filter(x => x.role === 'farmer' && x.silver < 10 && x.traits.greed > 0.55 && x.traits.honor < 0.7)) {
    const bw = nearFaction(w, n.home, f => f.ideology === 'demonic' && w.members(f.id).length < 14, 24);
    if (!bw || !r.chance(0.04 * ((settlementOf(w, n.home)?.food ?? 50) < 10 ? 2.5 : 1))) continue;   // ochlik qaroqchilikka itaradi
    const home = n.home;
    join(w, n, bw, 'bandit');
    for (const o of w.alive()) if (hasBond(o, n.id, 'family')) addMemory(w, o, { type: 'betrayed', subject: n.id, object: o.id, day: w.day, location: home, source: 'heard', confidence: 0.9 });
    w.emit({ type: 'defected', location: home, subject: n.id, object: bw.id });
    break;
  }
  // Ustoz izlash maqsadi
  for (const n of w.alive()) {
    if (!w.isMartial(n) || n.player || n.taughtByHermit || n.goals.some(g => g.type === 'seek_master') || n.role === 'hermit' || n.role === 'sect_leader') continue;
    if (n.traits.curiosity > 0.7 && n.traits.ambition > 0.6 && n.realm >= 1 && r.chance(0.003)) {
      n.goals.push({ type: 'seek_master', since: w.day });
      w.emit({ type: 'seeks_master', location: n.location, subject: n.id });
    }
  }
  // Qasos uchun sektadan adolat so'rash
  for (const n of w.alive()) {
    for (const g of n.goals) {
      if (g.type !== 'avenge' || !n.faction) continue;
      const tgt = w.npc(g.target);
      if (!tgt?.alive || !tgt.faction || tgt.faction === n.faction) continue;
      if (g.lastPetition !== undefined && w.day - g.lastPetition < 10) continue;
      g.lastPetition = w.day;
      w.addTension(n.faction, tgt.faction, 8 + 3 * (rankOf[n.role] ?? 1));
      w.emit({ type: 'petition', location: n.location, subject: n.id, object: tgt.id, data: { faction: n.faction, enemy: tgt.faction } });
    }
    n.goals = n.goals.filter(g => g.type !== 'avenge' || (w.npc(g.target)?.alive && w.day - g.since < 120)); // qasos 120 kunda so'nadi
  }
}

// ---------- Sektalararo diplomatiya: raqobat, urush, sulh, ittifoq, musobaqa ----------
const DIPLO_RANGE = 48;
const has = (f: Faction, k: 'wars' | 'allies', id: string) => !!f[k]?.includes(id);
const link = (a: Faction, b: Faction, k: 'wars' | 'allies') => { (a[k] ??= []).push(b.id); (b[k] ??= []).push(a.id); };
const unlink = (a: Faction, b: Faction, k: 'wars' | 'allies') => { a[k] = (a[k] ?? []).filter(x => x !== b.id); b[k] = (b[k] ?? []).filter(x => x !== a.id); };
export function diplomacy(w: World): void {
  const r = w.rng.get('diplomacy');
  // tarqalgan fraksiyalar bilan aloqalar tozalanadi
  for (const f of Object.values(w.factions)) for (const k of ['wars', 'allies'] as const) if (f[k]?.length) f[k] = f.active ? f[k]!.filter(id => w.factions[id]?.active) : [];
  const sects = Object.values(w.factions).filter(f => f.active && f.ideology === 'righteous');
  const pairs: [Faction, Faction][] = [];
  for (let i = 0; i < sects.length; i++) for (let j = i + 1; j < sects.length; j++) if (w.hoursTo(sects[i].base, sects[j].base) <= DIPLO_RANGE) pairs.push([sects[i], sects[j]]);
  for (const [a, b] of pairs) {
    const la = w.npc(a.leader), lb = w.npc(b.leader);
    const pride = ((la?.traits.ambition ?? 0.5) + (lb?.traits.ambition ?? 0.5)) / 2 - ((la?.traits.honor ?? 0.5) + (lb?.traits.honor ?? 0.5)) / 2;
    if (!has(a, 'allies', b.id)) w.addTension(a.id, b.id, 0.15 + 0.6 * Math.max(0, pride));   // shon-shuhrat talashi
    // Chegara to'qnashuvi: keskin munosabatda shogirdlar to'qnashadi (shaxsiy adovat + taranglik)
    if (!has(a, 'allies', b.id) && w.tension(a.id, b.id) >= 55 && r.chance(0.04)) {
      const pick = (f: Faction) => { const m = w.members(f.id).filter(x => x.role.endsWith('disciple') && !x.player); return m.length ? m[Math.floor(r.next() * m.length)] : undefined; };
      const da = pick(a), db = pick(b);
      if (da && db) {
        da.injury = Math.min(0.6, da.injury + 0.15); db.injury = Math.min(0.6, db.injury + 0.15);
        addMemory(w, da, { type: 'attacked', subject: db.id, object: da.id, day: w.day, location: da.location, source: 'witnessed', confidence: 1 });
        addMemory(w, db, { type: 'attacked', subject: da.id, object: db.id, day: w.day, location: db.location, source: 'witnessed', confidence: 1 });
        w.addTension(a.id, b.id, 8);
        w.emit({ type: 'border_clash', location: a.base, subject: da.id, object: db.id, data: { a: a.id, b: b.id } });
      }
    }
    const t = w.tension(a.id, b.id);
    if (!has(a, 'wars', b.id) && t >= 85 && r.chance(0.3)) {
      if (has(a, 'allies', b.id)) unlink(a, b, 'allies');
      link(a, b, 'wars');
      w.emit({ type: 'war_declared', location: a.base, subject: a.id, object: b.id, data: { tension: Math.round(t) } });
    } else if (has(a, 'wars', b.id) && t < 45) {
      unlink(a, b, 'wars');
      w.emit({ type: 'peace_made', location: a.base, subject: a.id, object: b.id });
    } else if (has(a, 'allies', b.id) && t > 45) {
      unlink(a, b, 'allies');
      w.emit({ type: 'alliance_broken', location: a.base, subject: a.id, object: b.id });
    } else if (!has(a, 'allies', b.id) && !has(a, 'wars', b.id) && t < 35) {
      const common = Object.values(w.factions).find(x => x.active && x.ideology === 'demonic' && ((w.tension(a.id, x.id) >= 35 && w.tension(b.id, x.id) >= 35) || (w.hoursTo(a.base, x.base) <= DIPLO_RANGE && w.hoursTo(b.base, x.base) <= DIPLO_RANGE)));   // umumiy dushman yoki yaqin tahdid
      if (common && r.chance(0.06)) {
        link(a, b, 'allies'); w.addTension(a.id, b.id, -10);
        w.emit({ type: 'alliance_formed', location: a.base, subject: a.id, object: b.id, data: { against: common.id } });
      }
    }
  }
  // Har oy: 8-kuni musobaqa e'lon qilinadi, 15-kuni o'tkaziladi (oraliqda o'yinchi sekta chempioni bo'lishi mumkin)
  if (w.day % 30 === 8 && pairs.length) {
    const peaceful = pairs.filter(([a, b]) => !has(a, 'wars', b.id) && !a.tourney && !b.tourney);
    if (peaceful.length) {
      const [a, b] = peaceful[Math.floor(r.next() * peaceful.length)];
      const day = w.day + 7;
      a.tourney = { vs: b.id, day, host: true }; b.tourney = { vs: a.id, day, host: false };
      w.emit({ type: 'tournament_announced', location: a.base, subject: a.id, object: b.id, data: { day } });
    }
  }
  for (const a of sects) {
    const t = a.tourney; if (!t || !t.host || w.day < t.day) continue;
    const b = w.factions[t.vs], bt = b?.tourney;
    delete a.tourney; if (b) delete b.tourney;
    if (!b?.active || has(a, 'wars', b.id)) continue;
    const champ = (f: Faction) => w.members(f.id).filter(m => m.id !== f.leader && m.injury < 0.4 && !m.player).sort((x, y) => basePower(y) - basePower(x))[0];
    const player = w.npcs['player'];
    const pr = t.player ? { side: a, other: b, res: t.player } : bt?.player ? { side: b, other: a, res: bt.player } : null;
    let wf: Faction, lf: Faction, wc: NPC | undefined, lc: NPC | undefined;
    if (pr && player?.alive) {
      const oc = champ(pr.other);
      if (pr.res === 'win') { wf = pr.side; lf = pr.other; wc = player; lc = oc; } else { wf = pr.other; lf = pr.side; wc = oc; lc = player; }
    } else {
      const ca = champ(a), cb = champ(b);
      if (!ca || !cb) continue;
      const pa = basePower(ca) * r.range(0.7, 1.3), pb = basePower(cb) * r.range(0.7, 1.3);
      [wf, lf, wc, lc] = pa >= pb ? [a, b, ca, cb] : [b, a, cb, ca];
    }
    if (!wc || !lc) continue;
    wf.silver += 80; if (!lc.player) lc.injury = Math.min(0.6, lc.injury + 0.25);
    w.addTension(wf.id, lf.id, 6);
    witness(w, 'breakthrough', wc.id, null, wf.base, { bystanders: true, present: [...w.members(wf.id), ...w.members(lf.id)] });
    w.emit({ type: 'tournament', location: wf.base, subject: wc.id, object: lc.id, data: { winner: wf.id, loser: lf.id } });
  }
}

const GANGS = ["Qizil Tulki to'dasi", "Temir Bo'ri to'dasi", "Qora Ilon birodarligi", "Sariq Bulut to'dasi"];
function foundGang(w: World, r: Rng, camp: string): void {
  const name = GANGS[Object.keys(w.factions).filter(k => k.startsWith('gang_')).length % GANGS.length];
  const id = w.factions[`gang_${w.day}`] ? `gang_${w.day}_${camp}` : `gang_${w.day}`;
  const f: Faction = { id, name, ideology: 'demonic', base: camp, leader: null, silver: 120,
    tension: Object.fromEntries(Object.values(w.factions).filter(o => o.active).map(o => [o.id, 30])), cohesion: 0.6, active: true, lastOpDay: w.day, foundedDay: w.day };
  for (const o of Object.values(w.factions)) if (o.active && o.id !== id) o.tension[id] = 30;
  w.factions[id] = f;
  // Asoschi: mahalliy sharafsiz sargardon yoki shimoldan kelgan sarkarda
  let boss = w.alive().find(n => n.role === 'wanderer' && !n.dismissed && n.traits.honor < 0.45 && n.traits.ambition > 0.55 && n.realm >= 2 && w.hoursTo(camp, n.home) <= JOIN_RANGE);
  const newcomer = (realm: number, bias: Partial<NPC['traits']>) => {
    const nm = `${r.pick(SUR)} ${r.pick(GIV)}`;
    const nid = `${nm.toLowerCase().replace(' ', '_')}_${w.day}_${w.idc}`;
    w.idc++;
    const t = { ambition: r.range(0.4, 0.9), loyalty: r.range(0.3, 0.8), greed: r.range(0.6, 0.95), courage: r.range(0.5, 0.9), honor: r.range(0.05, 0.35), curiosity: r.range(0.2, 0.6), temper: r.range(0.4, 0.9), discipline: r.range(0.3, 0.7), ...bias };
    const n: NPC = { id: nid, name: nm, age: r.int(22, 45), role: 'bandit', faction: id, home: f.base, realm, progress: 0, talent: r.range(0.9, 1.2), silver: r.int(5, 30),
      traits: t, bonds: [], location: f.base, injury: 0, alive: true, goals: [], memories: [], relations: {}, action: 'idle', needs: { hunger: 30, rest: 30, safety: 0, social: 40, purpose: 40 } };
    w.addNpc(n);
    return n;
  };
  if (boss) { boss.faction = id; w.dirty(); boss.home = f.base; w.startTravel(boss, f.base, 'found'); }
  else boss = newcomer(r.int(3, 4), { ambition: 0.85, greed: 0.8 });
  boss.role = 'bandit_chief'; f.leader = boss.id;
  for (let i = 0; i < 4; i++) { const m = newcomer(r.int(1, 2), {}); m.bonds.push({ other: boss.id, type: 'sworn' }); boss.bonds.push({ other: m.id, type: 'sworn' }); }
  w.emit({ type: 'gang_founded', location: f.base, subject: boss.id, object: id });
}

/** Uydan JOIN_RANGE soat ichidagi eng yaqin faol fraksiya (shart bo'yicha). */
export function nearFaction(w: World, home: string, pred: (f: Faction) => boolean, range = JOIN_RANGE): Faction | null {
  let best: Faction | null = null, bd = Infinity;
  for (const f of Object.values(w.factions)) { if (!f.active || !pred(f)) continue; const h = w.hoursTo(home, f.base); if (h <= range && h < bd) { bd = h; best = f; } }
  return best;
}

export function join(w: World, n: NPC, f: Faction, role: NPC['role']): void {
  n.faction = f.id; n.role = role; n.home = f.base; w.dirty();
  w.startTravel(n, f.base, 'join');
  w.emit({ type: 'joined', location: n.location, subject: n.id, object: f.id, data: { role } });
}
