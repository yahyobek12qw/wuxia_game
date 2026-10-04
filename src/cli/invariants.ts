// Dunyo holati invariantlari: buzilsa, sim'da mantiqiy xato bor.
import type { World } from '../sim/world.js';

export function invariants(w: World): string[] {
  const bad: string[] = [];
  for (const f of Object.values(w.factions)) {
    if (f.active && f.leader && !w.npcs[f.leader]?.alive) bad.push(`${f.id}: rahbar o'lik (${f.leader})`);
    if (f.succession) for (const c of f.succession.claimants) if (!w.npcs[c]?.alive) bad.push(`${f.id}: o'lik da'vogar ${c}`);
    for (const [k, v] of Object.entries(f.tension)) if (v < 0 || v > 100) bad.push(`${f.id}: tension ${k}=${v}`);
    if (!f.active) for (const o of Object.values(w.factions)) if (o.active && f.id in o.tension && o.tension[f.id] > 0 && !f.parent) bad.push(`${f.id}: tarqalgan, lekin ${o.id} unga tension saqlayapti`);
  }
  for (const f of Object.values(w.factions)) {
    for (const k of ['wars', 'allies'] as const) for (const id of f[k] ?? []) if (!w.factions[id]?.[k]?.includes(f.id)) bad.push(`${f.id}: ${k} bir tomonlama (${id})`);
    if (f.wars?.some(id => f.allies?.includes(id))) bad.push(`${f.id}: bir vaqtda urush va ittifoq`);
  }
  for (const n of Object.values(w.npcs)) {
    if (n.alive && n.opId && !w.ops.some(o => o.id === n.opId)) bad.push(`${n.id}: yo'q operatsiya ${n.opId}`);
    if (!n.alive && (n.opId || n.travel)) bad.push(`${n.id}: o'lik, lekin opId/travel bor`);
    if (n.alive && (n.injury < 0 || n.injury > 1)) bad.push(`${n.id}: injury ${n.injury}`);
  }
  return bad;
}
