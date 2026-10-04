import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { World } from '../sim/world.js';
import { runDays } from '../sim/sim.js';
import { chronicle } from '../sim/chronicle.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const seed = Number(args.seed ?? 42), days = Number(args.days ?? 365);
const w = args.load ? new World(seed, JSON.parse(readFileSync(args.load, 'utf8'))) : new World(seed);
const t0 = performance.now();
runDays(w, days);
const ms = performance.now() - t0;
mkdirSync('out', { recursive: true });
writeFileSync(`out/chronicle_seed${seed}.md`, chronicle(w));
writeFileSync(`out/events_seed${seed}.jsonl`, w.events.map(e => JSON.stringify(e)).join('\n'));
if (args.save) writeFileSync(args.save, JSON.stringify(w.snapshot()));
const surf = w.seeds.filter(s => s.surfaced);
console.log(`seed=${seed} days=${days} time=${(ms / 1000).toFixed(1)}s events=${w.events.length} alive=${w.alive().length} deaths=${Object.values(w.npcs).filter(n => !n.alive).length}`);
console.log(`stories surfaced=${surf.length} types=${new Set(surf.map(s => s.type)).size} resolved=${surf.filter(s => s.status === 'resolved').length}`);
console.log(`-> out/chronicle_seed${seed}.md`);
