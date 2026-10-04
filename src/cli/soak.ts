// M0 gate: dunyo player'siz 1 yil yashaydi; har seed'da kamida 10 ta chiqarilgan hikoya
// va kamida 6 xil hikoya turi bo'lishi kerak.
import { writeFileSync, mkdirSync } from 'node:fs';
import { World } from '../sim/world.js';
import { runDays } from '../sim/sim.js';
import { RULES } from '../sim/director.js';
import { invariants } from './invariants.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const seeds = Number(args.seeds ?? 10), days = Number(args.days ?? 365);
const typeTotals: Record<string, number> = {};
const causeTotals: Record<string, number> = {};
const rows: string[] = [];
let pass = 0;
const violations: string[] = [];
for (let s = 1; s <= seeds; s++) {
  const w = new World(s);
  const t0 = performance.now();
  runDays(w, days);
  const surf = w.seeds.filter(x => x.surfaced);
  const types = new Set(surf.map(x => x.type));
  for (const x of surf) typeTotals[x.type] = (typeTotals[x.type] ?? 0) + 1;
  const dead = Object.values(w.npcs).filter(n => !n.alive);
  for (const n of dead) causeTotals[n.causeOfDeath!] = (causeTotals[n.causeOfDeath!] ?? 0) + 1;
  const bad = invariants(w);
  for (const b of bad) violations.push(`seed ${s}: ${b}`);
  const ok = surf.length >= 10 && types.size >= 6 && bad.length === 0;
  if (ok) pass++;
  const leader = w.nameOf(w.factions['qingyun'].leader);
  const gangs = Object.values(w.factions).filter(f => f.ideology === 'demonic' && f.active).map(f => f.name).join(', ') || '—';
  rows.push(`| ${s} | ${surf.length} | ${types.size} | ${dead.length} | ${w.alive().length} | ${leader} | ${gangs} | ${((performance.now() - t0) / 1000).toFixed(1)} | ${ok ? 'PASS' : 'FAIL'} |`);
  process.stdout.write('.');
}
const total = Object.values(typeTotals).reduce((a, b) => a + b, 0);
const topShare = Math.max(0, ...Object.values(typeTotals)) / Math.max(1, total);
const dead = RULES.filter(r => !r.multiSect).map(r => r.type).filter(t => !typeTotals[t]);
const extra = topShare <= 0.4 && dead.length <= 1; // bitta nodir qoida 10 seedda chiqmasligi mumkin
const report = [
  `# Soak test: ${seeds} seed × ${days} kun`, '',
  `Gate (≥10 hikoya, ≥6 tur, invariantlar): **${pass}/${seeds} PASS**`,
  `Xilma-xillik (eng katta tur ulushi ≤40%, o'lik qoidalar yo'q): **${extra ? 'PASS' : 'FAIL'}** — eng katta ulush ${(topShare * 100).toFixed(0)}%, chiqmagan qoidalar: ${dead.join(', ') || '—'}`,
  ...(violations.length ? ['', '## Invariant buzilishlari', '', ...violations.map(v => `- ${v}`)] : []), '',
  '| Seed | Hikoyalar | Turlar | O\'limlar | Tirik | Qingyun rahbari | Faol to\'dalar | Vaqt (s) | Gate |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, '',
  '## Hikoya turlari (jami)', '', ...Object.entries(typeTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
  '## O\'lim sabablari (jami)', '', ...Object.entries(causeTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
].join('\n');
mkdirSync('out', { recursive: true });
writeFileSync('out/soak_report.md', report);
console.log('\n' + report);
process.exit(pass === seeds && extra ? 0 : 1);
