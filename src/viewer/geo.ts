// Dunyo koordinatalari: yo'llar bo'ylab NPC joylashuvi (viewer va o'yin uchun umumiy).
import type { NPC } from '../core/types.js';
import type { World } from '../sim/world.js';

export const WORLD_W = 3200, WORLD_H = 2200;
export type Pt = [number, number];

export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function jitter(id: string, r: number): Pt {
  const a = (hash(id) % 6283) / 1000, d = Math.sqrt((hash(id + 'r') % 1000) / 1000) * r;
  return [Math.cos(a) * d, Math.sin(a) * d];
}
export function along(pts: Pt[], t: number): Pt {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = Math.max(0, Math.min(1, t)) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? d / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
    d -= seg[i];
  }
  return pts[0];
}
export const nodePt = (w: World, id: string): Pt => [w.locations[id].x ?? 0, w.locations[id].y ?? 0];
export function pathPts(w: World, p: { a: string; b: string; pts?: Pt[] }): Pt[] { return [nodePt(w, p.a), ...(p.pts ?? []), nodePt(w, p.b)]; }
// Joy markazi: tugun yoki yo'lning o'rtasi
export function locPt(w: World, id: string): Pt {
  if (!w.locations[id]) return [WORLD_W / 2, WORLD_H / 2];
  if (w.locations[id].kind !== 'road') return nodePt(w, id);
  const p = w.paths.find(x => x.road === id);
  return p ? along(pathPts(w, p), 0.5) : [WORLD_W / 2, WORLD_H / 2];
}
export function npcPos(w: World, n: NPC): Pt {
  const t = n.travel;
  if (t && w.locations[n.location]?.kind === 'road') {
    const leg = t.legs[t.index];
    const from = t.index === 0 ? t.from : t.legs[t.index - 1].to;
    const start = t.legArrive - leg.hours;
    const f = Math.max(0, Math.min(1, (w.h - start) / leg.hours));
    if (w.locations[leg.to]?.kind === 'road') {          // yo'lning o'rtasiga qarab yurish
      const p = w.paths.find(x => x.road === leg.to)!;
      const pts = pathPts(w, p);
      const [x, y] = along(from === p.b ? pts.slice().reverse() : pts, 0.5 * f);
      const j = jitter(n.id, 14); return [x + j[0], y + j[1]];
    }
    const p = w.paths.find(x => x.road === leg.road && ((x.a === from && x.b === leg.to) || (x.b === from && x.a === leg.to)));
    if (p) {
      const pts = pathPts(w, p);
      const [x, y] = along(p.a === from ? pts : pts.slice().reverse(), f);
      const j = jitter(n.id, 10); return [x + j[0], y + j[1]];
    }
  }
  const [x, y] = locPt(w, n.location);
  const kind = w.locations[n.location]?.kind;
  const r = kind === 'road' ? 26 : kind === 'sect' ? 80 : kind === 'city' ? 90 : 55;
  const j = jitter(n.id, r);
  return [x + j[0], y + j[1]];
}
