// Katta dunyo soak testi: tirik sim butun xaritada (yadro + tashqi shahar/qishloq/uyalar) bir yil yashaydi.
// Gate: invariantlar toza, aholi barqaror, tashqi dunyoda ham voqealar va hikoyalar bor, kun tezligi o'yin uchun yetarli.
import { writeFileSync, mkdirSync } from 'node:fs';
import { World } from '../sim/world.js';
import { stepHour } from '../sim/sim.js';
import { buildGrid } from '../game/terrain.js';
import { extendGeo, populate } from '../game/worldgen.js';
import { invariants } from './invariants.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const seeds = Number(args.seeds ?? 3), days = Number(args.days ?? 365);
const rows: string[] = [], causes: Record<string, number> = {}, types: Record<string, number> = {}, diplo: Record<string, number> = {};
let pass = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const w = new World(seed), g = buildGrid(w, seed); extendGeo(w, g); populate(w, g, seed);
  const pop0 = w.alive().length, outer = new Set(Object.keys(w.locations).filter(k => k.startsWith('poi_') || k.startsWith('road_')));
  const f0 = Object.values(w.factions).filter(f => f.active).length;
  const t0 = performance.now();
  for (let h = 0; h < days * 24; h++) stepHour(w);
  const msDay = (performance.now() - t0) / days;
  const pop = w.alive().length, dead = Object.values(w.npcs).filter(n => !n.alive);
  for (const n of dead) causes[n.causeOfDeath!] = (causes[n.causeOfDeath!] ?? 0) + 1;
  const surf = w.seeds.filter(s => s.surfaced); for (const s of surf) types[s.type] = (types[s.type] ?? 0) + 1;
  const outerEv = w.events.filter(e => outer.has(e.location) && ['raid', 'raid_repelled', 'ambush', 'ambush_repelled', 'death', 'new_leader', 'expedition_victory', 'expedition_failed'].includes(e.type)).length;
  for (const e of w.events) if (['war_declared', 'peace_made', 'alliance_formed', 'alliance_broken', 'ally_joins', 'tournament'].includes(e.type)) diplo[e.type] = (diplo[e.type] ?? 0) + 1;
  const cnt = (t: string) => w.events.filter(e => e.type === t).length, born = cnt('born'), came = cnt('wanderer_arrived');
  const fNow = Object.values(w.factions).filter(f => f.active).length, bad = invariants(w);
  const ok = bad.length === 0 && pop > pop0 * 0.7 && pop < pop0 * 1.3 && surf.length >= 20 && outerEv >= 20 && msDay < 0.1 * (pop0 + pop) / 2;   // tezlik: 1000 NPC uchun < 100 ms/kun
  if (ok) pass++;
  rows.push(`| ${seed} | ${pop0} → ${pop} | ${dead.length} | ${born} + ${came} | ${cnt('married')} | ${cnt('came_of_age')} | ${cnt('famine')} | ${f0} → ${fNow} | ${surf.length} | ${new Set(surf.map(s => s.type)).size} | ${outerEv} | ${msDay.toFixed(0)} | ${bad.length} | ${ok ? 'PASS' : 'FAIL'} |`);
  process.stdout.write('.');
}
const report = [`# Katta dunyo soak: ${seeds} seed × ${days} kun`, '', `Gate (invariantlar, aholi ±30%, ≥20 hikoya, tashqi dunyoda ≥20 voqea, < 100 ms/kun har 1000 NPC): **${pass}/${seeds} PASS**`, '',
  '| Seed | Aholi | O\'limlar | Tug\'ildi + keldi | Nikoh | Voyaga yetdi | Ocharchilik | Faol fraksiyalar | Hikoyalar | Turlar | Tashqi voqealar | ms/kun | Invariant | Gate |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, '',
  '## Hikoya turlari', '', ...Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
  '## Diplomatiya (jami)', '', ...Object.entries(diplo).map(([k, v]) => `- ${k}: ${v}`), '',
  "## O'lim sabablari", '', ...Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`)].join('\n');
mkdirSync('out', { recursive: true }); writeFileSync('out/big_soak_report.md', report);
console.log('\n' + report);
process.exit(pass === seeds ? 0 : 1);
