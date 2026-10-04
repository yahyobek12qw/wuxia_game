import { readFileSync } from 'node:fs';
import { RngStreams } from '../core/rng.js';
import { EventBus } from '../core/eventBus.js';
import type { Faction, Leg, Location, Memory, NPC, NPCData, Operation, Path, SimEvent, StorySeed } from '../core/types.js';
import { MARTIAL_ROLES } from '../core/types.js';
import { travelMult, type Weather } from './calendar.js';
import type { Economy } from './settlement.js';
import type { Territory } from './territory.js';
import type { Law } from './law.js';
import type { Technique } from './cultivation.js';
import type { QuestBook } from './quests.js';

const dataDir = new URL('../../data/', import.meta.url);
const loadJson = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) as T;

export interface Snapshot {
  version: number; seed: number; h: number; seq: number; idc: number; intensity: number;
  npcs: Record<string, NPC>; factions: Record<string, Faction>; ops: Operation[];
  events: SimEvent[]; seeds: StorySeed[]; news: News[]; rng: Record<string, number>; weather?: Weather; econ?: Economy | null; terr?: Territory | null; law?: Law | null; techs?: Record<string, Technique> | null; quests?: QuestBook | null;
}
export interface News { at: number; to: string; memory: Memory; }

export class World {
  h = 0; seq = 0; idc = 0; intensity = 0;
  npcs: Record<string, NPC> = {};
  factions: Record<string, Faction> = {};
  ops: Operation[] = [];
  events: SimEvent[] = [];
  seeds: StorySeed[] = [];
  news: News[] = [];
  weather: Weather = { kind: 'clear', since: 0 };
  econ: Economy | null = null;
  terr: Territory | null = null;    // hudud egaligi o'zgarishlari (territory.ts)
  law: Law | null = null;           // mukofot e'lonlari (law.ts)
  techs: Record<string, Technique> | null = null;   // sekta va yaratilgan uslublar (cultivation.ts)
  quests: QuestBook | null = null;                  // paydo bo'luvchi iltimoslar va kechikkan oqibatlar (quests.ts)      // aholi punktlari iqtisodi (settlement.ts, birinchi kun oxirida yaratiladi)
  locations: Record<string, Location> = {};
  paths: Path[] = [];
  bus = new EventBus();
  rng: RngStreams;

  constructor(public seed: number, snap?: Snapshot) {
    const wd = loadJson<{ locations: Location[]; paths: Path[] }>('world.json');
    for (const l of wd.locations) this.locations[l.id] = l;
    this.paths = wd.paths;
    if (snap) {
      this.rng = new RngStreams(snap.seed, snap.rng);
      Object.assign(this, { h: snap.h, seq: snap.seq, idc: snap.idc, intensity: snap.intensity, npcs: snap.npcs,
        factions: snap.factions, ops: snap.ops, events: snap.events, seeds: snap.seeds, news: snap.news, weather: snap.weather ?? { kind: 'clear', since: 0 }, econ: snap.econ ?? null, terr: snap.terr ?? null, law: snap.law ?? null, techs: snap.techs ?? null, quests: snap.quests ?? null });
      return;
    }
    this.rng = new RngStreams(seed);
    for (const f of loadJson<Faction[]>('factions.json')) this.factions[f.id] = f;
    for (const d of loadJson<NPCData[]>('npcs.json')) this.npcs[d.id] = World.spawn(d);
  }

  static spawn(d: NPCData): NPC {
    return { ...structuredClone(d), location: d.home, injury: 0, alive: true, goals: [], memories: [], relations: {}, action: 'idle',
      needs: { hunger: 20, rest: 20, safety: 0, social: 30, purpose: 30 } };
  }

  get day(): number { return Math.floor(this.h / 24); }
  get hod(): number { return this.h % 24; }

  nextId(prefix: string): string { return `${prefix}_${++this.idc}`; }
  // Saralangan id'lar keshi: NPC'lar faqat qo'shiladi (o'lganlar ham qoladi), shuning uchun soni o'zgarsa yangilanadi
  // Tiriklar ro'yxati keshi: NPC qo'shilsa (addNpc) yoki o'lsa (kill → aliveVer++) yangilanadi.
  // Qaytgan massiv o'zgartirilmasligi kerak (filter/map/for-of bilan ishlating).
  private sortedIds: string[] = []; private sortedN = -1; aliveVer = 0; private aliveArr: NPC[] = []; private aliveAt = -1;
  addNpc(n: NPC): NPC { this.npcs[n.id] = n; this.sortedN = -1; return n; }
  alive(): NPC[] {
    if (this.sortedN < 0) { this.sortedIds = Object.keys(this.npcs).sort(); this.sortedN = this.sortedIds.length; this.aliveAt = -1; }
    if (this.aliveAt !== this.aliveVer) {
      const out: NPC[] = [];
      for (const k of this.sortedIds) { const n = this.npcs[k]; if (n.alive) out.push(n); }
      this.aliveArr = out; this.aliveAt = this.aliveVer;
    }
    return this.aliveArr;
  }
  // Joy va fraksiya indekslari (2600+ NPC uchun): soat sayin, o'lim bo'lganda yoki dirty() chaqirilganda qayta quriladi.
  // Har yozuv qaytarishdan oldin tekshiriladi (eskirgan yozuv chiqmaydi). Joy/fraksiyani o'zgartirgan kod dirty() chaqiradi.
  private atIdx: Map<string, NPC[]> | null = null; private famIdx: Map<string, NPC[]> | null = null; private idxKey = '';
  dirty(): void { this.atIdx = null; this.famIdx = null; }
  private idx(): void {
    const key = `${this.h}:${this.aliveVer}`;
    if (this.idxKey !== key) { this.idxKey = key; this.atIdx = null; this.famIdx = null; }
  }
  at(loc: string): NPC[] {
    this.idx();
    if (!this.atIdx) { const m = new Map<string, NPC[]>(); for (const n of this.alive()) { const a = m.get(n.location); if (a) a.push(n); else m.set(n.location, [n]); } this.atIdx = m; }
    const a = this.atIdx.get(loc); return a ? a.filter(n => n.alive && n.location === loc) : [];
  }
  members(fid: string): NPC[] {
    this.idx();
    if (!this.famIdx) { const m = new Map<string, NPC[]>(); for (const n of this.alive()) if (n.faction) { const a = m.get(n.faction); if (a) a.push(n); else m.set(n.faction, [n]); } this.famIdx = m; }
    const a = this.famIdx.get(fid); return a ? a.filter(n => n.alive && n.faction === fid) : [];
  }
  npc(id: string | undefined | null): NPC | undefined { return id ? this.npcs[id] : undefined; }
  nameOf(id: string | undefined | null): string {
    if (!id) return '?';
    if (id === 'unknown') return "noma'lum shaxs";
    return this.npcs[id]?.name ?? this.factions[id]?.name ?? this.locations[id]?.name ?? id;
  }

  emit(ev: Omit<SimEvent, 'seq' | 'h' | 'day'>): SimEvent {
    const full: SimEvent = { seq: ++this.seq, h: this.h, day: this.day, ...ev };
    this.events.push(full);
    this.bus.publish(full);
    return full;
  }

  tension(a: string, b: string): number { return this.factions[a]?.tension[b] ?? 0; }
  addTension(a: string, b: string, v: number): void {
    if (!this.factions[a]?.active || !this.factions[b]?.active) return; // tarqalgan fraksiya bilan taranglik yo'q
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const f = this.factions[x];
      if (f) f.tension[y] = Math.max(0, Math.min(100, (f.tension[y] ?? 0) + v));
    }
  }

  // Aholi chegarasi: shundan oshsa sargardonlar kelmaydi (katta dunyoda o'yin qatlami oshiradi)
  popCap = 70;

  // Bir soat ichida qayta hisoblanmaydigan qiymatlar (masalan, shifokorlar ro'yxati)
  private hc = new Map<string, unknown>(); private hcH = -1;
  perHour<T>(key: string, fn: () => T): T {
    if (this.hcH !== this.h) { this.hc.clear(); this.hcH = this.h; }
    if (!this.hc.has(key)) this.hc.set(key, fn());
    return this.hc.get(key) as T;
  }
  /** Savdogar boradigan bozor: shahardan — eng yaqin qishloqqa, qishloqdan — eng yaqin shaharga. */
  tradePartner(home: string): string | null {
    const key = 'partner:' + home; let s = this.geoCache.get(key);
    if (!s) { const kind = this.locations[home]?.kind; const p = this.nearest(home, this.ofKind(kind === 'city' ? 'village' : 'city').filter(x => x !== home), 40); s = p ? [p] : []; this.geoCache.set(key, s); }
    return s[0] ?? null;
  }

  // Yo'l tarmog'i: qo'shnilar ro'yxati va marshrut keshi (geografiya o'zgarsa — invalidateGeo)
  private adj: Map<string, { to: string; path: Path }[]> | null = null;
  private routeCache = new Map<string, Leg[] | null>();
  private distCache = new Map<string, Map<string, number>>();
  private geoCache = new Map<string, string[]>();
  invalidateGeo(): void { this.adj = null; this.routeCache.clear(); this.distCache.clear(); this.geoCache.clear(); }

  /** Aholi punktlari: avval shaharlar, keyin qishloqlar (qo'shilish tartibida). */
  settlements(): string[] {
    let s = this.geoCache.get('settlements');
    if (!s) { const ls = Object.values(this.locations); s = [...ls.filter(l => l.kind === 'city'), ...ls.filter(l => l.kind === 'village')].map(l => l.id); this.geoCache.set('settlements', s); }
    return s;
  }
  ofKind(kind: Location['kind']): string[] {
    const key = 'kind:' + kind; let s = this.geoCache.get(key);
    if (!s) { s = Object.values(this.locations).filter(l => l.kind === kind).map(l => l.id); this.geoCache.set(key, s); }
    return s;
  }
  /** Savdo yo'llari: ikki uchi ham aholi punkti bo'lgan yo'llar (pistirma uchun qulay). */
  tradeRoads(): string[] {
    let s = this.geoCache.get('trade');
    if (!s) { const set = new Set(this.settlements()); s = [...new Set(this.paths.filter(p => set.has(p.a) && set.has(p.b)).map(p => p.road))]; this.geoCache.set('trade', s); }
    return s;
  }
  /** Tugunga tutash yo'llar. */
  roadsAt(node: string): string[] { return [...new Set(this.neighbors(node).map(x => x.path.road))]; }
  /** Bir manbadan barcha tugunlargacha soat (Dijkstra, keshlangan). */
  distances(from: string): Map<string, number> {
    let d = this.distCache.get(from); if (d) return d;
    d = new Map([[from, 0]]); const done = new Set<string>(), open = [from];
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (d.get(open[k])! < d.get(open[bi])!) bi = k;
      const cur = open.splice(bi, 1)[0]; if (done.has(cur)) continue; done.add(cur);
      for (const { to, path } of this.neighbors(cur)) { const nd = d.get(cur)! + path.hours; if (nd < (d.get(to) ?? Infinity)) { d.set(to, nd); open.push(to); } }
    }
    this.distCache.set(from, d); return d;
  }
  /** Joy (tugun yoki yo'l) gacha taxminiy soat: yo'l uchun yaqin uchigacha. */
  hoursTo(from: string, to: string): number {
    const d = this.distances(from);
    if (this.locations[to]?.kind === 'road') { let m = Infinity; for (const p of this.paths) if (p.road === to) m = Math.min(m, d.get(p.a) ?? Infinity, d.get(p.b) ?? Infinity); return m; }
    return d.get(to) ?? Infinity;
  }
  /** Ro'yxatdagi eng yaqin joy (teng bo'lsa — ro'yxat tartibi). */
  nearest(from: string, ids: string[], max = Infinity): string | null {
    let best: string | null = null, bd = Infinity;
    for (const id of ids) { const h = this.hoursTo(from, id); if (h === Infinity || h > max) continue; if (best === null || h < bd) { bd = h; best = id; } }
    return best;
  }
  private neighbors(id: string): { to: string; path: Path }[] {
    if (!this.adj) {
      this.adj = new Map();
      for (const p of this.paths) for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) { if (!this.adj.has(x)) this.adj.set(x, []); this.adj.get(x)!.push({ to: y, path: p }); }
    }
    return this.adj.get(id) ?? [];
  }
  // Eng qisqa yo'l (soatlar bo'yicha Dijkstra): oyoqlar ro'yxati
  route(from: string, to: string): Leg[] | null {
    if (from === to) return [];
    const key = `${from}|${to}`;
    if (this.routeCache.has(key)) { const c = this.routeCache.get(key)!; return c && c.slice(); }
    const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, { from: string; path: Path }>(), done = new Set<string>();
    const open = [from];
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (dist.get(open[k])! < dist.get(open[bi])!) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (done.has(cur)) continue; done.add(cur);
      if (cur === to) break;
      for (const { to: nxt, path } of this.neighbors(cur)) {
        if (done.has(nxt)) continue;
        const nd = dist.get(cur)! + path.hours;
        if (nd < (dist.get(nxt) ?? Infinity)) { dist.set(nxt, nd); prev.set(nxt, { from: cur, path }); open.push(nxt); }
      }
    }
    let legs: Leg[] | null = null;
    if (prev.has(to)) {
      legs = [];
      for (let c = to; c !== from;) { const s = prev.get(c)!; legs.unshift({ road: s.path.road, to: c, hours: s.path.hours }); c = s.from; }
    }
    this.routeCache.set(key, legs);
    return legs && legs.slice();
  }
  // Yo'ldagi joy bo'lsa, eng yaqin tugun
  nodeOf(n: NPC): string {
    if (this.locations[n.location]?.kind !== 'road') return n.location;
    if (n.travel) {
      for (let i = n.travel.index; i < n.travel.legs.length; i++) if (this.locations[n.travel.legs[i].to]?.kind !== 'road') return n.travel.legs[i].to;
    }
    return this.paths.find(p => p.road === n.location)?.a ?? n.home;
  }
  travelTime(from: string, to: string): number {
    return (this.route(from, to) ?? []).reduce((s, l) => s + l.hours, 0);
  }
  startTravel(n: NPC, to: string, purpose: string, arriveAt?: number): boolean {
    if (n.player) return false;     // o'yinchining joyini o'yin qatlami boshqaradi
    const from = this.nodeOf(n);
    let legs: Leg[] | null;
    if (this.locations[to]?.kind === 'road') {
      const p = this.paths.find(x => x.road === to)!;
      const ra = this.route(from, p.a), rb = this.route(from, p.b);
      const len = (l: Leg[] | null) => l ? l.reduce((s, x) => s + x.hours, 0) : Infinity;
      const base = len(ra) <= len(rb) ? ra : rb;
      legs = base ? [...base, { road: to, to, hours: 1 }] : null;
      if (n.location === to) legs = [];
    } else legs = this.route(from, to);
    if (!legs) return false;
    this.dirty();
    if (legs.length === 0) { n.location = to; n.travel = undefined; return true; }
    const wm = travelMult(this);                                      // yomg'ir, qor, bo'ron sayohatni sekinlashtiradi
    if (wm !== 1) legs = legs.map(l => ({ ...l, hours: Math.max(1, Math.round(l.hours * wm)) }));
    const total = legs.reduce((s, l) => s + l.hours, 0);
    const startH = arriveAt !== undefined ? Math.max(this.h, arriveAt - total) : this.h;
    n.location = legs[0].road;
    n.travel = { from, legs, index: 0, legArrive: startH + legs[0].hours, final: to, purpose };
    return true;
  }

  isMartial(n: NPC): boolean { return MARTIAL_ROLES.includes(n.role); }

  snapshot(): Snapshot {
    return structuredClone({ version: 1, seed: this.seed, h: this.h, seq: this.seq, idc: this.idc, intensity: this.intensity,
      npcs: this.npcs, factions: this.factions, ops: this.ops, events: this.events, seeds: this.seeds, news: this.news,
      rng: this.rng.snapshot(), weather: this.weather, econ: this.econ, terr: this.terr, law: this.law, techs: this.techs, quests: this.quests });
  }
}
