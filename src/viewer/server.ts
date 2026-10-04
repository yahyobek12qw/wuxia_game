// Jonli ko'rish oynasi: simulyatsiyani yuritadi va brauzerdagi 2D xaritaga holatni beradi.
// Ishga tushirish: npm run viewer  ->  http://localhost:5173
import { AFF_NAME, techOf, type Affinity } from '../sim/cultivation.js';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { World } from '../sim/world.js';
import { stepHour } from '../sim/sim.js';
import { line, TYPES } from '../sim/chronicle.js';
import { REL_KEYS, type NPC } from '../core/types.js';
import { rel } from '../sim/memory.js';
import { goalText, mood } from '../sim/ambition.js';
import { WEATHER_ICON, WEATHER_NAME } from '../sim/calendar.js';
import { Game } from '../game/game.js';
import { hash, locPt as gLocPt, npcPos as gNpcPos, pathPts as gPathPts, type Pt } from './geo.js';
import { COLS, ROWS, OX, OY, TILE, type Grid } from '../game/terrain.js';

const PORT = Number(process.env.PORT ?? 5173);
const indexUrl = new URL('./public/index.html', import.meta.url);
const playUrl = new URL('./public/play.html', import.meta.url);
let game: Game | null = null;
const saveDir = new URL('../../saves/', import.meta.url), saveFile = new URL('game.json', saveDir), saveTmp = new URL('game.json.tmp', saveDir);
function saveGame(): number {
  if (!game) return 0;
  mkdirSync(saveDir, { recursive: true });
  const text = JSON.stringify(game.toSave());
  writeFileSync(saveTmp, text); renameSync(saveTmp, saveFile);   // atomik yozish: yarim fayl qolmaydi
  return text.length;
}
function loadGame(): boolean {
  if (!existsSync(saveFile)) return false;
  try { const g = new Game(seed); g.restore(JSON.parse(readFileSync(saveFile, 'utf8'))); game = g; seed = g.seed; return true; }
  catch (e) { console.log('Saqlangan o\'yinni yuklab bo\'lmadi:', (e as Error).message); return false; }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const autosave = () => { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { saveGame(); } catch (e) { console.log('Avto-saqlash xatosi:', (e as Error).message); } }, 3000); };
const G = () => { if (!game) { if (!loadGame()) game = new Game(seed); } return game!; };

let seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) ?? 2);
// Kuzatuvchi (/) va o'yin (/play) — bitta dunyo: kuzatuvchi o'yin dunyosini ko'rsatadi va uning vaqtini yuritadi
let w!: World, obsGrid!: Grid;
const sync = () => { const g = G(); w = g.w; obsGrid = g.grid; seed = g.seed; return g; };
const BX = OX * TILE, BY = OY * TILE;            // sim koordinatalari → katta xarita birliklari
let speed = 0;            // o'yin soati / real soniya (0 = pauza, Infinity = maksimal); o'yinchi harakat qilsa — pauza
let acc = 0;

// ---------- Geometriya ----------
const shift = ([x, y]: Pt): Pt => [x + BX, y + BY];
const locPt = (id: string) => shift(gLocPt(w, id));
const npcPos = (n: NPC) => shift(gNpcPos(w, n));
const pathPts = (p: { a: string; b: string; pts?: Pt[] }) => gPathPts(w, p).map(shift);

// ---------- Ranglar va holat ----------
function factionColor(id: string | null): string {
  if (!id) return '#c9c2ad';
  const f = w.factions[id];
  if (id === 'qingyun') return '#4f9dff';
  if (id === 'imperial') return '#e3b341';
  if (f?.parent) return '#4fd1a1';
  if (f?.ideology === 'demonic') return id === 'black_wind' ? '#e5484d' : ['#ff7a45', '#c14ee0', '#ff4fa3', '#e5484d', '#ff5f8a'][hash(id) % 5];
  if (f?.ideology === 'righteous') return ['#5fb0ff', '#4fd1c5', '#7bd389', '#8fa8ff', '#5ad1e6'][hash(id) % 5];
  if (f?.ideology === 'neutral') return ['#e3b341', '#d6a53a', '#f0c674', '#c9a227'][hash(id) % 4];
  return '#9aa0a6';
}

function mapData() {
  const g = obsGrid, b64 = (a: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const poiOf = new Map(g.pois.map(p => [p.id, p]));
  return {
    w: COLS * TILE, h: ROWS * TILE, cols: COLS, rows: ROWS, tile: TILE, seed, terrain: b64(g.t), region: b64(g.region), regions: g.regions,
    locations: [
      ...Object.values(w.locations).filter(l => l.x != null && l.kind !== 'road').map(l => ({ id: l.id, name: l.name, kind: l.kind, sub: poiOf.get(l.id)?.kind, evil: poiOf.get(l.id)?.evil, x: l.x! + BX, y: l.y! + BY, owner: l.owner })),
      ...g.pois.filter(p => p.kind === 'cave').map(p => ({ id: p.id, name: p.name, kind: 'cave', sub: 'cave', evil: false, x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2, owner: undefined })),
    ],
    paths: w.paths.map(p => ({ a: p.a, b: p.b, road: p.road, pts: pathPts(p) })),
  };
}

function eventKind(type: string): string {
  if (['death', 'secret_kill', 'murder_exposed', 'leader_ousted'].includes(type)) return 'death';
  if (/raid|ambush|expedition|combat|revenge_attack|fled/.test(type)) return 'war';
  if (['new_leader', 'succession_crisis', 'schism', 'gang_founded', 'faction_disbanded', 'official_exposed', 'taught'].includes(type)) return 'story';
  return 'info';
}

function stateData(since: number, withExplored = false) {
  const g = sync();
  const npcs = w.alive().map(n => {
    const [x, y] = n.player ? [g.tx * TILE + TILE / 2, g.ty * TILE + TILE / 2] : npcPos(n);   // o'yinchi — katakdagi joyida
    const f = n.faction ? w.factions[n.faction] : undefined;
    return { id: n.id, name: n.player ? 'Siz' : n.name, role: n.role, f: n.faction, c: n.player ? '#ffffff' : factionColor(n.faction), x: Math.round(x), y: Math.round(y),
      a: n.action, r: n.realm, inj: Math.round(n.injury * 100) / 100, lead: !!f && f.leader === n.id, mv: !!n.travel, me: !!n.player };
  });
  const evs = w.events.filter(e => e.seq > since).slice(-250);
  const events = [];
  for (const e of evs) {
    const text = line(w, e);
    if (!text) continue;
    const [x, y] = locPt(e.location);
    events.push({ seq: e.seq, day: e.day, hod: e.h % 24, type: e.type, k: eventKind(e.type), text, x, y });
  }
  return {
    h: w.h, day: w.day, hod: w.hod, speed: speed === Infinity ? 'max' : speed, seed, wx: `${WEATHER_ICON[w.weather.kind]} ${WEATHER_NAME[w.weather.kind]}`, enc: !!g.enc, over: g.over, ...(withExplored ? { explored: g.exploredB64() } : {}),
    dead: Object.values(w.npcs).filter(n => !n.alive).length,
    npcs,
    factions: Object.values(w.factions).map(f => ({ id: f.id, name: f.name, c: factionColor(f.id), active: f.active, leader: w.nameOf(f.leader),
      members: w.members(f.id).length, silver: Math.round(f.silver), base: f.base, succession: !!f.succession,
      wars: (f.wars ?? []).map(id => w.nameOf(id)), allies: (f.allies ?? []).map(id => w.nameOf(id)),
      tension: Object.entries(f.tension).filter(([k]) => w.factions[k]?.active).map(([k, v]) => ({ id: k, name: w.nameOf(k), v: Math.round(v) })).sort((a, b) => b.v - a.v).slice(0, 6) })),
    events, lastSeq: w.seq,
    stories: w.seeds.filter(s => s.surfaced).slice(-25).reverse().map(s => ({ day: s.day, type: TYPES[s.type] ?? s.type, channel: s.channel,
      status: s.status, outcome: s.outcome, resolvedDay: s.resolvedDay, who: Object.entries(s.roles).filter(([k]) => !k.endsWith('_hidden')).map(([k, v]) => w.nameOf(v)).join(' · ') })),
  };
}

function npcDetail(id: string) {
  const n = w.npc(id);
  if (!n) return null;
  const rels = Object.keys(n.relations).map(o => ({ id: o, name: w.nameOf(o), r: rel(n, o, w) })).map(({ id: o, name, r }) => ({ id: o, name, r, score: Math.abs(r.affection) + Math.abs(r.trust) + r.fear + r.debt }))
    .sort((a, b) => b.score - a.score).slice(0, 6)
    .map(x => ({ id: x.id, name: x.name, ...Object.fromEntries(REL_KEYS.map(k => [k, Math.round(x.r[k] * 100) / 100])) }));
  const mems = n.memories.slice().sort((a, b) => b.importance * b.confidence - a.importance * a.confidence).slice(0, 6)
    .map(m => ({ type: m.type, day: m.day, subject: w.nameOf(m.subject), object: m.object ? w.nameOf(m.object) : null, source: m.source, conf: Math.round(m.confidence * 100) / 100 }));
  return {
    id: n.id, name: n.name, age: n.age, role: n.role, faction: n.faction ? w.nameOf(n.faction) : null, c: factionColor(n.faction),
    home: w.nameOf(n.home), location: w.nameOf(n.location), action: n.action, realm: n.realm, progress: Math.round(n.progress), silver: Math.round(n.silver),
    injury: Math.round(n.injury * 100) / 100, alive: n.alive, traits: n.traits, needs: n.needs,
    goals: n.goals.map(g => ({ type: g.type, text: goalText(w, g), since: g.since })), mood: n.alive ? mood(w, n).label : null,
    aff: n.aff ? AFF_NAME[n.aff as Affinity] : null, techs: (n.techs ?? []).map(id => techOf(w, id)?.name).filter(Boolean),
    toPlayer: n.player ? null : Object.fromEntries(REL_KEYS.map(k => [k, Math.round(rel(n, 'player', w)[k] * 100) / 100])),
    bonds: n.bonds.map(b => ({ type: b.type, name: w.nameOf(b.other) })), relations: rels, memories: mems,
  };
}

// ---------- Sim sikli ----------
// Kuzatuvchidagi tezlik o'yin dunyosini yuritadi (o'yinchi "kutib turadi"); jang yoki o'yin tugasa — pauza
setInterval(() => {
  if (speed <= 0 || !game) return;
  const g = game;
  if (g.enc || g.over) { speed = 0; return; }
  const budget = performance.now() + 60;
  let n = speed === Infinity ? Infinity : Math.floor(acc += speed * 0.1);
  if (speed !== Infinity) acc -= n;
  let ran = 0;
  while (n-- > 0 && performance.now() < budget && !g.enc && !g.over) { g.run(1); ran++; }
  if (ran) autosave();
}, 100);

// ---------- HTTP ----------
const json = (res: import('node:http').ServerResponse, data: unknown, code = 200) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://localhost');
  if (u.pathname.startsWith('/api/')) sync();
  switch (u.pathname) {
    case '/': res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(readFileSync(indexUrl)); return;
    case '/sound.js': res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(readFileSync(new URL('./public/sound.js', import.meta.url))); return;
    case '/combat.js': res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(readFileSync(new URL('./public/combat.js', import.meta.url))); return;
    case '/favicon.ico': res.writeHead(204); res.end(); return;
    case '/play': res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(readFileSync(playUrl)); return;
    case '/api/game/map': return json(res, G().mapInfo());
    case '/api/game/state': return json(res, G().state(u.searchParams.get('full') === '1'));
    case '/api/game/save': { const bytes = saveGame(); return json(res, { ok: true, bytes }); }
    case '/api/game/load': { const ok = loadGame(); return json(res, ok ? { ok: true, state: G().state(true) } : { ok: false, msg: 'Saqlangan o\'yin topilmadi.' }); }
    case '/api/game/intel': return json(res, G().intel());
    case '/api/game/new': { const sd = Number(u.searchParams.get('seed') ?? 0) || Math.floor(Math.random() * 9000) + 1; G().reset(sd); autosave(); return json(res, G().state(true)); }
    case '/api/game/debug': {   // dev: majburiy uchrashuv / bosqich (faqat localhost'da tinglaydi)
      const g = G(), q = u.searchParams;
      if (q.get('sp')) g.sp = Math.max(0, Number(q.get('sp')));
      if (q.get('item')) g.inv.add(q.get('item')!, Math.max(1, Number(q.get('n')) || 1));
      if (q.get('realm')) g.p.realm = Math.max(0, Math.min(8, Number(q.get('realm'))));
      if (q.get('enc')) g.forceEncounter(q.get('enc')!, Math.max(1, Math.min(6, Number(q.get('n')) || 1)));
      return json(res, g.state());
    }
    case '/api/game/npc': { const d = G().npcInfo(u.searchParams.get('id') ?? ''); return d ? json(res, d) : json(res, { error: "Bu odam ko'rinmayapti." }, 404); }
    case '/api/game/act': {
      speed = 0;   // o'yinchi boshqaruvni oldi — kuzatuvchi vaqti to'xtaydi
      const g = G(), q = u.searchParams, t = q.get('t');
      const r = t === 'move' ? g.move(Math.sign(Number(q.get('dx'))), Math.sign(Number(q.get('dy'))))
        : t === 'explore' ? g.explore() : t === 'rest' ? g.rest(Math.min(12, Number(q.get('h')) || 4)) : t === 'cultivate' ? g.cultivate(Math.min(12, Number(q.get('h')) || 4))
        : t === 'talk' ? g.talk(q.get('id') ?? '') : t === 'gift' ? g.gift(q.get('id') ?? '') : t === 'fight' ? g.fight(q.get('id') ?? '')
        : t === 'enc_end' ? g.endEncounter({ result: (q.get('result') as 'win' | 'lose' | 'flee') ?? 'flee', hp: Number(q.get('hp')), energy: Number(q.get('energy')), focus: Number(q.get('focus')), herbsUsed: Number(q.get('herbs')) || 0, spare: q.get('spare') === '1' })
        : t === 'sell' ? g.sell() : t === 'herb' ? g.useHerb() : t === 'skill_up' ? g.upgradeSkill(q.get('id') ?? '')
        : t === 'join' ? g.joinFaction(q.get('f') ?? '') : t === 'leave' ? g.leaveFaction() : t === 'task' ? g.takeTask() : t === 'turnin' ? g.turnIn()
        : t === 'lesson' ? g.lesson() : t === 'exch' ? g.exchange(q.get('what') ?? '')
        : t === 'craft' ? g.craft(q.get('id') ?? '') : t === 'use' ? g.useItem(q.get('id') ?? '') : t === 'equip' ? g.equip(q.get('id') ?? '') : t === 'unequip' ? g.unequip(q.get('slot') ?? '')
        : t === 'takeq' ? g.takeQuest(q.get('id') ?? '') : t === 'accuse' ? g.accuseNpc(q.get('id') ?? '', q.get('q') ?? '') : t === 'medicine' ? g.giveMedicine(q.get('id') ?? '') : t === 'donate' ? g.donateRelief() : t === 'givemanual' ? g.giveManual(q.get('id') ?? '', q.get('item') ?? '') : t === 'fine' ? g.payFine() : t === 'tourney' ? g.tournamentFight() : t === 'rumor' ? g.rumor() : t === 'inn' ? g.innRest() : t === 'buyrare' ? g.buyRare(q.get('id') ?? '') : t === 'buyman' ? g.buyManual(q.get('id') ?? '') : t === 'tp' ? g.teleport(q.get('id') ?? '')
        : t === 'buy' ? g.buy(q.get('id') ?? '') : t === 'sellitem' ? g.sellItem(q.get('id') ?? '', Math.max(1, Number(q.get('n')) || 1)) : { ok: false, msg: "noma'lum harakat" };
      autosave();
      return json(res, { ...r, state: g.state(t === 'rumor' || t === 'tp') });   // mish-mish/teleport xaritani ochadi
    }
    case '/api/map': return json(res, mapData());
    case '/api/state': return json(res, stateData(Number(u.searchParams.get('since') ?? 0), u.searchParams.get('exp') === '1'));
    case '/api/npc': { const d = npcDetail(u.searchParams.get('id') ?? ''); return d ? json(res, d) : json(res, { error: 'topilmadi' }, 404); }
    case '/api/speed': { const v = u.searchParams.get('v'); speed = v === 'max' ? Infinity : Math.max(0, Number(v) || 0); return json(res, { speed: speed === Infinity ? 'max' : speed }); }
    case '/api/reset': { seed = Number(u.searchParams.get('seed') ?? seed) || 1; G().reset(seed); sync(); autosave(); acc = 0; speed = 0; return json(res, { seed }); }   // yangi o'yin (ikkala oyna uchun)
    default: res.writeHead(404); res.end('404');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`WUXIA viewer: http://localhost:${PORT}  (seed ${seed})`));
