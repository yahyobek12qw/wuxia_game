// Sim'ni katta dunyoga kengaytirish: joylar (shahar, qishloq, uya) sim manzillariga, yo'llar sim yo'llariga aylanadi;
// har shaharga qo'riqchilar fraksiyasi, har uyaga to'da va hamma joyga aholi beriladi.
import type { Faction, NPCData, Role, Traits } from '../core/types.js';
import { World } from '../sim/world.js';
import { type Grid, type Poi, TILE, OX, OY, COLS } from './terrain.js';

const SUR = ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Gao', 'Luo', 'Zheng', 'Liang', 'Xie', 'Song', 'Tang', 'Han', 'Feng', 'Deng', 'Cao', 'Peng', 'Zeng', 'Xiao', 'Tian', 'Dong', 'Pan', 'Yuan', 'Cai', 'Jiang', 'Yu', 'Du'];
const GIV = ['Wei', 'Fang', 'Lei', 'Jun', 'Ming', 'Hui', 'Yan', 'Ling', 'Jie', 'Tao', 'Bo', 'Qiang', 'Rong', 'Xin', 'Yu', 'Hao', 'Kai', 'Lan', 'Mei', 'Ning', 'Ping', 'Qing', 'Shan', 'Tian', 'Xue', 'Ying', 'Zhen', 'Feng', 'Hong', 'Jin'];
const KIND = { town: 'city', village: 'village', hideout: 'camp', ruin: 'site', shrine: 'site', sect_ruin: 'site', sect: 'sect' } as const;

const isSettlement = (p: Poi) => p.kind !== 'cave';   // g'orlardan boshqa hamma joy — sim tuguni (yo'llar ular orqali o'tadi)
const simXY = (tx: number, ty: number) => ({ x: (tx - OX) * TILE + TILE / 2, y: (ty - OY) * TILE + TILE / 2 });
export const guardId = (p: Poi) => `guard_${p.id}`;
export const gangId = (p: Poi) => `gang_${p.id}`;
export const sectId = (p: Poi) => `sect_${p.id}`;

/** Geografiyani sim'ga qo'shadi (deterministik; saqlashdan tiklashda ham chaqiriladi). */
export function extendGeo(w: World, g: Grid): void {
  if (w.locations['road_0'] || g.pois.some(p => w.locations[p.id])) return;   // allaqachon kengaytirilgan
  const towns = g.pois.filter(p => p.kind === 'town' || (p.kind === 'sect' && !p.evil));   // qishloqlarni himoya qiluvchilar
  const dist = (a: Poi, b: Poi) => Math.hypot(a.tx - b.tx, a.ty - b.ty);
  for (const p of g.pois) {
    if (!isSettlement(p)) continue;
    const protector = (t: Poi) => (t.kind === 'sect' ? sectId(t) : guardId(t));
    const owner = p.kind === 'town' ? guardId(p) : p.kind === 'hideout' ? gangId(p) : p.kind === 'sect' ? sectId(p) : p.kind !== 'village' ? undefined
      : (() => { const t = towns.slice().sort((a, b) => dist(a, p) - dist(b, p))[0]; return t && dist(t, p) < 70 ? protector(t) : undefined; })();
    w.locations[p.id] = { id: p.id, name: p.name, kind: KIND[p.kind as keyof typeof KIND], qi: p.kind === 'sect' ? 2 : p.kind === 'shrine' ? 2.5 : 1, owner, ...simXY(p.tx, p.ty) };
  }
  g.edges.forEach((e, k) => {
    const id = `road_${k}`, A = w.locations[e.a], B = w.locations[e.b];
    if (!A || !B) return;
    const townEnd = [e.a, e.b].map(x => w.locations[x]).find(l => l.kind === 'city' && l.owner);
    w.locations[id] = { id, name: `${A.name} — ${B.name} yo'li`, kind: 'road', qi: 1, owner: townEnd?.owner };
    const pts: [number, number][] = [];
    for (let j = 2; j < e.tiles.length - 2; j += 4) { const i = e.tiles[j]; const { x, y } = simXY(i % COLS, Math.floor(i / COLS)); pts.push([x, y]); }
    // Yadro yo'llari bilan bir xil tezlik: ~3 katak soatiga (yadroda 20 katak ≈ 4–7 soat)
    w.paths.push({ a: e.a, b: e.b, road: id, hours: Math.max(1, Math.round(e.tiles.length / 3)), pts });
  });
  w.invalidateGeo();
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Yangi o'yin: fraksiyalar va aholi (faqat birinchi marta; saqlashda NPC'lar sim holatida bo'ladi). */
export function populate(w: World, g: Grid, seed: number): void {
  const r = rng(seed * 7919 + 101), pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const rr = (a: number, b: number) => a + (b - a) * r(), ri = (a: number, b: number) => Math.floor(rr(a, b + 1));
  const traits = (bias: Partial<Traits> = {}): Traits => ({ ambition: rr(0.2, 0.9), loyalty: rr(0.2, 0.9), greed: rr(0.1, 0.9), courage: rr(0.2, 0.9), honor: rr(0.15, 0.9),
    curiosity: rr(0.2, 0.9), temper: rr(0.1, 0.8), discipline: rr(0.2, 0.9), ...bias });
  let seq = 0;
  const person = (p: Poi, role: Role, faction: string | null, realm: number, bias: Partial<Traits> = {}, silver = ri(5, 60)) => {
    const name = `${pick(SUR)} ${pick(GIV)}`, id = `${name.toLowerCase().replace(' ', '_')}_${p.id.slice(4)}_${seq++}`;
    const d: NPCData = { id, name, age: ri(18, 58), role, faction, home: p.id, realm: Math.max(0, Math.min(7, realm)), progress: 0, talent: rr(0.8, 1.25), silver, traits: traits(bias), bonds: [] };
    w.addNpc(World.spawn(d));
    return w.npcs[id];
  };
  const bond = (a: { bonds: NPCData['bonds']; id: string }, b: { bonds: NPCData['bonds']; id: string }, type: 'family' | 'sworn' | 'friend' | 'spouse') => { a.bonds.push({ other: b.id, type }); b.bonds.push({ other: a.id, type }); };
  const teach = (master: { bonds: NPCData['bonds']; id: string }, student: { bonds: NPCData['bonds']; id: string }) => { student.bonds.push({ other: master.id, type: 'master' }); master.bonds.push({ other: student.id, type: 'student' }); };
  const newFactions: Faction[] = [];
  const household = (p: Poi, roleA: Role = 'farmer', roleB: Role = 'farmer') => {
    const a = person(p, roleA, null, ri(0, 1) && roleA !== 'farmer' ? 1 : 0, {}, ri(2, 30)), b = person(p, roleB, null, 0, {}, ri(2, 20));
    b.age = Math.max(18, Math.min(60, a.age + ri(-6, 6)));
    bond(a, b, 'spouse');
    const kids: typeof a[] = [], maxAge = Math.min(15, Math.min(a.age, b.age) - 17);
    if (maxAge >= 1 && r() < 0.75) for (let k = ri(1, 3); k > 0; k--) {                          // bolalar: 16 yoshda kasb tanlaydi
      const c = person(p, 'child', null, 0, {}, 0); c.age = ri(1, maxAge);
      bond(a, c, 'family'); bond(b, c, 'family'); for (const sb of kids) bond(sb, c, 'family'); kids.push(c);
    }
    if (a.age < 40 && r() < 0.3) { const g = person(p, 'farmer', null, 0, {}, ri(5, 40)); g.age = Math.min(75, a.age + ri(20, 30)); bond(g, a, 'family'); for (const c of kids) bond(g, c, 'family'); }
    return a;
  };

  for (const p of g.pois) {
    const lift = Math.floor(p.tier / 2);                               // uzoq hududlarda odamlar kuchliroq
    if (p.kind === 'town') {
      const fid = guardId(p), town = p.name.split(' ')[0];
      const cap = person(p, 'guard_captain', fid, 2 + lift + ri(0, 1), { honor: rr(0.5, 0.95), courage: rr(0.6, 0.95) });
      const mag = person(p, 'magistrate', fid, 1 + ri(0, 1), {}, ri(80, 200));
      for (let k = 0; k < 7; k++) person(p, 'guard', fid, 1 + lift + ri(0, 1), { courage: rr(0.4, 0.9) });
      for (const role of ['merchant', 'merchant', 'merchant', 'innkeeper', 'innkeeper', 'blacksmith', 'blacksmith', 'doctor', 'doctor'] as Role[]) person(p, role, null, ri(0, 1));
      const urban: Role[] = ['farmer', 'merchant', 'blacksmith', 'innkeeper'];
      let prevHead: ReturnType<typeof household> | null = null;
      for (let k = ri(8, 10); k > 0; k--) { const head = household(p, pick(urban)); if (prevHead && r() < 0.25) bond(prevHead, head, 'family'); prevHead = head; }
      for (let k = ri(1, 3); k > 0; k--) person(p, 'wanderer', null, ri(0, 2) + lift);
      newFactions.push({ id: fid, name: `${town} qo'riqchilari`, ideology: 'neutral', base: p.id, leader: mag.id, silver: 500 + 100 * p.tier, tension: {}, cohesion: 0.7, active: true, lastOpDay: -10 });
      void cap;
    } else if (p.kind === 'village') {
      let prevHead: ReturnType<typeof household> | null = null;
      for (let k = ri(5, 7); k > 0; k--) { const head = household(p); if (prevHead && r() < 0.35) bond(prevHead, head, 'family'); prevHead = head; }   // qo'shni oilalar ko'pincha qarindosh
      if (r() < 0.75) person(p, 'merchant', null, 0, {}, ri(30, 90));
      if (r() < 0.6) person(p, 'innkeeper', null, 0);
      if (r() < 0.5) person(p, 'doctor', null, ri(0, 1));
      if (r() < 0.35) person(p, 'blacksmith', null, ri(0, 1));
      for (let k = ri(0, 2); k > 0; k--) person(p, 'wanderer', null, ri(0, 2) + lift);
    } else if (p.kind === 'sect') {
      const fid = sectId(p), evil = !!p.evil, b: Partial<Traits> = evil ? { honor: rr(0.05, 0.4), temper: rr(0.4, 0.9), greed: rr(0.4, 0.9) } : { honor: rr(0.45, 0.95), discipline: rr(0.5, 0.95) };
      const leader = person(p, 'sect_leader', fid, 4 + lift + ri(0, 1), { ...b, ambition: rr(0.5, 0.9) }, ri(60, 160));
      const elders = [0, 1, 2].map(() => person(p, 'elder', fid, 3 + lift + ri(0, 1), b));
      const inner = Array.from({ length: ri(7, 9) }, () => person(p, 'inner_disciple', fid, 2 + Math.floor(lift / 2) + ri(0, 1), b));
      const outer = Array.from({ length: ri(14, 18) }, () => person(p, 'outer_disciple', fid, 1 + ri(0, 1), b));
      for (const e of elders) teach(leader, e);
      inner.forEach((s, k) => teach(elders[k % elders.length], s));
      outer.forEach((s, k) => teach(inner[k % inner.length], s));
      newFactions.push({ id: fid, name: p.name, ideology: evil ? 'demonic' : 'righteous', base: p.id, leader: leader.id, silver: 800 + 150 * p.tier, tension: {}, cohesion: 0.8, active: true, lastOpDay: -10 });
    } else if (p.kind === 'hideout') {
      const fid = gangId(p);
      const chief = person(p, 'bandit_chief', fid, 3 + lift + ri(0, 1), { greed: rr(0.6, 0.95), honor: rr(0.05, 0.35), ambition: rr(0.6, 0.95), temper: rr(0.4, 0.9) }, ri(30, 90));
      const lt = person(p, 'bandit_lieutenant', fid, 2 + lift, { greed: rr(0.5, 0.9), honor: rr(0.1, 0.4) }), lt2 = person(p, 'bandit_lieutenant', fid, 1 + lift, { greed: rr(0.5, 0.9), honor: rr(0.1, 0.4) });
      bond(chief, lt, 'sworn'); bond(chief, lt2, 'sworn');
      for (let k = 0; k < 10 + ri(0, 3); k++) bond(chief, person(p, 'bandit', fid, 1 + Math.floor(lift / 2) + ri(0, 1), { greed: rr(0.5, 0.95), honor: rr(0.05, 0.45) }), 'sworn');
      newFactions.push({ id: fid, name: `${p.name.split(' ')[0]} to'dasi`, ideology: 'demonic', base: p.id, leader: chief.id, silver: 150 + 40 * p.tier, tension: {}, cohesion: 0.65, active: true, lastOpDay: -10 });
    }
  }
  // Zohid ustozlar: ikkita ibodatxonada (ustoz izlovchilar uzoq safarga chiqadi)
  const shrines = g.pois.filter(p => p.kind === 'shrine'); for (let k = shrines.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [shrines[k], shrines[j]] = [shrines[j], shrines[k]]; }
  for (const s of shrines.slice(0, 2)) person(s, 'hermit', null, 6 + Math.floor(s.tier / 3), { honor: rr(0.6, 0.95), discipline: rr(0.7, 1) }, ri(0, 10)).age = ri(70, 110);
  // Taranglik: yaqin qo'riqchilar va to'dalar bir-birini yomon ko'radi
  for (const f of newFactions) w.factions[f.id] = f;
  for (const a of newFactions) for (const b of newFactions) {
    if (a.id >= b.id || (a.ideology === b.ideology && a.ideology !== 'righteous')) continue;
    const h = w.hoursTo(a.base, b.base);
    if (h <= 60 && (a.ideology === 'demonic' || b.ideology === 'demonic')) { const v = Math.round(25 + 20 * (1 - h / 60)); a.tension[b.id] = v; b.tension[a.id] = v; }
    else if (h <= 48 && a.ideology === 'righteous' && b.ideology === 'righteous') { const v = Math.round(10 + 55 * r()); a.tension[b.id] = v; b.tension[a.id] = v; }   // sektalar tarixi
  }
  // Yadro hududi (qo'lda yozilgan NPC'lar) ham oilali bo'lsin: turmush qurmagan hunarmand/dehqonlar juftlanadi, bolalar qo'shiladi
  for (const id of w.settlements().filter(x => !x.startsWith('poi_'))) {
    const p = { id, tier: 0 } as unknown as Poi;
    const civ = w.alive().filter(n => n.home === id && !n.faction && ['farmer', 'merchant', 'innkeeper', 'doctor', 'blacksmith'].includes(n.role) && !n.bonds.some(b => b.type === 'spouse'));
    for (let i = 0; i + 1 < civ.length; i += 2) {
      const a = civ[i], b = civ[i + 1];
      if (Math.abs(a.age - b.age) > 15 || a.bonds.some(x => x.other === b.id)) continue;
      bond(a, b, 'spouse');
      const maxAge = Math.min(15, Math.min(a.age, b.age) - 17), kids: typeof a[] = [];
      if (maxAge >= 1) for (let k = ri(0, 2); k > 0; k--) { const c = person(p, 'child', null, 0, {}, 0); c.age = ri(1, maxAge); bond(a, c, 'family'); bond(b, c, 'family'); for (const sb of kids) bond(sb, c, 'family'); kids.push(c); }
    }
  }
  w.popCap = Math.round(w.alive().length * 1.3);   // yuqori chegara (unumdorlik uchun); asosiy cheklov — joylar sig'imi (settlement.ts)
}
