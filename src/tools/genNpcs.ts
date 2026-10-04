// 50 ta NPC'ni deterministik generatsiya qiladi: 10 ta qo'lda yozilgan muhim NPC + qolganlari.
import { writeFileSync } from 'node:fs';
import { Rng, hashString } from '../core/rng.js';
import type { NPCData, Traits, Role, BondType } from '../core/types.js';

const rng = new Rng(hashString('wuxia-npcs-v1'));
const SURNAMES = ['Li', 'Wang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Luo', 'Zheng', 'Liang', 'Xie', 'Song', 'Tang', 'Feng', 'Deng', 'Cao', 'Peng', 'Zeng', 'Xiao', 'Tian', 'Dong', 'Yuan', 'Cai', 'Jiang', 'Yu', 'Du', 'Ye', 'Cheng', 'Wei', 'Lu', 'Ding', 'Ren', 'Shen', 'Yao'];
const GIVEN = ['Ming', 'Jie', 'Lei', 'Yun', 'Hao', 'Xin', 'Feng', 'Long', 'Bo', 'Tao', 'Qiang', 'Hui', 'Lan', 'Mei', 'Ling', 'Xue', 'Jing', 'Ping', 'Rui', 'Shan', 'Ying', 'Zhen', 'Kai', 'Chao', 'Ning', 'Yan', 'Fei', 'Rong', 'Bin', 'Hong', 'Quan', 'Sheng', 'Wen', 'Jun'];
const used = new Set<string>();
const npcs: NPCData[] = [];

function name(): string {
  for (;;) {
    const n = `${rng.pick(SURNAMES)} ${rng.pick(GIVEN)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
}
const idOf = (n: string) => n.toLowerCase().replace(/ /g, '_');
const r2 = (x: number) => Math.round(x * 100) / 100;

function traits(bias: Partial<Traits> = {}): Traits {
  const t = {} as Traits;
  for (const k of ['ambition', 'loyalty', 'greed', 'courage', 'honor', 'curiosity', 'temper', 'discipline'] as const)
    t[k] = r2(bias[k] ?? rng.range(0.15, 0.85));
  return t;
}
function add(p: { id?: string; name?: string; age: number; role: Role; faction: string | null; home: string; realm: number; silver: number; traits: Traits; talent?: number }): NPCData {
  const nm = p.name ?? name();
  used.add(nm);
  const n: NPCData = {
    id: p.id ?? idOf(nm), name: nm, age: p.age, role: p.role, faction: p.faction, home: p.home,
    realm: p.realm, progress: r2(rng.range(0, 0.6)), talent: r2(p.talent ?? rng.range(0.8, 1.25)),
    silver: p.silver, traits: p.traits, bonds: [],
  };
  npcs.push(n);
  return n;
}
function bond(a: NPCData, b: NPCData, ab: BondType, ba: BondType) {
  a.bonds.push({ other: b.id, type: ab });
  b.bonds.push({ other: a.id, type: ba });
}

// --- Qingyun sektasi (20) ---
const mo = add({ id: 'mo_tianhe', name: 'Mo Tianhe', age: 81, role: 'sect_leader', faction: 'qingyun', home: 'qingyun_peak', realm: 5, silver: 500,
  traits: traits({ honor: 0.9, ambition: 0.2, discipline: 0.9, temper: 0.2, loyalty: 0.85, courage: 0.7, greed: 0.1, curiosity: 0.5 }) });
const han = add({ id: 'han_jue', name: 'Han Jue', age: 56, role: 'elder', faction: 'qingyun', home: 'qingyun_peak', realm: 4, silver: 300,
  traits: traits({ ambition: 0.9, honor: 0.3, greed: 0.5, temper: 0.5, discipline: 0.75, courage: 0.6, loyalty: 0.3, curiosity: 0.4 }) });
const su = add({ id: 'su_qinglan', name: 'Su Qinglan', age: 49, role: 'elder', faction: 'qingyun', home: 'qingyun_peak', realm: 4, silver: 200,
  traits: traits({ honor: 0.85, ambition: 0.55, loyalty: 0.9, discipline: 0.8, temper: 0.3, courage: 0.7, greed: 0.1, curiosity: 0.6 }) });
const fang = add({ id: 'fang_lu', name: 'Fang Lu', age: 63, role: 'elder', faction: 'qingyun', home: 'qingyun_peak', realm: 4, silver: 250,
  traits: traits({ ambition: 0.35, honor: 0.65, discipline: 0.7 }) });
for (const e of [han, su, fang]) bond(e, mo, 'master', 'student');

const zhangWei = add({ id: 'zhang_wei', name: 'Zhang Wei', age: 19, role: 'outer_disciple', faction: 'qingyun', home: 'qingyun_peak', realm: 2, silver: 15, talent: 1.2,
  traits: traits({ ambition: 0.75, loyalty: 0.8, temper: 0.25, discipline: 0.7, courage: 0.65, honor: 0.75, curiosity: 0.8, greed: 0.2 }) });
const gaoPeng = add({ id: 'gao_peng', name: 'Gao Peng', age: 21, role: 'outer_disciple', faction: 'qingyun', home: 'qingyun_peak', realm: 2, silver: 40,
  traits: traits({ ambition: 0.8, temper: 0.8, honor: 0.35, courage: 0.7, discipline: 0.5, loyalty: 0.5 }) });
bond(zhangWei, gaoPeng, 'rival', 'rival');

const elders = [han, su, fang];
const innerCount = [2, 2, 2], outerCount = [3, 3, 2];
const outers: NPCData[] = [zhangWei, gaoPeng];
const inners: NPCData[] = [];
elders.forEach((e, i) => {
  for (let k = 0; k < innerCount[i]; k++) {
    const d = add({ age: rng.int(22, 32), role: 'inner_disciple', faction: 'qingyun', home: 'qingyun_peak', realm: 3, silver: rng.int(20, 60), traits: traits() });
    bond(d, e, 'master', 'student'); inners.push(d);
  }
  for (let k = 0; k < outerCount[i]; k++) {
    const d = add({ age: rng.int(16, 22), role: 'outer_disciple', faction: 'qingyun', home: 'qingyun_peak', realm: rng.int(1, 2), silver: rng.int(5, 20), traits: traits() });
    bond(d, e, 'master', 'student'); outers.push(d);
  }
});
bond(zhangWei, su, 'master', 'student');
bond(gaoPeng, han, 'master', 'student');
bond(zhangWei, outers[2], 'friend', 'friend');

// --- Qora Shamol (12) ---
const lei = add({ id: 'lei_hu', name: 'Lei Hu', age: 41, role: 'bandit_chief', faction: 'black_wind', home: 'black_wind_camp', realm: 4, silver: 150,
  traits: traits({ greed: 0.85, temper: 0.8, honor: 0.15, ambition: 0.8, courage: 0.85, loyalty: 0.5, discipline: 0.4 }) });
for (let k = 0; k < 2; k++) {
  const l = add({ age: rng.int(28, 40), role: 'bandit_lieutenant', faction: 'black_wind', home: 'black_wind_camp', realm: 3, silver: rng.int(30, 80),
    traits: traits({ honor: r2(rng.range(0.1, 0.35)), greed: r2(rng.range(0.6, 0.9)), courage: r2(rng.range(0.6, 0.9)) }) });
  bond(l, lei, 'sworn', 'sworn');
}
for (let k = 0; k < 9; k++)
  add({ age: rng.int(18, 38), role: 'bandit', faction: 'black_wind', home: 'black_wind_camp', realm: rng.int(1, 2), silver: rng.int(2, 20),
    traits: traits({ honor: r2(rng.range(0.1, 0.45)), greed: r2(rng.range(0.5, 0.9)) }) });

// --- Imperator hokimiyati (6) ---
add({ id: 'zhou_pan', name: 'Zhou Pan', age: 52, role: 'magistrate', faction: 'imperial', home: 'river_city', realm: 0, silver: 900,
  traits: traits({ greed: 0.75, honor: 0.3, ambition: 0.6, courage: 0.3 }) });
const wen = add({ id: 'wen_bo', name: 'Wen Bo', age: 38, role: 'guard_captain', faction: 'imperial', home: 'river_city', realm: 3, silver: 120,
  traits: traits({ honor: 0.85, courage: 0.8, loyalty: 0.7, discipline: 0.8, greed: 0.2 }) });
for (let k = 0; k < 4; k++) {
  const g = add({ age: rng.int(20, 40), role: 'guard', faction: 'imperial', home: 'river_city', realm: rng.int(1, 2), silver: rng.int(10, 40), traits: traits() });
  bond(g, wen, 'master', 'student');
}

// --- Fuqarolar (12) ---
const lin = add({ id: 'lin_yue', name: 'Lin Yue', age: 24, role: 'innkeeper', faction: null, home: 'willow_village', realm: 0, silver: 180,
  traits: traits({ curiosity: 0.85, honor: 0.7, courage: 0.5, greed: 0.3 }) });
bond(lin, inners[4], 'lover', 'lover');
add({ id: 'bai_shu', name: 'Bai Shu', age: 58, role: 'doctor', faction: null, home: 'willow_village', realm: 0, silver: 140,
  traits: traits({ honor: 0.8, curiosity: 0.75, temper: 0.2 }) });
const zhangHua = add({ id: 'zhang_hua', name: 'Zhang Hua', age: 23, role: 'farmer', faction: null, home: 'willow_village', realm: 0, silver: 12,
  traits: traits({ courage: 0.55, honor: 0.75 }) });
bond(zhangWei, zhangHua, 'family', 'family');
for (let f = 0; f < 2; f++) {
  const a = add({ age: rng.int(30, 55), role: 'farmer', faction: null, home: 'willow_village', realm: 0, silver: rng.int(2, 15), traits: traits() });
  const b = add({ age: rng.int(16, 30), role: 'farmer', faction: null, home: 'willow_village', realm: 0, silver: rng.int(1, 8), traits: traits() });
  bond(a, b, 'family', 'family');
}
add({ age: 45, role: 'merchant', faction: null, home: 'willow_village', realm: 0, silver: 400, traits: traits({ greed: 0.7 }) });
add({ age: 39, role: 'merchant', faction: null, home: 'river_city', realm: 0, silver: 700, traits: traits({ greed: 0.75 }) });
add({ age: 47, role: 'blacksmith', faction: null, home: 'river_city', realm: 1, silver: 220, traits: traits({ discipline: 0.8 }) });
add({ age: 33, role: 'innkeeper', faction: null, home: 'river_city', realm: 0, silver: 260, traits: traits({ curiosity: 0.7 }) });
add({ id: 'gu_lao', name: 'Gu Lao', age: 97, role: 'hermit', faction: null, home: 'hidden_cave', realm: 6, silver: 0,
  traits: traits({ honor: 0.85, discipline: 1, curiosity: 0.3, ambition: 0.05, temper: 0.2, courage: 0.9, greed: 0.0, loyalty: 0.5 }) });

if (npcs.length !== 50) throw new Error(`NPC soni 50 emas: ${npcs.length}`);
writeFileSync(new URL('../../data/npcs.json', import.meta.url), JSON.stringify(npcs, null, 2));
console.log(`data/npcs.json: ${npcs.length} NPC yozildi`);
