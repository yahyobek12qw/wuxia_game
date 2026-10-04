// Inventar, jihozlar, alkimyo/temirchilik retseptlari va bozor.
import { repAt } from '../sim/law.js';
import { settlementOf, type Good } from '../sim/settlement.js';
import type { Game, ActResult } from './game.js';
import { T } from './terrain.js';
import { threshold } from '../sim/npcAI.js';

export type ItemKind = 'mat' | 'pill' | 'weapon' | 'armor' | 'charm' | 'manual';
export type Slot = 'weapon' | 'armor' | 'charm';
export interface Stats { atk?: number; def?: number; vit?: number; focus?: number; energy?: number }
export interface ItemDef { name: string; kind: ItemKind; desc: string; sell: number; buy?: number; stats?: Stats; icon: string }

export const ITEMS: Record<string, ItemDef> = {
  herb: { name: "Shifobaxsh o't", kind: 'mat', desc: "Jarohatni davolaydi; dorilar uchun asosiy xom ashyo.", sell: 6, buy: 10, icon: '🌿' },
  ore: { name: 'Temir ruda', kind: 'mat', desc: "Tog'larda topiladi; qurol va zirh uchun.", sell: 9, buy: 14, icon: '⛏' },
  pelt: { name: 'Hayvon terisi', kind: 'mat', desc: "Bo'ri va to'ng'izlardan. Zirh uchun.", sell: 7, buy: 12, icon: '🟫' },
  bone: { name: "Yo'lbars suyagi", kind: 'mat', desc: 'Kuch dorisining asosi.', sell: 25, icon: '🦴' },
  spirit_herb: { name: "Ruh o'ti", kind: 'mat', desc: "Qi zich joylarda kamdan-kam o'sadi.", sell: 30, icon: '🍀' },
  crystal: { name: 'Qi kristali', kind: 'mat', desc: "Tog' bag'rida qotgan qi. Kuchli buyumlar uchun.", sell: 40, icon: '💎' },
  heal_pill: { name: 'Shifo dorisi', kind: 'pill', desc: 'Jarohatning katta qismini davolaydi.', sell: 20, buy: 45, icon: '💊' },
  qi_pill: { name: 'Qi dorisi', kind: 'pill', desc: "Energy va Focus'ni to'liq tiklaydi.", sell: 25, buy: 55, icon: '🔵' },
  power_pill: { name: 'Kuch dorisi', kind: 'pill', desc: "Keyingi 3 jangda hujum +25%.", sell: 40, icon: '🔴' },
  break_pill: { name: 'Yutuq dorisi', kind: 'pill', desc: "Keyingi yutuq urinishiga +25% imkoniyat va tajriba.", sell: 80, icon: '🟡' },
  iron_sword: { name: 'Temir qilich', kind: 'weapon', desc: 'Oddiy, ishonchli tig\'.', sell: 30, stats: { atk: 4 }, icon: '🗡' },
  steel_sword: { name: "Po'lat qilich", kind: 'weapon', desc: "Qi kristali bilan toblangan.", sell: 90, stats: { atk: 9 }, icon: '⚔' },
  spirit_sword: { name: 'Ruh qilichi', kind: 'weapon', desc: "Tig'ida qi oqadi.", sell: 260, stats: { atk: 16, focus: 15 }, icon: '✨' },
  pelt_armor: { name: 'Teri zirh', kind: 'armor', desc: 'Yengil va epchil.', sell: 25, stats: { def: 0.06, vit: 15 }, icon: '🥋' },
  iron_armor: { name: 'Temir zirh', kind: 'armor', desc: "Og'ir, lekin mustahkam.", sell: 80, stats: { def: 0.1, vit: 30 }, icon: '🛡' },
  jade_charm: { name: 'Nefrit tumor', kind: 'charm', desc: 'Fikrni tiniqlashtiradi.', sell: 45, stats: { focus: 20, energy: 10 }, icon: '🧿' },
  manual_combat: { name: "Jang san'ati risolasi", kind: 'manual', desc: "O'qisangiz: +1 ko'nikma ochkosi.", sell: 40, icon: '📕' },
  manual_qi: { name: 'Qi yuritish risolasi', kind: 'manual', desc: "O'qisangiz: joriy bosqich tajribasining 25% i.", sell: 30, icon: '📘' },
  manual_ancient: { name: 'Qadimiy usul risolasi', kind: 'manual', desc: "Noyob: +2 ko'nikma ochkosi.", sell: 110, icon: '📜' },
};

export interface Recipe { id: string; out: string; n: number; needs: Record<string, number>; silver: number; hours: number; station: 'alchemy' | 'forge'; minRealm: number }
export const RECIPES: Recipe[] = [
  { id: 'heal_pill', out: 'heal_pill', n: 1, needs: { herb: 2 }, silver: 0, hours: 3, station: 'alchemy', minRealm: 0 },
  { id: 'qi_pill', out: 'qi_pill', n: 1, needs: { herb: 1, spirit_herb: 1 }, silver: 0, hours: 3, station: 'alchemy', minRealm: 1 },
  { id: 'power_pill', out: 'power_pill', n: 1, needs: { herb: 2, bone: 1 }, silver: 0, hours: 4, station: 'alchemy', minRealm: 1 },
  { id: 'break_pill', out: 'break_pill', n: 1, needs: { herb: 3, spirit_herb: 2, crystal: 1 }, silver: 0, hours: 6, station: 'alchemy', minRealm: 1 },
  { id: 'iron_sword', out: 'iron_sword', n: 1, needs: { ore: 3 }, silver: 20, hours: 4, station: 'forge', minRealm: 0 },
  { id: 'pelt_armor', out: 'pelt_armor', n: 1, needs: { pelt: 3 }, silver: 10, hours: 4, station: 'forge', minRealm: 0 },
  { id: 'jade_charm', out: 'jade_charm', n: 1, needs: { crystal: 1 }, silver: 30, hours: 4, station: 'forge', minRealm: 1 },
  { id: 'steel_sword', out: 'steel_sword', n: 1, needs: { ore: 6, crystal: 1 }, silver: 60, hours: 6, station: 'forge', minRealm: 2 },
  { id: 'iron_armor', out: 'iron_armor', n: 1, needs: { ore: 5, pelt: 2 }, silver: 40, hours: 6, station: 'forge', minRealm: 2 },
  { id: 'spirit_sword', out: 'spirit_sword', n: 1, needs: { ore: 4, crystal: 2, spirit_herb: 2 }, silver: 150, hours: 8, station: 'forge', minRealm: 3 },
];
const SHOP: Record<string, string[]> = { village: ['herb', 'pelt'], city: ['herb', 'ore', 'pelt', 'heal_pill', 'qi_pill'] };
const ALCHEMY_COST = { energy: 6, focus: 10 };

export const alchemyChance = (realm: number) => Math.min(0.95, 0.6 + 0.08 * realm);

export class Inventory {
  items: Record<string, number> = {};
  equip: Partial<Record<Slot, string>> = {};
  buffs: { power?: number; breakthrough?: boolean } = {};

  toJSON() { return { items: this.items, equip: this.equip, buffs: this.buffs }; }
  static from(o: Partial<ReturnType<Inventory['toJSON']>> | null | undefined): Inventory {
    const inv = new Inventory();
    if (o) { inv.items = { ...(o.items ?? {}) }; inv.equip = { ...(o.equip ?? {}) }; inv.buffs = { ...(o.buffs ?? {}) }; }
    return inv;
  }

  count(id: string): number { return this.items[id] ?? 0; }
  add(id: string, n = 1): void { this.items[id] = this.count(id) + n; if (this.items[id] <= 0) delete this.items[id]; }
  has(needs: Record<string, number>): boolean { return Object.entries(needs).every(([id, n]) => this.count(id) >= n); }
  take(needs: Record<string, number>): void { for (const [id, n] of Object.entries(needs)) this.add(id, -n); }
  bonus(k: keyof Stats): number { let s = 0; for (const id of Object.values(this.equip)) if (id) s += ITEMS[id]?.stats?.[k] ?? 0; return s; }
}

// ---------- Joy tekshiruvlari ----------
function placeKind(g: Game): string | null {
  const poi = g.poiHere(); if (poi?.market) return poi.kind === 'town' ? 'city' : 'village';
  const loc = g.grid.loc[g.i];
  return loc && g.grid.t[g.i] === T.PLACE ? g.w.locations[loc]?.kind ?? null : null;
}
/** Temirxona: shu shaharda yashaydigan tirik temirchi bo'lishi kerak (sim'da o'lsa — temirchilik yo'q). */
function smith(g: Game): { ok: boolean; why: string } {
  const loc = g.grid.loc[g.i];
  if (!loc || g.grid.t[g.i] !== T.PLACE) return { ok: false, why: 'Temirxona faqat shaharda.' };
  const s = g.w.alive().find(n => n.role === 'blacksmith' && n.home === loc);
  if (s) return { ok: true, why: `Temirchi: ${s.name}` };
  const dead = Object.values(g.w.npcs).find(n => n.role === 'blacksmith' && n.home === loc && !n.alive);
  return { ok: false, why: dead ? `Temirchi ${dead.name} halok bo'lgan. Temirxona yopiq.` : "Bu yerda temirchi yo'q." };
}

// ---------- Harakatlar ----------
export function craft(g: Game, rid: string): ActResult {
  const r = RECIPES.find(x => x.id === rid); if (!r) return { ok: false, msg: "Noma'lum retsept." };
  const inv = g.inv, out = ITEMS[r.out];
  if (g.p.realm < r.minRealm) return { ok: false, msg: `${r.minRealm}-bosqich kerak.` };
  if (!inv.has(r.needs)) return { ok: false, msg: 'Xom ashyo yetmaydi.' };
  if (g.p.silver < r.silver) return { ok: false, msg: `${r.silver} kumush kerak.` };
  if (r.station === 'forge') { const s = smith(g); if (!s.ok) return { ok: false, msg: s.why }; }
  else if (g.energy < ALCHEMY_COST.energy || g.focus < ALCHEMY_COST.focus) return { ok: false, msg: 'Alkimyo uchun diqqat yetmaydi. Dam oling.' };
  inv.take(r.needs); g.p.silver -= r.silver;
  if (r.station === 'alchemy') { g.energy -= ALCHEMY_COST.energy; g.focus -= ALCHEMY_COST.focus; }
  g.run(r.hours);
  if (r.station === 'alchemy' && !g.w.rng.get('player').chance(alchemyChance(g.p.realm))) {
    g.say(`Alkimyo muvaffaqiyatsiz: ${out.name} kuyib ketdi. Xom ashyo yo'qoldi.`, 'bad');
    return { ok: true, msg: '' };
  }
  inv.add(r.out, r.n);
  g.say(r.station === 'forge' ? `Temirchi ${out.name} yasab berdi.` : `${out.name} tayyor bo'ldi.`, 'good');
  return { ok: true, msg: '' };
}

export function useItem(g: Game, id: string): ActResult {
  const def = ITEMS[id], inv = g.inv;
  if (!def || inv.count(id) < 1) return { ok: false, msg: "Bunday buyum yo'q." };
  if (def.kind === 'manual') {
    inv.add(id, -1);
    if (id === 'manual_qi') { const gain = Math.round(threshold(g.p.realm) * 0.25); g.p.progress += gain; g.say(`${def.name} o'qildi: +${gain} tajriba.`, 'good'); }
    else { const n = id === 'manual_ancient' ? 2 : 1; g.sp += n; g.say(`${def.name} o'qildi: +${n} ko'nikma ochkosi (K).`, 'good'); }
    g.run(3);
    return { ok: true, msg: '' };
  }
  if (def.kind !== 'pill' && id !== 'herb') return { ok: false, msg: "Bu buyumni ishlatib bo'lmaydi." };
  if (id === 'herb') return g.useHerb();
  const p = g.p;
  if (id === 'heal_pill') { if (p.injury <= 0) return { ok: false, msg: "Siz sog'lomsiz." }; p.injury = Math.max(0, p.injury - 0.6); }
  else if (id === 'qi_pill') { g.energy = g.energyMax; g.focus = g.focusMax; }
  else if (id === 'power_pill') inv.buffs.power = 3;
  else if (id === 'break_pill') { if (inv.buffs.breakthrough) return { ok: false, msg: 'Yutuq dorisi allaqachon ta\'sir qilmoqda.' }; inv.buffs.breakthrough = true; p.progress += Math.round(threshold(p.realm) * 0.15); }
  inv.add(id, -1);
  g.say(`${def.name} ichildi.${id === 'power_pill' ? ' Keyingi 3 jangda kuchliroqsiz.' : id === 'break_pill' ? ' Keyingi yutuq urinishi kuchliroq bo\'ladi.' : ''}`, 'good');
  return { ok: true, msg: '' };
}

export function equipItem(g: Game, id: string): ActResult {
  const def = ITEMS[id], inv = g.inv;
  if (!def || inv.count(id) < 1) return { ok: false, msg: "Bunday buyum yo'q." };
  if (def.kind !== 'weapon' && def.kind !== 'armor' && def.kind !== 'charm') return { ok: false, msg: "Bu buyum kiyilmaydi." };
  const slot = def.kind as Slot, prev = inv.equip[slot];
  const ratio = 1 - g.p.injury;   // vitality ulushi saqlanadi
  if (prev) inv.add(prev, 1);
  inv.add(id, -1); inv.equip[slot] = id;
  g.energy = Math.min(g.energy, g.energyMax); g.focus = Math.min(g.focus, g.focusMax); g.p.injury = 1 - ratio;
  g.say(`${def.name} kiyildi.`, 'info');
  return { ok: true, msg: '' };
}
export function unequip(g: Game, slot: string): ActResult {
  const inv = g.inv, id = inv.equip[slot as Slot];
  if (!id) return { ok: false, msg: "Bu joy bo'sh." };
  inv.add(id, 1); delete inv.equip[slot as Slot];
  g.energy = Math.min(g.energy, g.energyMax); g.focus = Math.min(g.focus, g.focusMax);
  g.say(`${ITEMS[id].name} yechildi.`, 'info');
  return { ok: true, msg: '' };
}

// Bozor narxi joy iqtisodiga bog'liq (taqchil tovar qimmat, urushda qurol qimmat, farovon shaharda noyob buyum qimmat)
const GOOD_OF = (id: string): Good => { const k = ITEMS[id]?.kind; return id === 'ore' ? 'iron' : id === 'pelt' || id === 'bone' ? 'cloth' : id === 'herb' || k === 'pill' ? 'medicine'
  : k === 'weapon' || k === 'armor' ? 'weapon' : 'luxury'; };
export function priceMult(g: Game, id: string): number { const s = settlementOf(g.w, g.poiHere()?.id); return s ? s.prices[GOOD_OF(id)] : 1; }
// Obro': qahramonga chegirma (−10%), yomon otliqqa ustama (+10%)
const repK = (g: Game) => { const id = g.poiHere()?.id; return id ? g.w.perHour(`rep:${id}`, () => repAt(g.w, id).score) / 100 : 0; };
const buyPrice = (g: Game, id: string) => Math.round((ITEMS[id].buy ?? 0) * priceMult(g, id) * (1 - 0.1 * repK(g)));
const sellPrice = (g: Game, id: string) => Math.max(1, Math.round(ITEMS[id].sell * (placeKind(g) === 'city' ? 1.3 : 1) * priceMult(g, id) * (1 + 0.08 * repK(g))));
export function buy(g: Game, id: string): ActResult {
  const k = placeKind(g), def = ITEMS[id];
  if (!k || !SHOP[k]) return { ok: false, msg: "Bozor faqat qishloq va shaharda." };
  if (!def || !SHOP[k].includes(id) || !def.buy) return { ok: false, msg: "Bu yerda sotilmaydi." };
  const cost = buyPrice(g, id);
  if (g.p.silver < cost) return { ok: false, msg: 'Kumush yetmaydi.' };
  g.p.silver -= cost; g.inv.add(id, 1);
  g.say(`${def.name} sotib olindi (−${cost} kumush).`, 'info');
  return { ok: true, msg: '' };
}
export function sellItem(g: Game, id: string, n = 1): ActResult {
  const k = placeKind(g), def = ITEMS[id];
  if (k !== 'village' && k !== 'city') return { ok: false, msg: "Savdo faqat qishloq va shaharda." };
  const have = g.inv.count(id); n = Math.max(1, Math.min(n, have));
  if (!def || have < 1) return { ok: false, msg: "Bunday buyum yo'q." };
  const price = sellPrice(g, id) * n;
  g.inv.add(id, -n); g.p.silver += price;
  g.say(`${n} ta ${def.name} sotildi (+${price} kumush).`, 'good');
  return { ok: true, msg: '' };
}

// ---------- O'ljalar ----------
/** G'alabadan keyin hayvonlardan tushadigan xom ashyo. */
export function beastDrops(g: Game, types: string[], boss: boolean): Record<string, number> {
  const rng = g.w.rng.get('player'), out: Record<string, number> = {};
  const add = (id: string, n = 1) => { out[id] = (out[id] ?? 0) + n; };
  for (const t of types) {
    if ((t === 'wolf' || t === 'boar') && rng.chance(0.55)) add('pelt');
    if (t === 'tiger') { add('bone'); add('pelt'); }
    if (t === 'bandit' && rng.chance(0.15)) add('heal_pill');
  }
  if (boss) { add('spirit_herb', 2); add('crystal', 1); }
  for (const [id, n] of Object.entries(out)) g.inv.add(id, n);
  return out;
}
/** Tadqiqotda kamyob topilmalar (qi zich kataklarda). */
export function rareFinds(g: Game): string[] {
  const rng = g.w.rng.get('player'), i = g.i, qi = g.grid.qi[i], t = g.grid.t[i], found: string[] = [];
  if (qi >= 22 && (t === T.FOREST || t === T.MOUNTAIN) && rng.chance(0.08 + (qi - 22) * 0.005)) { g.inv.add('spirit_herb'); found.push(ITEMS.spirit_herb.name); }
  if (t === T.MOUNTAIN && qi >= 18 && rng.chance(0.06)) { g.inv.add('crystal'); found.push(ITEMS.crystal.name); }
  return found;
}

export function inventoryState(g: Game) {
  const inv = g.inv, k = placeKind(g), sm = smith(g);
  return {
    items: Object.entries(inv.items).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, ...ITEMS[id] })),
    equip: Object.fromEntries((['weapon', 'armor', 'charm'] as Slot[]).map(s => [s, inv.equip[s] ? { id: inv.equip[s], ...ITEMS[inv.equip[s]!] } : null])),
    buffs: inv.buffs,
    bonus: { atk: inv.bonus('atk'), def: inv.bonus('def'), vit: inv.bonus('vit'), focus: inv.bonus('focus'), energy: inv.bonus('energy') },
    recipes: RECIPES.map(r => ({ ...r, outName: ITEMS[r.out].name, icon: ITEMS[r.out].icon, desc: ITEMS[r.out].desc, stats: ITEMS[r.out].stats ?? null,
      needsNamed: Object.entries(r.needs).map(([id, n]) => ({ id, n, name: ITEMS[id].name, have: inv.count(id) })),
      can: g.p.realm >= r.minRealm && inv.has(r.needs) && g.p.silver >= r.silver && (r.station === 'alchemy' || sm.ok) })),
    alchemyChance: alchemyChance(g.p.realm), smith: sm,
    market: k && SHOP[k] ? { kind: k, sellMult: k === 'city' ? 1.3 : 1, buy: SHOP[k].map(id => ({ id, ...ITEMS[id], buy: buyPrice(g, id), m: priceMult(g, id) })),
      sell: Object.fromEntries(Object.keys(inv.items).filter(id => inv.items[id] > 0).map(id => [id, sellPrice(g, id)])) } : null,
  };
}
