// Determinizm va save/load testi:
// (A) bir xil seed ikki marta -> bir xil natija
// (B) 120 kun -> save -> load -> 120 kun  ==  to'g'ridan-to'g'ri 240 kun
import { createHash } from 'node:crypto';
import { World } from '../sim/world.js';
import { runDays } from '../sim/sim.js';

// Kalitlar tartibiga bog'liq bo'lmagan JSON (undefined qiymatli kalitlar saqlashda tushib qoladi va keyin boshqa tartibda qayta yaratiladi)
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => [k, canon((v as Record<string, unknown>)[k])])) : v;
const hash = (w: World) => createHash('sha256').update(JSON.stringify(canon(w.snapshot()))).digest('hex').slice(0, 16);
let failed = 0;
const check = (name: string, a: string, b: string) => { const ok = a === b; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${a} ${ok ? '==' : '!='} ${b}`); };

const a = new World(99); runDays(a, 120);
const b = new World(99); runDays(b, 120);
check('bir xil seed, 120 kun', hash(a), hash(b));

const direct = new World(99); runDays(direct, 240);
const half = new World(99); runDays(half, 120);
const restored = new World(99, JSON.parse(JSON.stringify(half.snapshot())));
runDays(restored, 120);
check('save/load o\'rtada, 240 kun', hash(direct), hash(restored));

const c = new World(100); runDays(c, 120);
console.log(hash(a) !== hash(c) ? 'PASS  boshqa seed boshqa dunyo beradi' : 'FAIL  seed ta\'sir qilmayapti');
if (hash(a) === hash(c)) failed++;
process.exit(failed ? 1 : 0);
