// Katakli dunyo (500×350 = 175 000 katak). Markazda — sim yadrosi (Majnuntol vodiysi, 50×35),
// atrofda protsedural dunyo: hududlar (xavf darajasi bilan), daryolar, dengiz, joylar (POI) va yo'llar.
import type { World } from '../sim/world.js';
import { WORLD_W, WORLD_H, pathPts, type Pt } from '../viewer/geo.js';

export const TILE = 64;                                                     // sim koordinatalarida bir katak
export const CORE_C = Math.ceil(WORLD_W / TILE), CORE_R = Math.ceil(WORLD_H / TILE);
export const COLS = 500, ROWS = 350;
export const OX = Math.floor((COLS - CORE_C) / 2), OY = Math.floor((ROWS - CORE_R) / 2);
export const T = { PLAIN: 0, FOREST: 1, MOUNTAIN: 2, WATER: 3, ROAD: 4, PLACE: 5 } as const;
export const TERRAIN_NAME = ['Dala', "O'rmon", "Tog'", 'Suv', "Yo'l", 'Manzil'];
export const MOVE_HOURS = [2, 3, 5, 99, 1, 1];     // katakka o'tish vaqti (soat)

export type PoiKind = 'town' | 'village' | 'cave' | 'ruin' | 'shrine' | 'hideout' | 'sect_ruin' | 'sect';
export interface Poi { id: string; name: string; kind: PoiKind; tx: number; ty: number; region: number; tier: number; market: boolean; smith: boolean; guardian: boolean; evil?: boolean }
export interface Region { id: number; name: string; tier: number; cx: number; cy: number }
export interface Grid {
  cols: number; rows: number; tile: number; core: { x: number; y: number; w: number; h: number };
  t: Uint8Array; qi: Uint8Array; fs: Uint8Array; herb: Uint8Array; ore: Uint8Array; region: Uint8Array; poi: Int16Array;
  loc: (string | null)[];           // sim joyi (faqat yadroda)
  pois: Poi[]; regions: Region[];
  edges: { a: string; b: string; tiles: number[] }[];   // yo'llar: qaysi joylarni bog'laydi (sim yo'llari shundan quriladi)
}

// ---------------- Shovqin ----------------
function hash2(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 5): number {
  let a = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, s + i * 17); tot += amp; f *= 2; amp *= 0.5; }
  return a / tot;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distPoly(px: number, py: number, pts: Pt[]): number { let m = 1e9; for (let i = 1; i < pts.length; i++) m = Math.min(m, distSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return m; }
function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Sim koordinatalari (yadro) → katta to'rdagi katak. */
export const tileOf = (x: number, y: number): [number, number] => [clamp(Math.floor(x / TILE) + OX, 0, COLS - 1), clamp(Math.floor(y / TILE) + OY, 0, ROWS - 1)];
export const inCore = (c: number, r: number) => c >= OX && c < OX + CORE_C && r >= OY && r < OY + CORE_R;
/** Yadro to'rtburchagigacha masofa (katak); ichida 0. */
const coreDist = (c: number, r: number) => Math.hypot(Math.max(OX - c, 0, c - (OX + CORE_C - 1)), Math.max(OY - r, 0, r - (OY + CORE_R - 1)));

// ---------------- Yadro (oldingi qo'lda yasalgan xarita) ----------------
const RIVER: Pt[] = [[2450, -60], [2620, 260], [2860, 560], [2970, 900], [2950, 1220], [2850, 1500], [2960, 1800], [3070, 2260]];
const LAKES = [{ x: 1780, y: 520, rx: 150, ry: 95 }, { x: 760, y: 1250, rx: 90, ry: 60 }];
const isCoreLoc = (id: string) => !id.startsWith('poi_') && !id.startsWith('road_');
function coreField(w: World) {
  const nodes = Object.values(w.locations).filter(l => l.x != null && isCoreLoc(l.id));
  const mounts = [
    ...nodes.filter(l => l.kind === 'sect' || l.kind === 'cave').map(l => ({ x: l.x!, y: l.y!, r: l.kind === 'sect' ? 520 : 330, h: l.kind === 'sect' ? 0.6 : 0.42 })),
    { x: 180, y: 260, r: 380, h: 0.4 }, { x: 1150, y: 120, r: 420, h: 0.34 }, { x: 260, y: 1250, r: 260, h: 0.24 },
    { x: 2200, y: 2150, r: 380, h: 0.3 }, { x: 3150, y: 200, r: 300, h: 0.22 },
  ];
  const forestRoads = w.paths.filter(p => p.road === 'black_forest').map(p => pathPts(w, p));
  return (c: number, r: number) => {
    const x = (c - OX) * TILE + TILE / 2, y = (r - OY) * TILE + TILE / 2;
    let e = 0.3 + 0.38 * fbm(x / 640, y / 640, 1, 5);
    for (const m of mounts) { const d = Math.hypot(x - m.x, y - m.y) / m.r; e += m.h * Math.exp(-d * d); }
    e += 0.2 * Math.exp(-(((y + 120) / 340) ** 2));
    let wd = distPoly(x, y, RIVER) - (30 + 18 * vnoise(y / 150, x / 400, 9));
    for (const l of LAKES) { const d = Math.hypot((x - l.x) / l.rx, (y - l.y) / l.ry); wd = Math.min(wd, (d - 1) * Math.min(l.rx, l.ry)); }
    const m = clamp(fbm(x / 520 + 50, y / 520, 2, 4) + 0.35 * Math.max(0, 1 - Math.abs(wd) / 260) - 0.08, 0, 1);
    let f = smooth(0.5, 0.64, m) * (1 - smooth(0.56, 0.7, e));
    for (const p of forestRoads) f = Math.max(f, (1 - clamp(distPoly(x, y, p) / 300, 0, 1)) * 1.05);
    const t = wd < 4 ? T.WATER : e > 0.62 ? T.MOUNTAIN : f > 0.42 + 0.2 * hash2(c, r, 12) ? T.FOREST : T.PLAIN;
    return { t, e, m };
  };
}

// ---------------- Nomlar ----------------
const REGION_NAMES = ["Qorli Cho'qqilar", "Bambuk Dengizi", 'Tumanli Botqoq', 'Sharqiy Sohil', "Qadimiy Xarobalar Dashti", 'Iblis Vodiysi', 'Sariq Tepaliklar', "Ming Ko'l O'lkasi",
  'Ajdaho Tizmasi', 'Yashil Qirlar', 'Shamol Darasi', "Qizil Tosh Tog'lari", 'Kumush Daryo Havzasi', "Sokin O'rmon", 'Nefrit Vodiysi', 'Momaqaldiroq Platosi', "Oy Ko'li Yerlari", 'Temir Qoyalar'];
const ROOTS = ['Bai', 'Hei', 'Qing', 'Hong', 'Jin', 'Yun', 'Feng', 'Shui', 'Long', 'Hu', 'Lan', 'Mei', 'Song', 'Zhu', 'Yue', 'Xing', 'Tian', 'Shan', 'He', 'Lin', 'Ming', 'Ying', 'Ruo', 'Xue'];
const SUFFIX: Record<PoiKind, string> = { town: 'shahri', village: "qishlog'i", cave: "g'ori", ruin: 'xarobalari', shrine: 'ibodatxonasi', hideout: 'qaroqchilar uyasi', sect_ruin: 'tashlandiq sektasi', sect: 'sektasi' };

// ---------------- Generatsiya ----------------
const cache = new Map<number, Grid>();
export function buildGrid(w: World, seed = 1): Grid {
  const hit = cache.get(seed); if (hit) return hit;
  const N = COLS * ROWS, rnd = mulberry(seed * 9973 + 17), S = (seed * 131) % 997;
  const g: Grid = { cols: COLS, rows: ROWS, tile: TILE, core: { x: OX, y: OY, w: CORE_C, h: CORE_R },
    t: new Uint8Array(N), qi: new Uint8Array(N), fs: new Uint8Array(N), herb: new Uint8Array(N), ore: new Uint8Array(N), region: new Uint8Array(N), poi: new Int16Array(N),
    loc: new Array(N).fill(null), pois: [], regions: [], edges: [] };
  const core = coreField(w);

  // 1) Global balandlik va namlik (katak koordinatalarida)
  const E = new Float32Array(N), M = new Float32Array(N);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    const ridge = 1 - Math.abs(2 * fbm(c / 30 + S, r / 30, 41, 4) - 1);
    let e = 0.55 * fbm(c / 85 + S, r / 85 + S, 31, 5) + 0.35 * ridge * ridge;
    const coast = fbm(c / 40, r / 40 + S, 51, 3) * 40;                         // sharq va janubi-sharq — dengiz
    e -= 0.5 * smooth(COLS - 110, COLS - 30, c + coast) + 0.3 * smooth(ROWS - 70, ROWS - 10, r + coast) * smooth(COLS * 0.55, COLS, c);
    e += 0.12 * smooth(60, 0, r);                                              // shimol — baland, qorli
    E[i] = e; M[i] = fbm(c / 60 + S + 70, r / 60, 61, 4);
  }
  // Kvantillar: dengiz ~10%, tog' ~20% (quruqlikda), o'rmon ~30%
  const sorted = Float32Array.from(E).sort(), seaT = sorted[Math.floor(N * 0.1)], mountT = sorted[Math.floor(N * 0.8)];
  const msorted = Float32Array.from(M).sort(), forestT = msorted[Math.floor(N * 0.62)];

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c, e = E[i], m = M[i];
    let t: number = e < seaT ? T.WATER : e > mountT ? T.MOUNTAIN : m > forestT + 0.06 * (hash2(c, r, 12) - 0.5) ? T.FOREST : T.PLAIN;
    if (t !== T.WATER && fbm(c / 14 + S, r / 14, 71, 3) > 0.74 && e < mountT - 0.05) t = T.WATER;   // ko'llar
    // Yadro: aynan oldingi xarita; atrofida 8 katakli halqa bo'ylab aralashadi
    const d = coreDist(c, r);
    if (d < 8) { const cf = core(c, r); if (d === 0 || hash2(c, r, 77) > d / 8) t = cf.t; }
    g.t[i] = t;
  }

  // 2) Daryolar: baland joydan pastga, dengizgacha (sim daryosi davom ettiriladi)
  const carve = (c: number, r: number, wide: boolean) => {
    for (const [dc, dr] of wide ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]]) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS && !inCore(cc, rr)) g.t[rr * COLS + cc] = T.WATER; }
  };
  const flow = (c: number, r: number, maxSteps: number) => {
    const seen = new Set<number>();
    for (let s = 0; s < maxSteps; s++) {
      const i = r * COLS + c; seen.add(i);
      if (g.t[i] === T.WATER && s > 3 && !inCore(c, r)) break;
      carve(c, r, s > maxSteps * 0.5);
      let best = -1, bv = 1e9;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = nr * COLS + nc; if (seen.has(ni)) continue;
        const v = E[ni] + 0.04 * hash2(nc, nr, s + 5); if (v < bv) { bv = v; best = ni; }
      }
      if (best < 0) break;
      c = best % COLS; r = Math.floor(best / COLS);
    }
  };
  const [rbx, rby] = tileOf(3070, 2200); flow(rbx, rby + 1, 400);                 // sim daryosining quyi oqimi
  for (let k = 0; k < 9; k++) {                                               // tog'lardan boshlanadigan daryolar
    for (let tries = 0; tries < 200; tries++) {
      const c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS), i = r * COLS + c;
      if (g.t[i] === T.MOUNTAIN && coreDist(c, r) > 12) { flow(c, r, 500); break; }
    }
  }

  // 3) Hududlar: Voronoy (chegaralari shovqin bilan), xavf darajasi yadrodan uzoqlik bilan oshadi
  const ccx = OX + CORE_C / 2, ccy = OY + CORE_R / 2, maxD = Math.hypot(COLS / 2, ROWS / 2);
  const seeds: { x: number; y: number }[] = [{ x: ccx, y: ccy }];
  const gx = 5, gy = 4;
  for (let a = 0; a < gx; a++) for (let b = 0; b < gy; b++) {
    const x = (a + 0.2 + 0.6 * rnd()) * COLS / gx, y = (b + 0.2 + 0.6 * rnd()) * ROWS / gy;
    if (Math.hypot(x - ccx, y - ccy) > 55) seeds.push({ x, y });
  }
  const names = REGION_NAMES.slice(); for (let k = names.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [names[k], names[j]] = [names[j], names[k]]; }
  // Xavf darajasi: yadrogacha masofa tartibi bo'yicha 1..8 (yaqin hududlar oson, chekkalar eng xavfli)
  const order = seeds.map((s, k) => ({ k, d: Math.hypot(s.x - ccx, s.y - ccy) })).filter(o => o.k > 0).sort((a, b) => a.d - b.d);
  const tierOf = new Map(order.map((o, rank) => [o.k, 1 + Math.floor(rank / Math.max(1, order.length - 1) * 7.99)]));
  g.regions = seeds.map((s, k) => ({ id: k, name: k === 0 ? 'Majnuntol vodiysi' : names[(k - 1) % names.length], cx: Math.round(s.x), cy: Math.round(s.y), tier: k === 0 ? 0 : tierOf.get(k)! }));
  void maxD;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    if (inCore(c, r)) { g.region[i] = 0; continue; }
    const jx = c + (fbm(c / 25, r / 25, 81, 3) - 0.5) * 40, jy = r + (fbm(c / 25, r / 25, 91, 3) - 0.5) * 40;
    let best = 0, bd = 1e9; for (let k = 0; k < seeds.length; k++) { const d = Math.hypot(jx - seeds[k].x, jy - seeds[k].y); if (d < bd) { bd = d; best = k; } }
    g.region[i] = best;
  }

  // 4) Sim yo'llari va manzillari (yadro)
  for (const p of w.paths) {
    if (!isCoreLoc(p.road)) continue;
    const pts = pathPts(w, p);
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 12);
      for (let s = 0; s <= steps; s++) { const [c, r] = tileOf(ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps); const i = r * COLS + c; if (g.t[i] !== T.PLACE) { g.t[i] = T.ROAD; g.loc[i] = p.road; } }
    }
  }
  const nodes = Object.values(w.locations).filter(l => l.x != null && isCoreLoc(l.id));
  for (const l of nodes) {
    const [cc, cr] = tileOf(l.x!, l.y!);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const i = (cr + dr) * COLS + cc + dc; g.t[i] = T.PLACE; g.loc[i] = l.id; }
  }

  // 5) Joylar (POI): har hududda shahar, qishloqlar, g'or, xaroba, ibodatxona, uya
  const used = new Set<string>();
  const nameOf = (kind: PoiKind) => { for (;;) { const a = ROOTS[Math.floor(rnd() * ROOTS.length)], b = ROOTS[Math.floor(rnd() * ROOTS.length)].toLowerCase(); const n = `${a}${b} ${SUFFIX[kind]}`; if (a.toLowerCase() !== b && !used.has(n)) { used.add(n); return n; } } };
  const okSpot = (c: number, r: number, kind: PoiKind) => {
    if (c < 3 || r < 3 || c >= COLS - 3 || r >= ROWS - 3 || coreDist(c, r) < 5) return false;
    const t = g.t[r * COLS + c];
    if (t === T.WATER || t === T.PLACE || t === T.ROAD) return false;
    if ((kind === 'town' || kind === 'village') && t !== T.PLAIN) return false;
    if (kind === 'cave' && t !== T.MOUNTAIN) return false;
    if ((kind === 'shrine' || kind === 'sect') && t === T.PLAIN) return false;
    return g.pois.every(p => Math.hypot(p.tx - c, p.ty - r) >= 9);
  };
  for (const reg of g.regions) {
    const plan: PoiKind[] = ['village', 'village', 'cave', 'ruin'];
    if (reg.tier <= 6) plan.unshift('town');
    if (rnd() < 0.7) plan.push('village');
    if (rnd() < 0.6) plan.push('shrine');
    if (rnd() < 0.6) plan.push('hideout');
    if (reg.tier >= 3 && rnd() < 0.7) plan.push('sect_ruin');
    if (rnd() < 0.5) plan.push('cave');
    if (reg.tier >= 2 && reg.tier <= 7 && rnd() < 0.8) plan.unshift('sect');   // tirik sektalar
    for (const kind of plan) {
      for (let tries = 0; tries < 600; tries++) {
        const c = Math.round(reg.cx + (rnd() - 0.5) * 120), r = Math.round(reg.cy + (rnd() - 0.5) * 100);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || g.region[r * COLS + c] !== reg.id || !okSpot(c, r, kind)) continue;
        const p: Poi = { id: `poi_${g.pois.length}`, name: nameOf(kind), kind, tx: c, ty: r, region: reg.id, tier: Math.max(1, reg.tier),
          market: kind === 'town' || kind === 'village', smith: kind === 'town', guardian: kind === 'cave' || kind === 'ruin' || kind === 'sect_ruin' };
        g.pois.push(p); g.t[r * COLS + c] = T.PLACE; g.poi[r * COLS + c] = g.pois.length;
        if (kind !== 'cave') g.loc[r * COLS + c] = p.id;   // sim manzili (g'orlar yo'lsiz, alohida)
        break;
      }
    }
  }

  // Iblis sektalari: ~1/4, eng xavfli hududlardagilar
  const sects = g.pois.filter(p => p.kind === 'sect').sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
  sects.slice(0, Math.max(1, Math.round(sects.length / 4))).forEach(p => { p.evil = true; p.name = p.name.replace(' sektasi', ' iblis sektasi'); });

  // 6) Yo'llar: joylar va yadro manzillari orasida minimal daraxt + bir nechta halqa
  type Hub = { x: number; y: number; id: string };
  const hubs: Hub[] = [...g.pois.filter(p => p.kind !== 'cave' && p.kind !== 'hideout').map(p => ({ x: p.tx, y: p.ty, id: p.id })),
    ...nodes.filter(l => l.kind === 'city' || l.kind === 'village').map(l => { const [x, y] = tileOf(l.x!, l.y!); return { x, y, id: l.id }; })];
  const road = (a: Hub, b: Hub): number[] => {
    // A* (8 yo'nalish) cheklangan oynada: relyef narxi + ozgina shovqin (yo'llar tabiiy egri bo'lsin)
    const M = 30, x0 = Math.max(0, Math.min(a.x, b.x) - M), x1 = Math.min(COLS - 1, Math.max(a.x, b.x) + M), y0 = Math.max(0, Math.min(a.y, b.y) - M), y1 = Math.min(ROWS - 1, Math.max(a.y, b.y) + M);
    const bw = x1 - x0 + 1, NN = bw * (y1 - y0 + 1), li = (c: number, r: number) => (r - y0) * bw + (c - x0);
    const gs = new Float32Array(NN).fill(Infinity), prev = new Int32Array(NN).fill(-1), closed = new Uint8Array(NN);
    const hf: number[] = [], hn: number[] = [];
    const push = (f: number, n: number) => { hf.push(f); hn.push(n); let i = hf.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hn[p], hn[i]] = [hn[i], hn[p]]; i = p; } };
    const pop = () => { const n = hn[0], lf = hf.pop()!, ln = hn.pop()!; if (hf.length) { hf[0] = lf; hn[0] = ln; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === i) break; [hf[m], hf[i]] = [hf[i], hf[m]]; [hn[m], hn[i]] = [hn[i], hn[m]]; i = m; } } return n; };
    const cost = (c: number, r: number) => { const t = g.t[r * COLS + c]; return (t === T.ROAD ? 0.35 : t === T.FOREST ? 1.6 : t === T.MOUNTAIN ? 4 : t === T.WATER ? 7 : 1) + 0.3 * hash2(c, r, 101); };
    const heur = (c: number, r: number) => { const dx = Math.abs(c - b.x), dy = Math.abs(r - b.y); return 0.6 * (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)); };
    const s0 = li(a.x, a.y), t0 = li(b.x, b.y); gs[s0] = 0; push(heur(a.x, a.y), s0);
    while (hf.length) {
      const cur = pop(); if (closed[cur]) continue; closed[cur] = 1; if (cur === t0) break;
      const cc = cur % bw + x0, cr = ((cur / bw) | 0) + y0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue; const nc = cc + dc, nr = cr + dr; if (nc < x0 || nc > x1 || nr < y0 || nr > y1) continue;
        const ni = li(nc, nr); if (closed[ni]) continue;
        const nd = gs[cur] + cost(nc, nr) * (dc && dr ? 1.41 : 1);
        if (nd < gs[ni]) { gs[ni] = nd; prev[ni] = cur; push(nd + heur(nc, nr), ni); }
      }
    }
    const tiles: number[] = [];
    if (prev[t0] < 0) return tiles;
    const path: number[] = []; for (let k = t0; k !== s0; k = prev[k]) path.unshift(k);
    for (const k of path) {
      const c = k % bw + x0, r = ((k / bw) | 0) + y0, i = r * COLS + c;
      if (g.t[i] !== T.PLACE && !g.loc[i]) g.t[i] = T.ROAD;            // suv ustida — ko'prik, tog'da — dovon
      if (g.t[i] !== T.PLACE) tiles.push(i);
    }
    return tiles;
  };
  const inTree = new Set([0]), edges: [number, number][] = [];
  const dist = (p: number, q: number) => Math.hypot(hubs[p].x - hubs[q].x, hubs[p].y - hubs[q].y);
  while (inTree.size < hubs.length) {                                          // Prim
    let bp = -1, bq = -1, bd = 1e9;
    for (const p of inTree) for (let q = 0; q < hubs.length; q++) if (!inTree.has(q)) { const d = dist(p, q); if (d < bd) { bd = d; bp = p; bq = q; } }
    inTree.add(bq); edges.push([bp, bq]);
  }
  for (let p = 0; p < hubs.length; p++) if (rnd() < 0.25) {                    // halqalar
    let bq = -1, bd = 1e9; for (let q = 0; q < hubs.length; q++) if (q !== p && !edges.some(([x, y]) => (x === p && y === q) || (x === q && y === p))) { const d = dist(p, q); if (d < bd) { bd = d; bq = q; } }
    if (bq >= 0 && bd < 45) edges.push([p, bq]);
  }
  const all: [Hub, Hub][] = edges.map(([p, q]) => [hubs[p], hubs[q]]);
  for (const p of g.pois.filter(x => x.kind === 'hideout')) {           // uyalar eng yaqin joyga so'qmoq bilan ulanadi
    const me = { x: p.tx, y: p.ty, id: p.id };
    const settled = new Set([...g.pois.filter(x => x.kind === 'town' || x.kind === 'village').map(x => x.id), ...nodes.filter(l => l.kind === 'city' || l.kind === 'village').map(l => l.id)]);
    const near = hubs.filter(h => settled.has(h.id)).sort((u, v) => Math.hypot(u.x - me.x, u.y - me.y) - Math.hypot(v.x - me.x, v.y - me.y))[0];   // uya — eng yaqin aholi punktiga
    if (near) all.push([me, near]);
  }
  for (const [a, b] of all) {
    const tiles = road(a, b), k = g.edges.length;
    g.edges.push({ a: a.id, b: b.id, tiles });
    for (const i of tiles) if (!g.loc[i]) g.loc[i] = `road_${k}`;
  }

  // 7) Katak qiymatlari: qi, feng-shui, o't, ruda (xavfli hududlar boyroq)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c, t = g.t[i], tier = g.regions[g.region[i]].tier, h1 = hash2(c, r, 13), h2 = hash2(c, r, 14);
    const e = inCore(c, r) ? core(c, r).e : E[i];
    const coreBoost = inCore(c, r) && g.loc[i] && t === T.PLACE ? w.locations[g.loc[i]!].qi : 1;
    g.qi[i] = clamp(Math.round((8 + 22 * smooth(0.3, 0.95, inCore(c, r) ? e : (e - seaT) / (mountT - seaT + 0.2) + 0.3) + 6 * fbm(c / 5, r / 5, 21) + tier * 3) * coreBoost), 3, 90);
    g.fs[i] = clamp(Math.round(1 + 2 * M[i] + (t === T.MOUNTAIN ? 1.5 : 0)), 1, 5);
    g.herb[i] = t === T.FOREST ? 2 + Math.floor(h1 * 4) : t === T.PLAIN || t === T.MOUNTAIN ? Math.floor(h1 * 3) : 0;
    g.ore[i] = t === T.MOUNTAIN ? 2 + Math.floor(h2 * 4) + (tier >= 4 ? 1 : 0) : t === T.PLAIN ? Math.floor(h2 * 1.7) : 0;
    if (t === T.PLACE || t === T.ROAD || t === T.WATER) { g.herb[i] = 0; g.ore[i] = 0; }
  }
  for (const p of g.pois) if (p.kind === 'shrine' || p.kind === 'sect') g.qi[p.ty * COLS + p.tx] = 60 + p.tier * 3;

  cache.set(seed, g);
  return g;
}
