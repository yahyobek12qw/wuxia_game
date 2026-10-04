// L2 jang: ko'rinmas, formula asosida. Natija xotira va event log'ga yoziladi.
import { onKill } from './law.js';
import { inherit } from './family.js';
import type { NPC } from '../core/types.js';
import { bondStrength, witness, addMemory } from './memory.js';
import type { World } from './world.js';

export function basePower(n: NPC): number {
  return Math.pow(1 + n.realm, 1.6) * (1 - 0.6 * Math.min(1, n.injury)) * (n.tp ?? 1);   // tp — uslublar (cultivation.ts)
}
function rollPower(w: World, n: NPC): number {
  const r = w.rng.get('combat');
  return basePower(n) * (0.8 + 0.4 * r.next()) * (0.9 + 0.2 * n.traits.courage);
}

export interface BattleResult { winner: 'A' | 'B' | 'none'; killed: string[]; fled: string[]; activeA: string[]; activeB: string[]; }

export function battle(w: World, loc: string, sideA: NPC[], sideB: NPC[], cause: string): BattleResult {
  const r = w.rng.get('combat');
  const killed: string[] = []; const fled = new Set<string>(); const down = new Set<string>();
  const lastVictim = new Map<string, string>();
  const kills = new Map<string, number>(); // bitta jangchi bir jangda ko'pi bilan 2 kishini tugatadi
  const active = (s: NPC[]) => s.filter(n => n.alive && !fled.has(n.id) && !down.has(n.id));
  const present = w.at(loc);

  for (let round = 0; round < 4; round++) {
    const A = active(sideA), B = active(sideB);
    if (!A.length || !B.length) break;
    const order = r.shuffle([...A.map(n => [n, 'A'] as const), ...B.map(n => [n, 'B'] as const)]);
    for (const [f, side] of order) {
      if (!f.alive || fled.has(f.id) || down.has(f.id)) continue;
      const foes = active(side === 'A' ? sideB : sideA);
      if (!foes.length) break;
      const foe = r.pick(foes);
      duel(f, foe);
    }
  }

  function duel(a: NPC, b: NPC): void {
    const pa = rollPower(w, a), pb = rollPower(w, b);
    const [win, lose] = pa >= pb ? [a, b] : [b, a];
    const ratio = Math.min(pa, pb) / Math.max(pa, pb);
    lose.injury = Math.min(0.95, lose.injury + 0.2 + 0.5 * (1 - ratio));
    const isDown = lose.injury >= 0.7;
    // O'lim faqat g'olibning qarori: shafqatsiz o'ldiradi, sharafli ayaydi
    const finish = isDown && (kills.get(win.id) ?? 0) < 2 && r.chance(0.05 + 0.55 * win.traits.temper * (1 - win.traits.honor));
    if (isDown && !finish) down.add(lose.id);
    lastVictim.set(win.id, lose.id);
    if (finish) {
      kill(w, lose, win.id, cause);
      kills.set(win.id, (kills.get(win.id) ?? 0) + 1);
      killed.push(lose.id);
    } else {
      witness(w, 'attacked', win.id, lose.id, loc, { present });
      w.emit({ type: 'combat', location: loc, subject: win.id, object: lose.id, data: { outcome: isDown ? 'down' : 'wounded', cause } });
      if (!isDown && lose.injury > 0.5 && r.next() > lose.traits.courage) {
        fled.add(lose.id);
        w.emit({ type: 'fled', location: loc, subject: lose.id, data: { cause } });
        lose.needs.safety = 100;
        lose.opId = undefined;
        w.startTravel(lose, lose.home, 'flee');
      }
    }
    // Kimnidir himoya qilib, uning hujumchisini yenggan bo'lsa: "hayotimni saqlab qoldi"
    const victimOfLoser = lastVictim.get(lose.id);
    const v = w.npc(victimOfLoser);
    if (v && v.alive && v.id !== win.id && v.injury > 0.3 && !(win.faction && win.faction === lose.faction)) {
      addMemory(w, v, { type: 'saved_life', subject: win.id, object: v.id, day: w.day, location: loc, source: 'witnessed', confidence: 1 });
      w.emit({ type: 'saved', location: loc, subject: win.id, object: v.id });
      lastVictim.delete(lose.id);
    }
  }

  const A = active(sideA).map(n => n.id), B = active(sideB).map(n => n.id);
  return { winner: A.length && !B.length ? 'A' : B.length && !A.length ? 'B' : 'none', killed, fled: [...fled], activeA: A, activeB: B };
}

export function kill(w: World, n: NPC, killerId: string | null, cause: string, secret = false): void {
  if (!n.alive) return;
  const loc = n.location;
  const present = w.at(loc);
  n.alive = false; w.aliveVer++; n.deathDay = w.day; n.causeOfDeath = cause; n.killer = killerId ?? undefined;
  n.travel = undefined; n.opId = undefined;
  w.emit({ type: 'death', location: loc, subject: n.id, object: killerId ?? undefined, data: { cause }, secret });

  const k = w.npc(killerId);
  if (k && !secret) {
    witness(w, 'killed', k.id, n.id, loc, { bystanders: true, present });
    if (k.faction && n.faction && k.faction !== n.faction) w.addTension(k.faction, n.faction, 15);
  }
  // Yaqinlariga xabar 12–72 soatda yetib boradi
  const r = w.rng.get('news');
  for (const o of w.alive()) {
    if (bondStrength(o, n.id) <= 0 || present.includes(o)) continue;
    const subject = secret || !k ? (killerId ? 'unknown' : n.id) : k.id;
    if (!killerId) continue; // tabiiy o'lim: qasos yo'q
    w.news.push({ at: w.h + r.int(12, 72), to: o.id, memory: {
      id: '', origin: `death_${n.id}`, type: 'killed', subject, object: n.id, day: w.day, location: loc,
      importance: 1, permanence: 1, source: 'heard', confidence: 0.9, truth: secret ? killerId : undefined } });
  }
  onKill(w, n, killerId, cause, secret);   // mukofot, qotillik jinoyati, qahramonlik
  inherit(w, n);   // meros, do'kon, motam
  // Rahbar vafot etsa
  const f = n.faction ? w.factions[n.faction] : undefined;
  if (f && f.leader === n.id) {
    f.leader = null;
    w.emit({ type: 'leader_died', location: loc, subject: n.id, object: f.id });
  }
}
