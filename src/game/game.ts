// O'yinchi qatlami: o'yinchi sim ichidagi haqiqiy NPC; har harakat dunyo vaqtini oldinga suradi.
import { accuse, book, complete, openQuests } from '../sim/quests.js';
import { econ, residentsOf } from '../sim/settlement.js';
import { questView } from './questView.js';
import { AFF_NAME, CATALOG, initNpc, learn, techOf, type Affinity } from '../sim/cultivation.js';
import { basePower } from '../sim/combat.js';
import { applyTerritory } from '../sim/territory.js';
import { bountiesOn, clearBounties } from '../sim/law.js';
import { travelMult, season, SEASON_NAME, WEATHER_NAME, WEATHER_ICON } from '../sim/calendar.js';
import { goalText, mood } from '../sim/ambition.js';
import { World } from '../sim/world.js';
import { stepHour } from '../sim/sim.js';
import { line, TYPES } from '../sim/chronicle.js';
import { addMemory, gossip, witness, rel, MEMORY_DEFAULTS } from '../sim/memory.js';
import { kill } from '../sim/combat.js';
import { threshold } from '../sim/npcAI.js';
import type { Memory, NPC } from '../core/types.js';
import { npcPos, locPt } from '../viewer/geo.js';
import { Sect } from './sect.js';
import { placeState, rumor, innRest, buyRare, buyManual, teleport, payFine } from './places.js';
import { extendGeo, populate } from './worldgen.js';
import { Inventory, ITEMS, beastDrops, rareFinds, craft, useItem, equipItem, unequip, buy, sellItem, inventoryState } from './items.js';
import { buildGrid, tileOf, COLS, ROWS, TILE, T, MOVE_HOURS, TERRAIN_NAME, OX, OY, CORE_C, type Grid, type Poi, type PoiKind } from './terrain.js';

export const REALMS = ["Oddiy inson", 'Qi tozalash (I)', 'Qi tozalash (II)', 'Qi tozalash (III)', 'Poydevor (I)', 'Poydevor (II)', 'Oltin yadro (I)', 'Oltin yadro (II)', 'Yangi ruh'];
const VIS_R = 3.6;
const MEM_VERB: Record<string, string> = { mourned: 'uchun motam tutgan', saved_life: "hayotini saqlab qolgan", helped: 'yordam bergan', gift: 'sovg\'a bergan', taught: 'saboq bergan', insulted: 'haqorat qilgan',
  attacked: 'hujum qilgan', killed: "o'ldirgan", stole: "o'g'irlagan", betrayed: 'xiyonat qilgan', breakthrough: 'bosqichdan o\'tgan', promoted: "ko'tarilgan", bribed: 'pora bergan', raided: 'talon-taroj qilgan' };

export interface LogLine { day: number; hod: number; text: string; kind: 'info' | 'good' | 'bad' | 'alert' }
export interface EnemySpec { type: string; name: string; hp: number; dmg: number; spd: number }
export interface Encounter {
  id: number; kind: 'beast' | 'npc' | 'boss' | 'tournament'; title: string; terrain: number; npcId?: string; poi?: number; enemies: EnemySpec[]; arrest?: string;
  reward: { progress: number; silver: number; herb: number; ore: number };
  player?: { def: number; power: boolean; skills: Record<string, number>; vitMax: number; vit: number; energyMax: number; energy: number; focusMax: number; focus: number; realm: number; herbs: number; atk: number };
}
export const SKILL_NEED: Record<string, number> = { slash: 0, ball: 1, dash: 1, wind: 2, shield: 2, nova: 3, herb: 0 };
export const SKILL_MAX = 5;
export interface ActResult { ok: boolean; msg: string; enc?: Encounter }
export interface EncounterEnd { result: 'win' | 'lose' | 'flee'; hp: number; energy: number; focus: number; herbsUsed: number; spare?: boolean }
const BEAST: Record<string, { name: string; hp: number; dmg: number; spd: number }> = {
  wolf: { name: "Cho'l bo'risi", hp: 34, dmg: 7, spd: 150 }, boar: { name: "Yovvoyi to'ng'iz", hp: 68, dmg: 12, spd: 120 }, tiger: { name: "Yo'lbars", hp: 115, dmg: 17, spd: 135 },
  bandit: { name: 'Qaroqchi', hp: 55, dmg: 9, spd: 110 }, archer: { name: "Qaroqchi o'qchi", hp: 42, dmg: 8, spd: 100 }, treant: { name: 'Qadimiy Daraxt Ruhi', hp: 720, dmg: 26, spd: 45 },
  duelist: { name: "Yo'ldan ozgan shogird", hp: 60, dmg: 10, spd: 125 },
};
const POI_DESC: Record<PoiKind, string> = { town: 'bozor va temirxona bor.', village: 'bozor bor.', cave: "qorong'i g'or.", ruin: 'qadimiy xarobalar.',
  shrine: "qi zich ibodatxona: mashq ×1.5.", hideout: 'qaroqchilar uyasi!', sect_ruin: 'tashlandiq sekta.', sect: "tirik sekta — zalga kiring (G)." };

export class Game {
  w!: World; grid: Grid; seed: number;
  tx = 0; ty = 0;
  explored: Uint8Array = new Uint8Array(COLS * ROWS);
  vis = new Set<number>();
  herbTaken: Record<number, number> = {}; oreTaken: Record<number, number> = {};   // siyrak: faqat tadqiq qilingan kataklar
  cleared: number[] = []; lastRegion = -1; private lastPoiName = '';
  placeBought: Record<string, number> = {};   // haftalik noyob tovar xaridlari
  energy = 0; focus = 0;
  inv = new Inventory();
  // O't va ruda inventarda saqlanadi; eski kod uchun qulay nomlar
  get herb(): number { return this.inv.count('herb'); }
  set herb(v: number) { this.inv.items.herb = Math.max(0, v); if (!this.inv.items.herb) delete this.inv.items.herb; }
  get ore(): number { return this.inv.count('ore'); }
  set ore(v: number) { this.inv.items.ore = Math.max(0, v); if (!this.inv.items.ore) delete this.inv.items.ore; }
  log: LogLine[] = [];
  seenSeq = 0; over = false;
  enc: Encounter | null = null; encSeq = 0; lastEncH = -99; lastBossDay = -99;
  deepForest = new Set<number>();
  sp = 0; skillLv: Record<string, number> = {};
  sect = new Sect();

  constructor(seed: number) {
    this.seed = seed;
    const w = new World(seed);
    this.grid = buildGrid(w, seed); extendGeo(w, this.grid); populate(w, this.grid, seed);
    this.markDeepForest();
    this.setup(w);
  }

  // Qora o'rmon atrofi: qadimiy ruh yashaydigan joy
  private markDeepForest(): void {
    const g = this.grid; this.deepForest.clear();
    for (let k = 0; k < g.t.length; k++) if (g.loc[k] === 'black_forest') {
      const c = k % COLS, r = Math.floor(k / COLS);
      for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) { const nc = c + dc, nr = r + dr; if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && g.t[nr * COLS + nc] === T.FOREST) this.deepForest.add(nr * COLS + nc); }
    }
  }

  private setup(w: World): void {
    this.w = w;
    this.herbTaken = {}; this.oreTaken = {}; this.cleared = []; this.lastRegion = -1; this.lastPoiName = ''; this.placeBought = {};
    this.explored.fill(0); this.inv = new Inventory(); this.log = []; this.over = false; this.enc = null; this.lastEncH = -99; this.lastBossDay = -99; this.sp = 0; this.skillLv = {}; this.sect = new Sect();
    const base = World.spawn({ id: 'player', name: 'Sen', age: 18, role: 'wanderer', faction: null, home: 'willow_village', realm: 1, progress: 0, talent: 1.1, silver: 500,
      traits: { ambition: 0.6, loyalty: 0.5, greed: 0.4, courage: 0.6, honor: 0.6, curiosity: 0.7, temper: 0.4, discipline: 0.6 }, bonds: [] });
    w.addNpc({ ...base, player: true, dismissed: true, action: 'idle' });
    const [vx, vy] = locPt(w, 'willow_village');
    [this.tx, this.ty] = tileOf(vx, vy + TILE);        // qishloq yonidan boshlaydi
    this.syncLoc();
    this.energy = this.energyMax; this.focus = this.focusMax;
    this.reveal();
    this.seenSeq = w.seq;
    this.say("Sen Majnuntol qishlog'i yaqinida ko'zingni ochding. Dunyo seni kutmaydi, u o'zi yashaydi.", 'info');
  }

  reset(seed: number): void { this.seed = seed; const w = new World(seed); this.grid = buildGrid(w, seed); extendGeo(w, this.grid); populate(w, this.grid, seed); this.markDeepForest(); this.setup(w); }

  get p(): NPC { return this.w.npcs['player']; }
  get i(): number { return this.ty * COLS + this.tx; }
  get vitMax(): number { return 100 + 40 * this.p.realm + this.inv.bonus('vit'); }
  get energyMax(): number { return 80 + 10 * this.p.realm + this.inv.bonus('energy'); }
  get focusMax(): number { return 60 + 8 * this.p.realm + this.inv.bonus('focus'); }

  say(text: string, kind: LogLine['kind'] = 'info'): void {
    this.log.push({ day: this.w.day, hod: this.w.hod, text, kind });
    if (this.log.length > 120) this.log.shift();
  }
  private syncLoc(): void { this.p.location = this.grid.loc[this.i] ?? ''; this.w.dirty(); }

  // Ko'rinish: doira + qo'pol chekka; ko'rilgan kataklar eslab qolinadi
  private reveal(): void {
    this.vis.clear();
    const R = Math.ceil(VIS_R + 1);
    for (let r = this.ty - R; r <= this.ty + R; r++) for (let c = this.tx - R; c <= this.tx + R; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const noise = (((c * 73856093) ^ (r * 19349663)) >>> 0) % 100 / 100;
      if (Math.hypot(c - this.tx, r - this.ty) <= VIS_R - 0.5 + noise * 1.0) { this.vis.add(r * COLS + c); this.explored[r * COLS + c] = 1; }
    }
  }

  // ---- Vaqt: sim soatma-soat yuradi; o'yinchiga tegishli voqealar to'xtatadi ----
  run(hours: number, each?: () => void): number {
    let done = 0;
    for (let k = 0; k < hours && this.p.alive; k++) {
      const before = this.w.seq;
      stepHour(this.w); done++;
      each?.();
      if (this.w.events.some(e => e.seq > before && (e.subject === 'player' || e.object === 'player'))) break;
    }
    this.digest();
    return done;
  }
  private digest(): void {
    const near = (id: string) => { const [x, y] = locPt(this.w, id); const [c, r] = tileOf(x, y); return Math.hypot(c - this.tx, r - this.ty) <= 8; };
    for (const e of this.w.events) {
      if (e.seq <= this.seenSeq) continue;
      const text = line(this.w, e);
      const mine = e.subject === 'player' || e.object === 'player';
      if (text && (mine || (near(e.location) && ['death', 'raid', 'raid_repelled', 'ambush', 'ambush_start', 'raid_start', 'expedition_start', 'combat'].includes(e.type)))) {
        this.say(mine ? text : `Yaqinda: ${text}`, mine ? 'alert' : 'info');
      } else if (e.type === 'combat' && mine) this.say(`${this.w.nameOf(e.subject)} ${this.w.nameOf(e.object)}ga zarba berdi.`, 'alert');
    }
    const vend = !this.enc && this.p.alive ? this.w.events.find(e => e.seq > this.seenSeq && e.type === 'vendetta' && e.object === 'player') : undefined;
    const avenger = vend ? this.w.npc(vend.subject) : undefined;
    if (avenger?.alive) this.beginEnc({ kind: 'npc', title: `Qasoskor: ${avenger.name} (${this.w.nameOf(avenger.faction)})`, terrain: this.grid.t[this.i], npcId: avenger.id,
      enemies: [{ type: 'duelist', name: avenger.name, hp: 48 + 24 * avenger.realm, dmg: 8 + 3 * avenger.realm, spd: 130 }], reward: { progress: 20 + 15 * avenger.realm, silver: 0, herb: 0, ore: 0 } });
    this.seenSeq = this.w.seq;
    if (this.p.alive) this.sect.tick(this);
    if (!this.p.alive) { this.over = true; this.say("Sen halok bo'lding. Dunyo davom etadi…", 'bad'); }
  }

  private spend(energy: number, focus = 0): boolean {
    if (this.energy < energy || this.focus < focus) return false;
    this.energy -= energy; this.focus -= focus; return true;
  }
  private regen(rate = 0.4, frate = 1.2): void {
    this.energy = Math.min(this.energyMax, this.energy + rate);
    this.focus = Math.min(this.focusMax, this.focus + frate);
  }

  // ---- Harakatlar ----
  move(dx: number, dy: number): ActResult {
    if (this.over) return { ok: false, msg: "O'yin tugagan." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    const nx = this.tx + dx, ny = this.ty + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return { ok: false, msg: 'Dunyo chekkasi.' };
    const ni = ny * COLS + nx, t = this.grid.t[ni], hours = Math.max(1, Math.round(MOVE_HOURS[t] * travelMult(this.w)));   // ob-havo yo'lni sekinlashtiradi
    if (t === T.WATER) return { ok: false, msg: "Suvdan o'tib bo'lmaydi: ko'prik yoki qayiq kerak." };
    if (!this.spend(hours * 1.2)) return { ok: false, msg: 'Juda charchagansan. Dam ol (T) yoki mashq qil.' };
    this.tx = nx; this.ty = ny; this.syncLoc();
    this.run(hours, () => this.regen(0.15, 0.6));
    this.reveal();
    this.sect.onMove(this);
    const places = this.grid.loc[ni] && t === T.PLACE ? this.w.locations[this.grid.loc[ni]!].name : null;
    if (places && !this.lastPlace?.endsWith(places)) { this.say(`${places}ga yetib keldingiz.`, 'info'); }
    this.lastPlace = places ? `${this.w.day}:${places}` : undefined;
    const enc = this.p.alive ? (this.onEnterTile() ?? this.rollEncounter()) : null;
    this.lawCheck();
    return { ok: true, msg: '', enc: enc ?? undefined };
  }
  private lastPlace?: string;

  explore(): ActResult {
    if (this.over) return { ok: false, msg: "O'yin tugagan." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    const pk = this.grid.poi[this.i] - 1;
    if (pk >= 0 && this.grid.pois[pk].guardian && !this.cleared.includes(pk)) return { ok: true, msg: '', enc: this.guardianEnc(pk) };
    if (!this.spend(6, 4)) return { ok: false, msg: 'Tadqiq qilishga kuch yetmaydi.' };
    const i = this.i, rng = this.w.rng.get('player');
    this.run(2, () => this.regen(0, 0.3));
    const found: string[] = [];
    if (this.herbAt(i) > 0 && rng.chance(0.4 + 0.05 * this.p.realm)) { this.herbTaken[i] = (this.herbTaken[i] ?? 0) + 1; this.herb++; found.push("shifobaxsh o't"); }
    if (this.oreAt(i) > 0 && rng.chance(0.35)) { this.oreTaken[i] = (this.oreTaken[i] ?? 0) + 1; this.ore++; found.push('ruda'); }
    if (rng.chance(0.05)) { const s = rng.int(5, 40); this.p.silver += s; found.push(`${s} kumush`); }
    found.push(...rareFinds(this));
    this.say(found.length ? `Tadqiqot: ${found.join(', ')} topdingiz.` : "Tadqiqot: bu yerdan hech narsa topilmadi.", found.length ? 'good' : 'info');
    return { ok: true, msg: '' };
  }

  rest(hours = 4): ActResult {
    if (this.over) return { ok: false, msg: "O'yin tugagan." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    const done = this.run(hours, () => { this.regen(7, 6); this.p.injury = Math.max(0, this.p.injury - 0.012); });
    this.say(`${done} soat dam oldingiz.`, 'info');
    return { ok: true, msg: '' };
  }

  cultivate(hours = 4): ActResult {
    if (this.over) return { ok: false, msg: "O'yin tugagan." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    const qi = this.grid.qi[this.i], p = this.p, rng = this.w.rng.get('cultivation');
    let gained = 0, done = 0;
    for (let k = 0; k < hours; k++) {
      if (!this.spend(1.5, 3)) { if (k === 0) return { ok: false, msg: 'Diqqat yoki kuch yetmaydi. Dam oling.' }; break; }
      done += this.run(1);
      if (!p.alive) return { ok: true, msg: '' };
      const g = 0.45 * (0.5 + p.traits.discipline) * (qi / 10) * p.talent * (1 - p.injury) * this.sect.cultMult(this) * (this.poiHere()?.kind === 'shrine' ? 1.5 : 1); p.progress += g; gained += g;
      const th = threshold(p.realm);
      if (p.progress >= th && p.realm < 8) {
        const pr = 0.75 - 0.07 * p.realm + 0.15 * (p.traits.discipline - 0.5) - 0.3 * p.injury + (this.inv.buffs.breakthrough ? 0.25 : 0);
        delete this.inv.buffs.breakthrough;
        if (rng.chance(pr)) { p.realm++; p.progress = 0; this.sp++; this.say(`Yutuq! Siz «${REALMS[p.realm]}» bosqichiga ko'tarildingiz. +1 ko'nikma ochkosi (K).`, 'good'); this.w.emit({ type: 'breakthrough', location: p.location, subject: 'player', data: { realm: p.realm } }); }
        else { p.injury = Math.min(0.9, p.injury + 0.35); p.progress *= 0.6; this.say("Qi og'ishi! Yutuq muvaffaqiyatsiz, jarohat oldingiz.", 'bad'); this.w.emit({ type: 'qi_deviation', location: p.location, subject: 'player', data: { realm: p.realm } }); break; }
      }
    }
    if (done) this.say(`${done} soat mashq qildingiz (+${gained.toFixed(1)} tajriba, qi ${qi}).`, 'info');
    return { ok: true, msg: '' };
  }

  useHerb(): ActResult {
    if (this.herb < 1) return { ok: false, msg: "O't yo'q." };
    this.herb--; this.p.injury = Math.max(0, this.p.injury - 0.25); this.energy = Math.min(this.energyMax, this.energy + 20);
    this.say("Shifobaxsh o'tni iste'mol qildingiz: jarohat sog'aydi.", 'good');
    return { ok: true, msg: '' };
  }

  sell(): ActResult {
    const loc = this.grid.loc[this.i], k = loc ? this.w.locations[loc]?.kind : null;
    if (k !== 'village' && k !== 'city') return { ok: false, msg: 'Bu yerda savdo qilib bo\'lmaydi (qishloq yoki shahar kerak).' };
    const mult = k === 'city' ? 1.3 : 1, s = Math.round((this.herb * 6 + this.ore * 9) * mult);
    if (!s) return { ok: false, msg: "Sotadigan narsangiz yo'q." };
    this.p.silver += s; this.say(`${this.herb} o't va ${this.ore} rudani ${s} kumushga sotdingiz.`, 'good'); this.herb = 0; this.ore = 0;
    return { ok: true, msg: '' };
  }

  private near(id: string): NPC | null {
    const n = this.w.npc(id); if (!n?.alive || n.player) return null;
    const [x, y] = npcPos(this.w, n), [c, r] = tileOf(x, y);
    return Math.max(Math.abs(c - this.tx), Math.abs(r - this.ty)) <= 1 ? n : null;
  }
  /** NPC paneli: o'yinchi ko'ra oladigan narsalar (ko'rish doirasida). Maqsad va xarakter faqat ishonch qozonilgach ochiladi. */
  npcInfo(id: string) {
    const w = this.w, n = w.npc(id);
    if (!n?.alive || n.player) return null;
    initNpc(w, n);
    const [x, y] = npcPos(w, n), [c, r] = tileOf(x, y);
    if (!this.vis.has(r * COLS + c)) return null;
    const f = n.faction ? w.factions[n.faction] : undefined, rr = rel(n, 'player', w), md = mood(w, n);
    const known = rr.trust > 0.15 || rr.affection > 0.2 || n.memories.some(m => m.subject === 'player' && m.origin.startsWith('chat_'));
    const WORD: Record<string, string> = { ambition: 'shuhratparast', loyalty: 'sadoqatli', greed: "ochko'z", courage: 'jasur', honor: 'oliyjanob', curiosity: 'qiziquvchan', temper: 'jahldor', discipline: 'intizomli' };
    const traits = Object.entries(n.traits).filter(([, v]) => v > 0.6).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => WORD[k]);
    const label = rr.affection < -0.4 ? 'Nafratlanadi' : rr.fear > 0.4 ? "Qo'rqadi" : rr.trust > 0.5 && rr.affection > 0.3 ? "Yaqin do'st" : rr.trust > 0.25 ? 'Ishonadi'
      : rr.respect > 0.3 ? 'Hurmat qiladi' : rr.debt > 0.4 ? 'Sizdan qarzdor' : rr.affection < -0.15 ? 'Yoqtirmaydi' : 'Begona';
    const pc = (v: number) => Math.round(v * 100);
    const about = n.memories.filter(m => (m.subject === 'player' || m.object === 'player') && !m.origin.startsWith('chat_'))
      .sort((a, b) => b.importance - a.importance).slice(0, 5).map(m => ({ day: m.day, text: this.memText(m), harm: MEMORY_DEFAULTS[m.type].harm }));
    return {
      id: n.id, name: n.name, age: n.age, role: n.role, faction: f?.name ?? null, lead: !!f && f.leader === n.id, realm: n.realm, realmName: REALMS[n.realm],
      location: w.nameOf(w.nodeOf(n)), action: n.action, injury: n.injury, mood: md.label, moodV: Math.round(md.v * 100),
      rel: { trust: pc(rr.trust), respect: pc(rr.respect), affection: pc(Math.max(0, rr.affection)), hatred: pc(Math.max(0, -rr.affection)), fear: pc(rr.fear), debt: pc(rr.debt) }, relLabel: label,
      known, goals: known ? n.goals.map(g => goalText(w, g)) : null, traits: known ? traits : null,
      bonds: n.bonds.slice(0, 8).map(b => { const o = w.npcs[b.other]; const type = b.type !== 'family' || !o ? b.type : o.age >= n.age + 14 ? 'parent' : o.age + 14 <= n.age ? 'child' : 'sibling';
        return { type, name: w.nameOf(b.other), alive: !!o?.alive }; }),
      memories: about, adj: Math.max(Math.abs(c - this.tx), Math.abs(r - this.ty)) <= 1,
      wanted: bountiesOn(w, n.id).map(b => ({ reward: b.reward, reason: b.reason, by: w.nameOf(b.issuer) })),
      aff: known && n.aff ? AFF_NAME[n.aff as Affinity] : null, power: +basePower(n).toFixed(1),
      techs: (n.techs ?? []).map(id => techOf(w, id)).filter(Boolean).map(t => ({ name: t!.name, tier: t!.tier, secret: !!t!.secret })).filter(t => !t.secret || known),
    };
  }
  private memText(m: Memory): string {
    const w = this.w, s = m.subject === 'player' ? 'Sen' : w.nameOf(m.subject), o = m.object === 'player' ? 'seni' : m.object ? w.nameOf(m.object) : '';
    return `${s}${o ? ' ' + o + 'ni' : ''} ${MEM_VERB[m.type] ?? m.type}${m.source === 'heard' ? ' (mish-mish)' : ''}`;
  }

  talk(id: string): ActResult {
    const n = this.near(id); if (!n) return { ok: false, msg: 'U yetarlicha yaqin emas (qo\'shni katak).' };
    if (!this.spend(2, 2)) return { ok: false, msg: 'Charchagansiz.' };
    const p = this.p, before = new Set(p.memories.map(m => m.id));
    gossip(this.w, n, p);
    this.run(1, () => this.regen(0, 0.3));
    addMemory(this.w, n, { type: 'helped', subject: 'player', object: n.id, day: this.w.day, location: n.location, source: 'witnessed', confidence: 0.6, importance: 0.1, origin: `chat_${n.id}_${this.w.day}` });
    const fresh = p.memories.filter(m => !before.has(m.id));
    const inv = openQuests(this.w).find(x => x.taken && (x.kind === 'theft' || x.kind === 'murder') && (x.place === n.home || x.giver === n.id || x.target === n.id));
    if (inv && n.id !== inv.giver) {
      const r = this.w.rng.get('player'), tgt = this.w.npcs[inv.target!];
      let clue = '';
      if (n.id === inv.target) { if (r.chance(0.5)) clue = `${n.name} savolingizdan cho'chib, ko'zini olib qochdi…`; }
      else if (tgt && r.chance(0.6)) {
        const pool = residentsOf(this.w, inv.place).filter(x => !x.player && x.role !== 'child' && x.id !== inv.giver && x.id !== n.id && x.id !== tgt.id);
        const who = r.chance(0.7) || !pool.length ? tgt : r.pick(pool);   // mish-mish har doim ham to'g'ri emas
        clue = `${n.name}: «${inv.kind === 'theft' ? "O'sha kecha" : 'Voqea kuni'} ${who.name}ni (${this.w.nameOf(who.home)}) shubhali holda ko'rgandim.»`;
      }
      if (clue) { (inv.clues ??= []).push(`${this.w.day}-kun: ${clue}`); this.say(clue, 'info'); }
    }
    this.say(fresh.length ? `${n.name} sirini aytdi: ${this.memText(fresh[0])}.` : `${n.name} bilan suhbatlashdingiz, yangi gap yo'q.`, fresh.length ? 'good' : 'info');
    return { ok: true, msg: '' };
  }

  gift(id: string, amount = 20): ActResult {
    const n = this.near(id); if (!n) return { ok: false, msg: 'U yetarlicha yaqin emas.' };
    if (this.p.silver < amount) return { ok: false, msg: 'Kumush yetmaydi.' };
    this.p.silver -= amount; n.silver += amount;
    addMemory(this.w, n, { type: 'gift', subject: 'player', object: n.id, day: this.w.day, location: n.location, source: 'witnessed', confidence: 1, origin: `gift_${n.id}_${this.w.h}` });
    this.say(`${n.name}ga ${amount} kumush sovg'a qildingiz.`, 'good');
    return { ok: true, msg: '' };
  }

  // ---- Jang uchrashuvlari (real-time jang klientda o'ynaladi, natija bu yerda qo'llanadi) ----
  private playerSpec(): NonNullable<Encounter['player']> {
    const p = this.p;
    return { skills: { ...this.skillLv }, vitMax: this.vitMax, vit: Math.max(1, Math.round(this.vitMax * (1 - p.injury))), energyMax: this.energyMax, energy: Math.round(this.energy), focusMax: this.focusMax,
      focus: Math.round(this.focus), realm: p.realm, herbs: this.herb, atk: Math.round((10 + 5 * p.realm + this.inv.bonus('atk')) * (this.inv.buffs.power ? 1.25 : 1)),
      def: this.inv.bonus('def'), power: !!this.inv.buffs.power };
  }
  private scaled(type: string, tier: number): EnemySpec {
    const b = BEAST[type], k = Math.max(0, tier - 1);
    return { type, name: b.name, hp: Math.round(b.hp * (1 + 0.3 * k)), dmg: Math.round(b.dmg * (1 + 0.2 * k)), spd: b.spd };
  }
  private rollEncounter(): Encounter | null {
    const w = this.w, i = this.i, t = this.grid.t[i];
    if (t === T.PLACE || w.h - this.lastEncH < 8) return null;
    const rng = w.rng.get('player'), rt = this.regionTier(), tier = rt > 0 ? rt + (t === T.MOUNTAIN ? 1 : 0) : Math.max(1, this.p.realm + (t === T.MOUNTAIN ? 1 : 0));
    if (t === T.FOREST && this.deepForest.has(i) && w.day - this.lastBossDay >= 30 && rng.chance(0.03)) {
      this.lastBossDay = w.day; this.lastEncH = w.h;
      return this.beginEnc({ kind: 'boss', title: "Qora o'rmon ruhi uyg'ondi!", terrain: t, enemies: [this.scaled('treant', tier + 1)], reward: { progress: 90 + 40 * tier, silver: 0, herb: 4, ore: 0 } });
    }
    const chance = t === T.FOREST ? 0.12 : t === T.MOUNTAIN ? 0.15 : t === T.ROAD ? 0.03 : 0.05;
    if (!rng.chance(chance)) return null;
    const roll = rng.next(), e: EnemySpec[] = [];
    let title = '';
    if (t === T.MOUNTAIN && roll < 0.4) { e.push(this.scaled('tiger', tier)); title = "Tog'da yo'lbars pistirmada!"; }
    else if (roll < 0.45) { const n = 2 + (rng.chance(0.5) ? 1 : 0) + (tier >= 3 ? 1 : 0); for (let k = 0; k < n; k++) e.push(this.scaled('wolf', tier)); title = "Bo'rilar to'dasi hujum qildi!"; }
    else if (roll < 0.72) { e.push(this.scaled('boar', tier)); title = "Yovvoyi to'ng'iz yo'lingizni to'sdi!"; }
    else if (this.sect.isBandit(this)) { const n = 2 + (tier >= 3 ? 1 : 0); for (let k = 0; k < n; k++) e.push(this.scaled('wolf', tier)); title = "Bo'rilar to'dasi hujum qildi!"; }   // o'z to'dasi tegmaydi
    else { const n = 2 + (tier >= 3 ? 1 : 0); for (let k = 0; k < n; k++) e.push(this.scaled(k === n - 1 ? 'archer' : 'bandit', tier)); title = "Qaroqchilar yo'lni to'sdi!"; }
    const sumHp = e.reduce((a, x) => a + x.hp, 0), bandits = e[0].type === 'bandit';
    this.lastEncH = w.h;
    return this.beginEnc({ kind: 'beast', title, terrain: t, enemies: e, reward: { progress: Math.round(sumHp * 0.35), silver: bandits ? rng.int(15, 50) : 0, herb: t === T.FOREST && rng.chance(0.4) ? 1 : 0, ore: t === T.MOUNTAIN && rng.chance(0.4) ? 1 : 0 } });
  }
  private beginEnc(e: Omit<Encounter, 'id' | 'player'>): Encounter {
    this.enc = { ...e, id: ++this.encSeq, player: this.playerSpec() };
    this.say(e.title, 'alert');
    return this.enc;
  }
  /** Sinov va debug uchun: berilgan turdagi uchrashuvni majburan boshlaydi. */
  forceEncounter(type: string, count = 1): Encounter {
    const tier = Math.max(1, this.p.realm), enemies = Array.from({ length: count }, () => this.scaled(type, tier));
    return this.beginEnc({ kind: type === 'treant' ? 'boss' : 'beast', title: 'Uchrashuv', terrain: this.grid.t[this.i], enemies, reward: { progress: Math.round(enemies.reduce((a, x) => a + x.hp, 0) * 0.35), silver: 0, herb: 1, ore: 0 } });
  }

  /** Qidiruvdagi o'yinchi: yonidagi qo'riqchi hibsga olishga urinadi. */
  private lawCheck(): void {
    if (this.enc || this.over) return;
    const bs = bountiesOn(this.w, 'player'); if (!bs.length) return;
    const issuers = new Set(bs.map(b => b.issuer));
    const guard = this.w.alive().find(n => !!n.faction && issuers.has(n.faction) && (n.role === 'guard' || n.role === 'guard_captain') && !n.travel && n.injury < 0.5 && !!this.near(n.id));
    if (!guard || !this.w.rng.get('player').chance(0.6)) return;
    const reward = bs.filter(b => b.issuer === guard.faction).reduce((a, b) => a + b.reward, 0);
    this.say(`${guard.name}: «To'xta! Boshingga ${reward} kumush mukofot qo'yilgan!» (yutqazsangiz — jarima va zindon)`, 'alert');
    this.beginEnc({ kind: 'npc', title: `Hibsga olish: ${guard.name}`, terrain: this.grid.t[this.i], npcId: guard.id, arrest: guard.faction!,
      enemies: [{ type: 'duelist', name: guard.name, hp: 48 + 24 * guard.realm, dmg: 8 + 3 * guard.realm, spd: 125 }], reward: { progress: 20 + 15 * guard.realm, silver: 0, herb: 0, ore: 0 } });
  }
  fight(id: string): ActResult {
    if (this.over) return { ok: false, msg: "O'yin tugagan." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    const n = this.near(id); if (!n) return { ok: false, msg: 'U yetarlicha yaqin emas.' };
    if (n.role === 'child') return { ok: false, msg: "Bolaga qo'l ko'tarib bo'lmaydi." };
    const weak = !this.w.isMartial(n);
    const enemy: EnemySpec = { type: 'duelist', name: n.name, hp: weak ? 26 : 48 + 24 * n.realm, dmg: weak ? 4 : 8 + 3 * n.realm, spd: 125 };
    witness(this.w, 'attacked', 'player', n.id, n.location, { present: this.w.at(n.location) });   // hujum guvohlari eslab qoladi
    const enc = this.beginEnc({ kind: 'npc', title: `${n.name} bilan duel!`, terrain: this.grid.t[this.i], npcId: n.id, enemies: [enemy], reward: { progress: 20 + 15 * n.realm, silver: 0, herb: 0, ore: 0 } });
    return { ok: true, msg: '', enc };
  }

  endEncounter(r: EncounterEnd): ActResult {
    const e = this.enc; if (!e) return { ok: false, msg: "Faol jang yo'q." };
    this.enc = null;
    const p = this.p, clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    this.energy = clampN(r.energy, 0, this.energyMax); this.focus = clampN(r.focus, 0, this.focusMax);
    this.herb = Math.max(0, this.herb - clampN(Math.floor(r.herbsUsed), 0, this.herb));
    const hpRatio = clampN(r.hp / this.vitMax, 0, 1);
    const npc = e.npcId ? this.w.npc(e.npcId) : undefined;
    if (e.kind === 'tournament') {                     // sharafli bellashuv: o'lim yo'q, natija sekta nomidan e'lon qilinadi
      const f = p.faction ? this.w.factions[p.faction] : undefined;
      p.injury = Math.min(0.9, 1 - Math.max(hpRatio, 0.05));
      if (f?.tourney) f.tourney.player = r.result === 'win' ? 'win' : 'lose';
      if (r.result === 'win') {
        p.progress += e.reward.progress; p.silver += e.reward.silver; this.sect.contrib += 30; this.sect.totalContrib += 30;
        if (npc?.alive) npc.injury = Math.min(0.6, npc.injury + 0.3);
        const leader = f ? this.w.npc(f.leader) : undefined;
        if (leader?.alive) addMemory(this.w, leader, { type: 'helped', subject: 'player', object: leader.id, day: this.w.day, location: f!.base, source: 'witnessed', confidence: 1, origin: `tourney_${this.w.day}` });
        this.say(`🏆 G'alaba! Siz sekta chempionisiz: +${e.reward.progress} tajriba, +${e.reward.silver} kumush, +30 hissa. Natija musobaqa kuni e'lon qilinadi.`, 'good');
      } else this.say("Musobaqada yutqazdingiz, lekin sharaf bilan. Sekta sizni unutmaydi.", 'info');
      this.run(2); this.digest();
      return { ok: true, msg: '' };
    }
    if (r.result === 'win') {
      p.injury = Math.min(0.95, 1 - Math.max(hpRatio, 0.02));
      p.progress += e.reward.progress; p.silver += e.reward.silver; this.herb += e.reward.herb; this.ore += e.reward.ore;
      const loot = [e.reward.silver && `${e.reward.silver} kumush`, e.reward.herb && `${e.reward.herb} o't`, e.reward.ore && `${e.reward.ore} ruda`].filter(Boolean).join(', ');
      this.say(`G'alaba! +${e.reward.progress} tajriba${loot ? ", o'lja: " + loot : ''}.`, 'good');
      const drops = beastDrops(this, e.enemies.map(x => x.type), e.kind === 'boss');
      if (e.poi !== undefined) this.clearPoi(e.poi, e.kind === 'boss');
      if (Object.keys(drops).length) this.say(`O'lja: ${Object.entries(drops).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ')}.`, 'good');
      if (e.kind === 'boss') { this.sp += 2; this.say("Boss mag'lub etildi: +2 ko'nikma ochkosi (K).", 'good'); }
      const killedNpc = !!npc?.alive && !r.spare;
      if (npc?.alive) {
        if (r.spare) { npc.injury = Math.min(0.8, npc.injury + 0.5); this.say(`${npc.name}ni ayab qoldirdingiz.`, 'info'); }
        else { kill(this.w, npc, 'player', 'duel'); this.say(`${npc.name} sizning qo'lingizda halok bo'ldi.`, 'bad'); }
      }
      this.sect.onWin(this, e.enemies.map(x => x.type), npc, killedNpc);
      if (npc?.faction) for (const q of openQuests(this.w).filter(x => x.taken && x.kind === 'caravan' && x.gang === npc.faction)) complete(this.w, q, 'player');
    } else if (r.result === 'lose') {
      p.injury = 0.9;
      if (e.arrest) {                          // qo'riqchilar hibsga oldi: jarima undiriladi, qidiruv bekor
        const fine = Math.min(p.silver, bountiesOn(this.w, 'player').filter(b => b.issuer === e.arrest).reduce((a, b) => a + b.reward, 0));
        p.silver -= fine; clearBounties(this.w, 'player', e.arrest);
        this.say(`Hibsga olindingiz. ${fine} kumush jarima undirildi, qidiruv bekor qilindi. Kunlar zindonda o'tdi…`, 'bad');
      } else {
        const lost = Math.round(p.silver * 0.3); p.silver -= lost;
        this.say(`Mag'lub bo'ldingiz va hushingizdan ketdingiz${lost ? `; ${lost} kumush yo'qoldi` : ''}. Soatlar o'tdi…`, 'bad');
      }
      this.run(12, () => { this.regen(2, 2); p.injury = Math.max(0.5, p.injury - 0.01); });
    } else {
      p.injury = Math.min(0.95, 1 - Math.max(hpRatio, 0.02)); this.say('Jang maydonidan qochdingiz.', 'info');
    }
    if (this.inv.buffs.power) { this.inv.buffs.power--; if (!this.inv.buffs.power) delete this.inv.buffs.power; }
    this.run(1);
    this.digest();
    return { ok: true, msg: '' };
  }

  // ---- Fraksiya (sect.ts) ----
  private busy(): ActResult | null { return this.over ? { ok: false, msg: "O'yin tugagan." } : this.enc ? { ok: false, msg: 'Jang davom etmoqda.' } : null; }
  /** Sekta musobaqasida chempion bo'lish (e'lon va musobaqa kuni oralig'ida, o'z sekta zalida). */
  tournamentFight(): ActResult {
    const busy = this.busy(); if (busy) return busy;
    const f = this.p.faction ? this.w.factions[this.p.faction] : undefined, t = f?.tourney;
    if (!f || !t) return { ok: false, msg: "Hozir sektangizda musobaqa yo'q." };
    if (t.player) return { ok: false, msg: 'Siz allaqachon bellashdingiz.' };
    if (this.w.day >= t.day) return { ok: false, msg: 'Musobaqa kuni keldi — chempionlar allaqachon tanlangan.' };
    if (!this.sect.factionsHere(this).includes(f)) return { ok: false, msg: "Chempionlikka o'z sektangiz zalida yoziling." };
    const rival = this.w.factions[t.vs];
    const champ = rival && this.w.members(rival.id).filter(m => m.id !== rival.leader && !m.player).sort((x, y) => y.realm - x.realm)[0];
    if (!champ) return { ok: false, msg: "Raqib sektada chempion yo'q." };
    const enemy: EnemySpec = { type: 'duelist', name: `${champ.name} (${rival.name})`, hp: 48 + 24 * champ.realm, dmg: 8 + 3 * champ.realm, spd: 130 };
    return { ok: true, msg: '', enc: this.beginEnc({ kind: 'tournament', title: `🏆 Musobaqa: ${f.name} — ${rival.name}`, terrain: this.grid.t[this.i], npcId: champ.id, enemies: [enemy],
      reward: { progress: 25 + 10 * champ.realm, silver: 60, herb: 0, ore: 0 } }) };
  }
  joinFaction(fid: string): ActResult { return this.busy() ?? this.sect.join(this, fid); }
  leaveFaction(): ActResult { return this.busy() ?? this.sect.leave(this); }
  takeTask(): ActResult { return this.busy() ?? this.sect.takeTask(this); }
  turnIn(): ActResult { return this.busy() ?? this.sect.turnIn(this); }
  lesson(): ActResult { return this.busy() ?? this.sect.lesson(this); }
  exchange(what: string): ActResult { return this.busy() ?? this.sect.exchange(this, what); }
  // ---- Inventar (items.ts) ----
  craft(id: string): ActResult { return this.busy() ?? craft(this, id); }
  useItem(id: string): ActResult { return this.busy() ?? useItem(this, id); }
  equip(id: string): ActResult { return this.busy() ?? equipItem(this, id); }
  unequip(slot: string): ActResult { return this.busy() ?? unequip(this, slot); }
  buy(id: string): ActResult { return this.busy() ?? buy(this, id); }
  sellItem(id: string, n = 1): ActResult { return this.busy() ?? sellItem(this, id, n); }

  upgradeSkill(id: string): ActResult {
    if (!(id in SKILL_NEED)) return { ok: false, msg: "Noma'lum ko'nikma." };
    if (this.enc) return { ok: false, msg: 'Jang davom etmoqda.' };
    if (this.p.realm < SKILL_NEED[id]) return { ok: false, msg: `Bu ko'nikma ${SKILL_NEED[id]}-bosqichda ochiladi.` };
    const lv = this.skillLv[id] ?? 1;
    if (lv >= SKILL_MAX) return { ok: false, msg: 'Ko\'nikma eng yuqori darajada.' };
    if (this.sp < lv) return { ok: false, msg: `Ochko yetmaydi (kerak: ${lv}).` };
    this.sp -= lv; this.skillLv[id] = lv + 1;
    this.say(`Ko'nikma yaxshilandi: ${id} → ${lv + 1}-daraja.`, 'good');
    return { ok: true, msg: '' };
  }

  // ---- Katta dunyo: hududlar va joylar (POI) ----
  herbAt(i: number): number { return Math.max(0, this.grid.herb[i] - (this.herbTaken[i] ?? 0)); }
  oreAt(i: number): number { return Math.max(0, this.grid.ore[i] - (this.oreTaken[i] ?? 0)); }
  poiAt(i: number): Poi | null { const k = this.grid.poi[i]; return k ? this.grid.pois[k - 1] : null; }
  poiHere(): Poi | null { return this.poiAt(this.i); }
  regionHere() { return this.grid.regions[this.grid.region[this.i]]; }
  regionTier(): number { return this.regionHere().tier; }

  /** Teleport: o'yinchini boshqa katakka ko'chiradi (2 soat o'tadi, uchrashuv bo'lmaydi). */
  teleportTo(tx: number, ty: number): void {
    this.tx = tx; this.ty = ty; this.syncLoc();
    this.run(2, () => this.regen(0.2, 0.6));
    this.reveal(); this.sect.onMove(this); this.onEnterTile();
  }
  // ---- Joy xizmatlari (places.ts) ----
  rumor(): ActResult { return this.busy() ?? rumor(this); }
  // ---- Iltimoslar (quests.ts) ----
  takeQuest(id: string): ActResult {
    const q = openQuests(this.w).find(x => x.id === id); if (!q) return { ok: false, msg: 'Bu iltimos endi dolzarb emas.' };
    if (q.taken) return { ok: false, msg: 'Allaqachon qabul qilgansiz.' };
    q.taken = true; this.say(`Iltimos qabul qilindi: «${questView(this, q).title}». ${questView(this, q).desc}`, 'info');
    return { ok: true, msg: '' };
  }
  accuseNpc(id: string, qid: string): ActResult {
    const busy = this.busy(); if (busy) return busy;
    const n = this.near(id); if (!n) return { ok: false, msg: 'Ayblash uchun yoniga boring.' };
    const q = openQuests(this.w).find(x => x.id === qid && x.taken && (x.kind === 'theft' || x.kind === 'murder')); if (!q) return { ok: false, msg: "Bunday tergov yo'q." };
    if (n.id === q.giver) return { ok: false, msg: "Jabrlanuvchining o'zini ayblab bo'lmaydi." };
    const res = accuse(this.w, q, n); this.run(1);
    this.say(res === 'right' ? `⚖ To'g'ri topdingiz! ${n.name} aybini tan oldi${q.kind === 'theft' ? ", o'g'irlangan kumush qaytarildi" : ''}; boshiga mukofot e'lon qilindi.` : `⚖ ${n.name} aybsiz chiqdi va qattiq ranjidi.${q.status === 'failed' ? ' Tergov barbod bo\'ldi.' : ' Yana bir xato — tergov barbod bo\'ladi.'}`, res === 'right' ? 'good' : 'bad');
    return { ok: true, msg: '' };
  }
  giveMedicine(id: string): ActResult {
    const busy = this.busy(); if (busy) return busy;
    const n = this.near(id); if (!n) return { ok: false, msg: 'Yoniga boring.' };
    if (n.injury < 0.2) return { ok: false, msg: `${n.name} dori kerak emas.` };
    if (this.inv.count('heal_pill') > 0) this.inv.add('heal_pill', -1); else if (this.herb >= 3) this.herb -= 3; else return { ok: false, msg: "Shifo dorisi yoki 3 ta o't kerak." };
    n.injury = Math.max(0, n.injury - 0.5);
    const q = openQuests(this.w).find(x => x.kind === 'healer' && x.giver === n.id);
    if (q) complete(this.w, q, 'player');
    else addMemory(this.w, n, { type: 'helped', subject: 'player', object: n.id, day: this.w.day, location: n.location, source: 'witnessed', confidence: 1, importance: 0.5, origin: `med_${n.id}_${this.w.day}` });
    this.run(1); this.say(`${n.name}ning yarasini davoladingiz.`, 'good');
    return { ok: true, msg: '' };
  }
  donateRelief(): ActResult {
    const busy = this.busy(); if (busy) return busy;
    const loc = this.poiHere()?.id ?? this.p.location, s = econ(this.w).s[loc];
    const q = openQuests(this.w).find(x => x.kind === 'relief' && x.place === loc);
    if (!s || !q) return { ok: false, msg: "Bu yerda ocharchilik yo'q." };
    if (this.p.silver < 60) return { ok: false, msg: 'Don uchun 60 kumush kerak.' };
    this.p.silver -= 60; s.food += 900 / Math.max(3, s.pop); q.taken = true;
    complete(this.w, q, 'player'); this.run(1);
    this.say('Qishloqqa don olib berdingiz. Aholi buni unutmaydi.', 'good');
    return { ok: true, msg: '' };
  }
  /** NPC'ga risola sovg'a qilish: u uslubni o'rganadi (kuchayadi) va buni umrbod eslaydi. */
  giveManual(id: string, item: string): ActResult {
    const busy = this.busy(); if (busy) return busy;
    const n = this.near(id); if (!n) return { ok: false, msg: 'U yetarlicha yaqin emas (qo\'shni katak).' };
    if (n.role === 'child') return { ok: false, msg: "Bola hali risola o'qiy olmaydi." };
    const def = ITEMS[item]; if (!def || def.kind !== 'manual' || this.inv.count(item) < 1) return { ok: false, msg: "Sizda bunday risola yo'q." };
    initNpc(this.w, n);
    const p0 = basePower(n);
    if (item === 'manual_qi') n.progress += threshold(n.realm) * 0.5;
    else {
      const tier = item === 'manual_ancient' ? 3 : 2;
      const arts = Object.values(CATALOG).filter(t => t.tier === tier && ['sword', 'fist', 'qi', 'body'].includes(t.aff) && !n.techs?.includes(t.id));
      const art = arts.find(t => t.aff === n.aff) ?? arts[0];
      if (!art) return { ok: false, msg: `${n.name} bu risoladagi hamma narsani allaqachon biladi.` };
      learn(this.w, n, art.id, 'player', 'player');
    }
    this.inv.add(item, -1);
    addMemory(this.w, n, { type: 'taught', subject: 'player', object: n.id, day: this.w.day, location: n.location, source: 'witnessed', confidence: 1, importance: 0.8, origin: `manual_${n.id}_${this.w.day}_${item}` });
    this.run(1);
    this.say(`${n.name}ga ${def.name}ni berdingiz. ${item === 'manual_qi' ? 'Mashqi tezlashdi.' : `Kuchi: ${p0.toFixed(1)} → ${basePower(n).toFixed(1)}.`} U buni unutmaydi.`, 'good');
    return { ok: true, msg: '' };
  }
  payFine(): ActResult { return this.busy() ?? payFine(this); }
  innRest(): ActResult { return this.busy() ?? innRest(this); }
  buyRare(id: string): ActResult { return this.busy() ?? buyRare(this, id); }
  buyManual(id: string): ActResult { return this.busy() ?? buyManual(this, id); }
  teleport(id: string): ActResult { return this.busy() ?? teleport(this, id); }

  private onEnterTile(): Encounter | null {
    const reg = this.regionHere();
    if (reg.id !== this.lastRegion) {
      this.lastRegion = reg.id;
      this.say(reg.tier ? `«${reg.name}» hududiga kirdingiz (xavf darajasi ${reg.tier}).` : `«${reg.name}» — vatan vodiyingiz.`, 'info');
      if (reg.tier > this.p.realm + 1) this.say(`⚠ Bu hudud siz uchun xavfli: yirtqichlar ${reg.tier}-darajali, siz esa ${this.p.realm}-bosqichdasiz.`, 'alert');
    }
    const poi = this.poiHere(); if (!poi) { this.lastPoiName = ''; return null; }
    const k = this.grid.poi[this.i] - 1, done = this.cleared.includes(k);
    if (poi.name !== this.lastPoiName) this.say(`${poi.name}: ${POI_DESC[poi.kind]}${poi.guardian && !done ? " Qo'riqchi bor — Z bilan kiring." : poi.guardian ? ' (tozalangan)' : ''}`, 'info');
    this.lastPoiName = poi.name;
    return null;
  }

  /** Joy qo'riqchilari: g'or — yirtqichlar, xaroba — ruh (boss), sekta xarobasi — adashgan shogirdlar, uya — qaroqchilar. */
  guardianEnc(k: number): Encounter {
    const poi = this.grid.pois[k], tier = Math.max(1, poi.tier), e: EnemySpec[] = [];
    let title = '', kind: Encounter['kind'] = 'beast';
    if (poi.kind === 'cave') { e.push(this.scaled('tiger', tier), this.scaled('wolf', tier), this.scaled('wolf', tier)); title = `${poi.name}: g'or qo'riqchilari uyg'ondi!`; }
    else if (poi.kind === 'ruin') { e.push({ ...this.scaled('treant', tier), name: `${poi.name.split(' ')[0]} ruhi` }); title = `${poi.name}: qadimiy ruh uyg'ondi!`; kind = 'boss'; }
    else if (poi.kind === 'sect_ruin') { e.push(this.scaled('duelist', tier + 1), this.scaled('duelist', tier), this.scaled('archer', tier)); title = `${poi.name}: yo'ldan ozgan shogirdlar hujum qildi!`; }
    else { for (const ty of ['bandit', 'bandit', 'archer', 'bandit']) e.push(this.scaled(ty, tier)); title = `${poi.name}: qaroqchilar sizni ko'rib qoldi!`; }
    const sumHp = e.reduce((a, x) => a + x.hp, 0);
    return this.beginEnc({ kind, title, terrain: this.grid.t[this.i], enemies: e, poi: k,
      reward: { progress: Math.round(sumHp * 0.4), silver: 25 * tier + (poi.kind === 'hideout' ? 40 * tier : 0), herb: 1, ore: poi.kind === 'cave' ? 2 : 0 } });
  }

  private clearPoi(k: number, boss: boolean): void {
    if (this.cleared.includes(k)) return;
    this.cleared.push(k);
    const poi = this.grid.pois[k], tier = poi.tier, rng = this.w.rng.get('player'), got: string[] = [];
    const give = (id: string, n = 1) => { this.inv.add(id, n); got.push(`${n} ${ITEMS[id].name}`); };
    if (tier >= 2) give('crystal', tier >= 5 ? 2 : 1);
    if (tier >= 3) give('spirit_herb', 1 + (rng.chance(0.5) ? 1 : 0));
    if (tier >= 3 && rng.chance(0.3)) give('steel_sword');
    if (tier >= 3 && rng.chance(0.25)) give('iron_armor');
    if (tier >= 5 && rng.chance(0.2)) give('spirit_sword');
    if (rng.chance(0.15)) give('jade_charm');
    if (!boss) this.sp++;
    this.say(`${poi.name} tozalandi!${got.length ? ' Xazina: ' + got.join(', ') + '.' : ''}${boss ? '' : " +1 ko'nikma ochkosi."}`, 'good');
  }

  exploredB64(): string {
    const bits = new Uint8Array(Math.ceil(this.explored.length / 8));
    for (let k = 0; k < this.explored.length; k++) if (this.explored[k]) bits[k >> 3] |= 1 << (k & 7);
    return Buffer.from(bits).toString('base64');
  }
  static decodeBits(b64: string): Uint8Array {
    const bits = Buffer.from(b64, 'base64'), out = new Uint8Array(COLS * ROWS);
    for (let k = 0; k < out.length; k++) out[k] = (bits[k >> 3] >> (k & 7)) & 1;
    return out;
  }

  // ---- Saqlash / yuklash ----
  toSave() {
    return { v: 2, seed: this.seed, snap: this.w.snapshot(), g: { tx: this.tx, ty: this.ty, explored: this.exploredB64(), herbTaken: this.herbTaken, oreTaken: this.oreTaken, cleared: this.cleared, lastRegion: this.lastRegion, popCap: this.w.popCap, placeBought: this.placeBought, herb: this.herb, ore: this.ore,
      energy: this.energy, focus: this.focus, log: this.log, seenSeq: this.seenSeq, over: this.over, enc: this.enc, encSeq: this.encSeq, lastEncH: this.lastEncH, lastBossDay: this.lastBossDay,
      sp: this.sp, skillLv: this.skillLv, sect: this.sect.toJSON(), inv: this.inv.toJSON() } };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  restore(save: any): void {
    if (!save || (save.v !== 1 && save.v !== 2) || !save.snap?.npcs?.['player']) throw new Error("Saqlangan fayl yaroqsiz");
    const g = save.g;
    this.seed = save.seed; this.w = new World(save.seed, save.snap); this.grid = buildGrid(this.w, save.seed); extendGeo(this.w, this.grid); applyTerritory(this.w); this.markDeepForest();
    // Tashqi dunyo aholisi bo'lmagan eski saqlash: aholini joylashtiramiz
    if (!Object.keys(this.w.factions).some(k => k.startsWith('guard_poi') || k.startsWith('gang_poi'))) populate(this.w, this.grid, save.seed);
    else if (save.g.popCap) this.w.popCap = save.g.popCap;
    this.herbTaken = {}; this.oreTaken = {}; this.cleared = []; this.lastPoiName = '';
    if (save.v === 1) {          // eski 50×35 xarita: kashf etilganlar va o'yinchi yadroga ko'chiriladi
      this.explored = new Uint8Array(COLS * ROWS); const old = String(g.explored);
      for (let k = 0; k < old.length; k++) if (old[k] === '1') this.explored[(Math.floor(k / CORE_C) + OY) * COLS + (k % CORE_C) + OX] = 1;
      this.tx = g.tx + OX; this.ty = g.ty + OY;
    } else {
      this.explored = Game.decodeBits(g.explored); this.tx = g.tx; this.ty = g.ty;
      this.herbTaken = g.herbTaken ?? {}; this.oreTaken = g.oreTaken ?? {}; this.cleared = g.cleared ?? [];
    }
    this.lastRegion = g.lastRegion ?? -1; this.placeBought = g.placeBought ?? {};
    this.inv = Inventory.from(g.inv); if (!g.inv) { this.herb = g.herb ?? 0; this.ore = g.ore ?? 0; }   // eski saqlashlarda inventar yo'q
    this.energy = g.energy; this.focus = g.focus;
    this.log = g.log; this.seenSeq = g.seenSeq; this.over = g.over; this.enc = g.enc; this.encSeq = g.encSeq; this.lastEncH = g.lastEncH; this.lastBossDay = g.lastBossDay;
    this.sp = g.sp ?? 0; this.skillLv = g.skillLv ?? {}; this.sect = Sect.from(g.sect); this.lastPlace = undefined;
    this.reveal();
  }

  // ---- Holat ----
  state(full = false) {
    const w = this.w, p = this.p, i = this.i, g = this.grid, t = g.t[i], loc = g.loc[i];
    const hunters = new Set(bountiesOn(w, 'player').map(b => b.issuer));   // o'yinchini qidirayotgan qonun fraksiyalari
    const npcs = w.alive().filter(n => !n.player).map(n => {
      const [x, y] = npcPos(w, n), [c, r] = tileOf(x, y), f = n.faction ? w.factions[n.faction] : undefined;
      return { n, c, r, f };
    }).filter(o => this.vis.has(o.r * COLS + o.c)).map(({ n, c, r, f }) => ({
      id: n.id, name: n.name, role: n.role, tx: c, ty: r, a: n.action, faction: f?.name ?? null, fid: n.faction, ideo: f?.active ? f.ideology : null, lead: !!f && f.leader === n.id,
      hostile: f?.ideology === 'demonic' || (!!n.faction && hunters.has(n.faction) && (n.role === 'guard' || n.role === 'guard_captain')), realm: n.realm, wanted: bountiesOn(w, n.id).reduce((a, b) => a + b.reward, 0), adj: Math.max(Math.abs(c - this.tx), Math.abs(r - this.ty)) <= 1,
    }));
    const reg = this.regionHere(), poi = this.poiHere(), pk = this.grid.poi[i] - 1;
    return {
      h: w.h, date: { year: Math.floor(w.day / 360) + 1, month: Math.floor(w.day % 360 / 30) + 1, day: w.day % 30 + 1 }, hod: w.hod, over: this.over, seed: this.seed,
      season: SEASON_NAME[season(w.day)], weather: { kind: w.weather.kind, name: WEATHER_NAME[w.weather.kind], icon: WEATHER_ICON[w.weather.kind] },
      player: { tx: this.tx, ty: this.ty, name: p.name, realm: p.realm, realmName: REALMS[p.realm], progress: Math.round(p.progress), threshold: Math.round(threshold(p.realm)),
        vit: Math.round(this.vitMax * (1 - p.injury)), vitMax: this.vitMax, energy: Math.round(this.energy), energyMax: this.energyMax, focus: Math.round(this.focus), focusMax: this.focusMax,
        silver: Math.round(p.silver), herb: this.herb, ore: this.ore, alive: p.alive, injury: p.injury },
      tile: { terrain: TERRAIN_NAME[t], qi: g.qi[i], fs: g.fs[i], herb: this.herbAt(i), ore: this.oreAt(i), loc: loc ? w.locations[loc]?.name ?? loc : poi?.name ?? null, hours: MOVE_HOURS[t],
        region: { name: reg.name, tier: reg.tier }, poi: poi ? { name: poi.name, kind: poi.kind, market: poi.market, smith: poi.smith, guardian: poi.guardian, cleared: this.cleared.includes(pk) } : null },
      vis: [...this.vis], ...(full ? { explored: this.exploredB64() } : {}), cleared: this.cleared, npcs, log: this.log.slice(-40), enc: this.enc, sp: this.sp, skills: this.skillLv, ...this.questState(), inventory: inventoryState(this), place: placeState(this),
    };
  }

  /** Iltimoslar: qabul qilinganlar + yaqin (kashf etilgan, ~80 katak) joylardagi ochiqlari; xaritadagi belgilar. */
  private questState() {
    const fs = this.sect.state(this), w = this.w, list = [];
    for (const q of book(w).list) {
      if (q.status !== 'open' && !(q.taken && w.day - q.day < 60)) continue;
      const [x, y] = locPt(w, q.place), [c, r] = tileOf(x, y);
      if (!q.taken && (q.status !== 'open' || !this.explored[r * COLS + c] || Math.hypot(c - this.tx, r - this.ty) > 80)) continue;
      list.push({ ...questView(this, q), tx: c, ty: r });
    }
    const markers = [...fs.markers, ...list.filter(q => q.taken && q.status === 'open').map(q => ({ kind: (q.kind === 'healer' ? 'npc' : 'place') as 'npc' | 'place', id: q.kind === 'healer' ? q.giver : q.place }))];
    return { faction: { ...fs, markers }, quests: list.sort((a, b) => Number(b.taken) - Number(a.taken) || a.daysLeft - b.daysLeft).slice(0, 30) };
  }

  // Razvedka: o'rganilgan hududlardagi so'nggi voqealar va hikoyalar
  intel() {
    const w = this.w, ex = this.explored;
    const events = [];
    for (let k = w.events.length - 1; k >= 0 && events.length < 60; k--) {
      const e = w.events[k]; if (e.day < w.day - 45) break; if (e.secret) continue;
      const [x, y] = locPt(w, e.location), [c, r] = tileOf(x, y); if (!ex[r * COLS + c]) continue;
      const text = line(w, e); if (text) events.push({ day: e.day, text, tx: c, ty: r });
    }
    const letters = w.seeds.filter(s => s.surfaced).slice(-20).reverse().map(s => ({ day: s.day, type: TYPES[s.type] ?? s.type, channel: s.channel, status: s.status, outcome: s.outcome,
      who: Object.entries(s.roles).filter(([k]) => !k.endsWith('_hidden')).map(([, v]) => w.nameOf(v)).join(' · ') }));
    return { events, letters };
  }

  mapInfo() {
    const w = this.w;
    const g = this.grid, b64 = (a: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
    const locs: [number, string][] = []; g.loc.forEach((l, i) => { if (l) locs.push([i, l]); });
    return { cols: g.cols, rows: g.rows, core: g.core, terrain: b64(g.t), region: b64(g.region), locs, pois: g.pois, regions: g.regions,
      places: Object.values(w.locations).filter(l => l.x != null && !l.id.startsWith('poi_')).map(l => { const [c, r] = tileOf(l.x!, l.y!); return { id: l.id, name: l.name, kind: l.kind, tx: c, ty: r }; }),
      tile: TILE, realms: REALMS };
  }
}
