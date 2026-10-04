// Joylar ichki xizmatlari: taverna (mish-mish), mehmonxona, savdo palatasi (haftalik noyob tovar),
// qo'llanmalar markazi (risolalar), teleport darvozasi. Joy turi va sim holatiga bog'liq (savdogar o'lsa — noyob savdo yo'q).
import { bountiesOn, clearBounties, fineFor, law, lawFaction, repAt } from '../sim/law.js';
import { ownerOf, terr } from '../sim/territory.js';
import { GOODS, GOOD_NAME, happiness, residentsOf, settlementOf } from '../sim/settlement.js';
import type { Game, ActResult } from './game.js';
import { ITEMS } from './items.js';
import { T, COLS, tileOf } from './terrain.js';

export type Service = 'tavern' | 'inn' | 'market' | 'forge' | 'library' | 'teleport' | 'hall';
const SERVICES: Record<string, Service[]> = {
  city: ['tavern', 'inn', 'market', 'forge', 'library', 'teleport', 'hall'],
  village: ['tavern', 'inn', 'market'],
  sect: ['library', 'teleport', 'hall'],
  camp: ['tavern', 'market', 'hall'],
};
const KIND_NAME: Record<string, string> = { city: 'Shahar', village: 'Qishloq', sect: 'Sekta', camp: 'Qaroqchilar uyasi' };
const RARE_POOL = ['spirit_herb', 'crystal', 'qi_pill', 'power_pill', 'break_pill', 'steel_sword', 'iron_armor', 'jade_charm', 'spirit_sword', 'manual_ancient'];
export const MANUALS = ['manual_combat', 'manual_qi', 'manual_ancient'];
const INN = { village: 10, city: 20, camp: 0, sect: 0 } as Record<string, number>;
const RUMOR_COST = 5;

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/** O'yinchi turgan aholi punkti/sekta (sim manzili) yoki null. */
export function placeHere(g: Game) {
  const loc = g.grid.loc[g.i];
  if (!loc || g.grid.t[g.i] !== T.PLACE) return null;
  const l = g.w.locations[loc];
  if (!l || !SERVICES[l.kind]) return null;
  return { id: l.id, name: l.name, kind: l.kind, tier: tierOf(g, loc) };
}
function tierOf(g: Game, loc: string): number {
  const p = g.grid.pois.find(x => x.id === loc); if (p) return p.tier;
  const l = g.w.locations[loc]; if (l?.x == null) return 1;
  const [c, r] = tileOf(l.x, l.y!); return Math.max(1, g.grid.regions[g.grid.region[r * COLS + c]].tier);
}
const week = (g: Game) => Math.floor(g.w.day / 7);

// ---------- Savdo palatasi: haftalik noyob tovar ----------
function rareSeller(g: Game, loc: string, kind: string): string | null {
  const people = g.w.alive().filter(n => n.home === loc);
  if (kind === 'camp') return people.find(n => n.role === 'bandit_chief' || n.role === 'bandit_lieutenant')?.name ?? null;   // qora bozor
  return people.find(n => n.role === 'merchant')?.name ?? null;
}
export function rareStock(g: Game) {
  const p = placeHere(g); if (!p || !SERVICES[p.kind].includes('market')) return null;
  const seller = rareSeller(g, p.id, p.kind);
  if (!seller) return { seller: null, items: [] as { id: string; price: number; left: number }[], refreshIn: 7 - (g.w.day % 7) };
  const r = rnd(hashStr(`${g.seed}:${p.id}:${week(g)}`));
  const pool = RARE_POOL.filter(id => id !== 'spirit_sword' || p.tier >= 4).filter(id => id !== 'manual_ancient' || p.kind === 'city');
  const n = p.kind === 'city' ? 4 : p.kind === 'camp' ? 3 : 2;
  const items: { id: string; price: number; left: number }[] = [];
  for (let k = 0; k < n && pool.length; k++) {
    const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const price = Math.round(ITEMS[id].sell * 2.2 * (1 + 0.06 * p.tier) * (p.kind === 'camp' ? 0.85 : 1));
    const qty = 1 + Math.floor(r() * 3), key = `${p.id}:${week(g)}:${id}`;
    items.push({ id, price, left: Math.max(0, qty - (g.placeBought[key] ?? 0)) });
  }
  return { seller, items, refreshIn: 7 - (g.w.day % 7) };
}
export function buyRare(g: Game, id: string): ActResult {
  const st = rareStock(g); if (!st?.seller) return { ok: false, msg: "Bu yerda noyob savdo yo'q." };
  const it = st.items.find(x => x.id === id); if (!it || it.left < 1) return { ok: false, msg: 'Bu tovar tugagan.' };
  if (g.p.silver < it.price) return { ok: false, msg: 'Kumush yetmaydi.' };
  const p = placeHere(g)!, key = `${p.id}:${week(g)}:${id}`;
  g.p.silver -= it.price; g.inv.add(id, 1); g.placeBought[key] = (g.placeBought[key] ?? 0) + 1;
  g.say(`${st.seller}dan ${ITEMS[id].name} sotib oldingiz (−${it.price} kumush).`, 'good');
  return { ok: true, msg: '' };
}

// ---------- Qo'llanmalar markazi ----------
export function library(g: Game) {
  const p = placeHere(g); if (!p || !SERVICES[p.kind].includes('library')) return null;
  const member = g.p.faction && g.w.factions[g.p.faction]?.base === p.id;
  const disc = member ? 0.5 : 1;
  return MANUALS.filter(id => id !== 'manual_ancient' || p.tier >= 3 || p.kind === 'sect')
    .map(id => ({ id, name: ITEMS[id].name, desc: ITEMS[id].desc, price: Math.round(ITEMS[id].sell * 3 * (1 + 0.05 * p.tier) * disc), member: !!member }));
}
export function buyManual(g: Game, id: string): ActResult {
  const list = library(g); if (!list) return { ok: false, msg: "Bu yerda qo'llanmalar markazi yo'q." };
  const m = list.find(x => x.id === id); if (!m) return { ok: false, msg: "Bunday risola yo'q." };
  if (g.p.silver < m.price) return { ok: false, msg: 'Kumush yetmaydi.' };
  g.p.silver -= m.price; g.inv.add(id, 1);
  g.say(`${m.name} sotib olindi${m.member ? ' (sekta chegirmasi)' : ''}. Inventardan o'qing (I).`, 'good');
  return { ok: true, msg: '' };
}

// ---------- Taverna: mish-mish ----------
export function rumor(g: Game): ActResult {
  const p = placeHere(g); if (!p || !SERVICES[p.kind].includes('tavern')) return { ok: false, msg: "Bu yerda taverna yo'q." };
  if (g.p.silver < RUMOR_COST) return { ok: false, msg: 'Kumush yetmaydi.' };
  g.p.silver -= RUMOR_COST;
  g.run(1);
  const r = rnd(hashStr(`${g.seed}:${p.id}:${g.w.h}`));
  // Hali kashf etilmagan qiziqarli joy (yaqindan uzoqqa)
  const hidden = g.grid.pois.filter(x => !g.explored[x.ty * COLS + x.tx] && ['cave', 'ruin', 'sect', 'sect_ruin', 'shrine', 'town'].includes(x.kind))
    .map(x => ({ x, d: Math.hypot(x.tx - g.tx, x.ty - g.ty) })).filter(o => o.d < 160).sort((a, b) => a.d - b.d).slice(0, 8);
  if (hidden.length) {
    const { x } = hidden[Math.floor(r() * hidden.length)];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const c = x.tx + dc, rr = x.ty + dr; if (c >= 0 && rr >= 0 && c < g.grid.cols && rr < g.grid.rows) g.explored[rr * COLS + c] = 1; }
    const dir = (() => { const dx = x.tx - g.tx, dy = x.ty - g.ty; return `${dy < -5 ? 'shimol' : dy > 5 ? 'janub' : ''}${Math.abs(dy) > 5 && Math.abs(dx) > 5 ? '-' : ''}${dx > 5 ? 'sharq' : dx < -5 ? "g'arb" : ''}` || 'yaqin'; })();
    const hint = x.kind === 'cave' || x.kind === 'ruin' || x.kind === 'sect_ruin' ? " U yerda xazina va qo'riqchi bor emish." : x.kind === 'shrine' ? ' Qi juda zich joy.' : '';
    g.say(`Mish-mish: ${dir} tomonda «${x.name}» bor.${hint} (Xaritada belgilandi, M)`, 'good');
  } else g.say("Mish-mish: bugun hech kim yangi gap aytmadi.", 'info');
  // Mahalliy sir: shu yerdagi NPC eng muhim xotirasini aytadi
  const locals = g.w.alive().filter(n => n.home === p.id && !n.player && n.memories.length);
  if (locals.length) {
    const n = locals[Math.floor(r() * locals.length)], m = n.memories.slice().sort((a, b) => b.importance - a.importance)[0];
    if (m && m.subject !== 'unknown') g.say(`${n.name} pichirlaydi: ${g.w.nameOf(m.subject)} ${m.object ? g.w.nameOf(m.object) + 'ga ' : ''}nisbatan «${m.type}» — ${m.day}-kun.`, 'info');
  }
  return { ok: true, msg: '' };
}

// ---------- Mehmonxona ----------
export function innRest(g: Game): ActResult {
  const p = placeHere(g); if (!p || !SERVICES[p.kind].includes('inn')) return { ok: false, msg: "Bu yerda mehmonxona yo'q." };
  const cost = INN[p.kind] ?? 15;
  if (g.p.silver < cost) return { ok: false, msg: 'Kumush yetmaydi.' };
  const rep = repAt(g.w, p.id);
  if (rep.wanted || rep.score <= -45) return { ok: false, msg: 'Mehmonxonachi eshikni yopdi: «Sizga bu yerda joy yo\'q.»' };
  g.p.silver -= cost;
  g.run(8);
  g.energy = g.energyMax; g.focus = g.focusMax; g.p.injury = Math.max(0, g.p.injury - 0.3);
  g.say(`${p.name} mehmonxonasida tunadingiz (−${cost} kumush): kuch va diqqat to'liq tiklandi.`, 'good');
  return { ok: true, msg: '' };
}

// ---------- Teleport darvozasi ----------
/** Teleport nuqtalari: shaharlar va sektalar (yadro shahri va Qingyun ham). */
export function gates(g: Game) {
  const out: { id: string; name: string; kind: string; tx: number; ty: number }[] = [];
  for (const l of Object.values(g.w.locations)) {
    if (l.x == null || (l.kind !== 'city' && l.kind !== 'sect')) continue;
    const poi = g.grid.pois.find(p => p.id === l.id);
    const [tx, ty] = poi ? [poi.tx, poi.ty] : tileOf(l.x, l.y!);
    out.push({ id: l.id, name: l.name, kind: l.kind, tx, ty });
  }
  return out;
}
export function teleportTargets(g: Game) {
  const p = placeHere(g); if (!p || !SERVICES[p.kind].includes('teleport')) return null;
  return gates(g).filter(x => x.id !== p.id).map(x => {
    const d = Math.hypot(x.tx - g.tx, x.ty - g.ty);
    return { ...x, known: !!g.explored[x.ty * COLS + x.tx], cost: 10 + Math.round(d / 4), dist: Math.round(d) };
  }).sort((a, b) => a.dist - b.dist);
}
export function teleport(g: Game, id: string): ActResult {
  const list = teleportTargets(g); if (!list) return { ok: false, msg: "Bu yerda teleport darvozasi yo'q." };
  const t = list.find(x => x.id === id); if (!t) return { ok: false, msg: 'Bunday nuqta yo\'q.' };
  if (!t.known) return { ok: false, msg: "Bu joyni avval o'zingiz kashf eting (darvoza faqat ma'lum joylarga ochiladi)." };
  if (g.p.silver < t.cost) return { ok: false, msg: 'Kumush yetmaydi.' };
  g.p.silver -= t.cost;
  g.teleportTo(t.tx, t.ty);
  g.say(`🌀 Teleport: ${t.name}ga yetib keldingiz (−${t.cost} kumush).`, 'good');
  return { ok: true, msg: '' };
}

// Joy holati: oziq, xavfsizlik, farovonlik, baxt va narxlar (taverna/bozorda ko'rinadi)
function settleView(g: Game, id: string) {
  const s = settlementOf(g.w, id); if (!s) return null;
  const residents = residentsOf(g.w, id);
  return { pop: s.pop, cap: s.cap, food: Math.round(s.food), security: Math.round(s.security), prosperity: Math.round(s.prosperity), happiness: happiness(s), famine: s.famine !== undefined,
    children: residents.filter(n => n.role === 'child').length, couples: Math.floor(residents.filter(n => n.bonds.some(b => b.type === 'spouse' && g.w.npcs[b.other]?.alive)).length / 2),
    prices: GOODS.map(k => ({ id: k, name: GOOD_NAME[k], m: s.prices[k] })) };
}
/** Jarimani to'lash: mahalliy qonun fraksiyasining qidiruvi bekor bo'ladi. */
export function payFine(g: Game): ActResult {
  const p = placeHere(g); if (!p) return { ok: false, msg: 'Bu yerda qonun idorasi yo\'q.' };
  const { issuer, amount } = fineFor(g.w, p.id);
  if (!issuer || !amount) return { ok: false, msg: 'Siz bu yerda qidiruvda emassiz.' };
  if (g.p.silver < amount) return { ok: false, msg: `Jarima ${amount} kumush — yetmaydi.` };
  g.p.silver -= amount; const f = g.w.factions[issuer]; if (f) f.silver += amount;
  clearBounties(g.w, 'player', issuer);
  g.say(`${g.w.nameOf(issuer)}ga ${amount} kumush jarima to'landi. Qidiruv bekor qilindi.`, 'good');
  return { ok: true, msg: '' };
}
// Qonun, obro', mukofotlar taxtasi va hudud egasi
function lawView(g: Game, id: string) {
  const w = g.w, lf = lawFaction(w, id), own = ownerOf(w, id), hold = terr(w).held[id];
  const board = law(w).bounties.filter(b => b.issuer === lf || b.loc === id).sort((a, b) => b.reward - a.reward).slice(0, 6).map(b => {
    const t = w.npcs[b.target];
    return { name: b.target === 'player' ? 'SIZ' : t.name, you: b.target === 'player', reward: b.reward, reason: b.reason, where: w.nameOf(w.nodeOf(t)), realm: t.realm, hunter: b.hunter && w.npcs[b.hunter]?.alive ? w.npcs[b.hunter].name : null };
  });
  return { rep: repAt(w, id), fine: fineFor(w, id).amount, lawName: lf ? w.nameOf(lf) : null, board,
    owner: own ? { name: own.name, evil: own.ideology === 'demonic', occupied: !!hold && own.ideology === 'demonic', since: hold?.since ?? null, prev: hold?.prev ? w.nameOf(hold.prev) : null, control: hold ? Math.round(hold.control) : null } : null };
}
export function placeState(g: Game) {
  const p = placeHere(g); if (!p) return null;
  const services = SERVICES[p.kind];
  return { ...p, kindName: KIND_NAME[p.kind], services, innCost: INN[p.kind] ?? 15, rumorCost: RUMOR_COST,
    rare: services.includes('market') ? rareStock(g) : null, library: library(g), teleport: teleportTargets(g),
    people: g.w.alive().filter(n => n.home === p.id && !n.player).length, settle: settleView(g, p.id), law: p.kind === 'city' || p.kind === 'village' ? lawView(g, p.id) : null };
}
