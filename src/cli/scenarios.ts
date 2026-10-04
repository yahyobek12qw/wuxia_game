// Tirik dunyo ssenariylari (docs/LIVING_WORLD_PLAN.md §49): dunyo o'yinchisiz yashaydimi?
// Har bosqich o'z ssenariylarini shu faylga qo'shadi.
import { Game } from '../game/game.js';
import { runDays } from '../sim/sim.js';
import { kill } from '../sim/combat.js';
import { hasBond, rel } from '../sim/memory.js';
import { invariants } from './invariants.js';
import { basePower } from '../sim/combat.js';
import { tileOf } from '../game/terrain.js';
import { npcPos } from '../viewer/geo.js';
import type { World } from '../sim/world.js';
import { econ, residentsOf } from '../sim/settlement.js';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const count = (w: World, type: string, fromSeq = 0) => w.events.filter(e => e.type === type && e.seq > fromSeq).length;

// ---- 1 va 2: o'yinchi hech narsa qilmaydi — 30 kun, so'ng 1 yil ----
{
  const g = new Game(11), w = g.w, p0 = { tx: g.tx, ty: g.ty }, seq0 = w.seq, t0 = performance.now();
  const before = new Map(w.alive().filter(n => !n.player && n.role !== 'child').map(n => [n.id, { loc: n.location, silver: n.silver, prog: n.progress, realm: n.realm, role: n.role }]));
  const pop0 = w.alive().length, homes0 = new Map(w.settlements().map(id => [id, new Set(w.alive().filter(n => n.home === id).map(n => n.id))]));
  const weathers = new Set([w.weather.kind]), visited = new Set<string>();
  for (let d = 0; d < 30; d++) { runDays(w, 1); weathers.add(w.weather.kind); for (const n of w.alive()) { const b = before.get(n.id); if (b && n.location !== b.loc) visited.add(n.id); } }
  const changed = [...before].filter(([id, b]) => { const n = w.npcs[id]; return !n.alive || visited.has(id) || n.silver !== b.silver || n.progress !== b.prog; }).length;
  console.log('\n# 1. 30 kun o\'yinchisiz');
  check('dunyoda voqealar sodir bo\'ldi', w.seq - seq0 > 300, `(${w.seq - seq0} voqea)`);
  check("NPC'larning ≥80% hayoti o'zgardi (joy, pul, mashq)", changed / before.size >= 0.8, `(${changed}/${before.size})`);
  check("NPC'lar sayohat qildi", visited.size > before.size * 0.3, `(${visited.size})`);
  check("ob-havo o'zgarib turdi", weathers.size >= 2, [...weathers].join(','));
  check("o'yinchi joyida qoldi", g.tx === p0.tx && g.ty === p0.ty);
  check('invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');

  const seq1 = w.seq, pros30 = new Map(Object.entries(econ(w).s).map(([id, s]) => [id, s.prosperity]));
  runDays(w, 330);
  const ms = (performance.now() - t0) / 360;
  console.log('\n# 2. 1 yil o\'yinchisiz');
  const alive0 = [...before.keys()];
  const died = alive0.filter(id => !w.npcs[id].alive).length;
  const stronger = alive0.filter(id => w.npcs[id].alive && w.npcs[id].realm > before.get(id)!.realm).length;
  const newRole = alive0.filter(id => w.npcs[id].alive && w.npcs[id].role !== before.get(id)!.role).length;
  const newcomers = w.alive().filter(n => !before.has(n.id) && !n.player).length;
  check("kimdir o'ldi", died > 0, `(${died})`);
  check('kimdir kuchaydi (bosqich oshdi)', stronger > 10, `(${stronger})`);
  check("kimningdir hayotdagi o'rni o'zgardi (unvon, kasb, fraksiya)", newRole > 5, `(${newRole})`);
  check("dunyoga yangi odamlar keldi", newcomers > 0, `(${newcomers})`);
  check('faslar almashdi', count(w, 'season_change') >= 3, `(${count(w, 'season_change')})`);
  check("orzular ro'yobga chiqdi", count(w, 'ambition_fulfilled', seq0) > 0, `(${count(w, 'ambition_fulfilled', seq0)})`);
  check('raqibliklar paydo bo\'ldi', count(w, 'rivalry', seq0) > 0, `(${count(w, 'rivalry', seq0)})`);
  check("boylik orzusi: do'kon ochildi yoki oila boyidi", count(w, 'opened_shop', seq0) + count(w, 'prospered', seq0) > 0, `(do'kon ${count(w, 'opened_shop', seq0)}, boyish ${count(w, 'prospered', seq0)})`);
  check('fraksiyalar o\'zgardi (unvon, rahbar, urush, to\'da)', ['promoted', 'new_leader', 'war_declared', 'gang_founded', 'faction_disbanded', 'schism'].some(t => count(w, t, seq1) > 0));
  check('invariantlar (1 yil)', invariants(w).length === 0, invariants(w)[0] ?? '');
  // Aholi: o'lganlar o'rnini yangilar egallaydi (tug'ilish, kelish, voyaga yetish)
  const born = count(w, 'born', seq0), came = count(w, 'wanderer_arrived', seq0), deaths = count(w, 'death', seq0);
  check("aholi kamaymadi: qo'shilganlar ≥ o'lganlar", w.alive().length >= pop0, `(${pop0} → ${w.alive().length}; o'ldi ${deaths}, tug'ildi ${born}, keldi ${came})`);
  check("to'ylar bo'ldi, bolalar tug'ildi, yoshlar voyaga yetdi", count(w, 'married', seq0) > 0 && born > 0 && count(w, 'came_of_age', seq0) > 0,
    `(nikoh ${count(w, 'married', seq0)}, voyaga yetdi ${count(w, 'came_of_age', seq0)})`);

  console.log('\n# 7. Qishloqni 1 yil tark etish');
  const vills = w.settlements().filter(id => w.locations[id].kind === 'village');
  const changedV = vills.filter(id => { const now = new Set(residentsOf(w, id).map(n => n.id)), was = homes0.get(id)!; return now.size !== was.size || [...now].some(x => !was.has(x)); }).length;
  const prosShift = vills.filter(id => Math.abs(econ(w).s[id].prosperity - (pros30.get(id) ?? 0)) > 5).length;
  check("qishloqlarning ko'pchiligida aholi tarkibi o'zgardi (tug'ilish, o'lim, ko'chish, nikoh)", changedV / vills.length > 0.6, `(${changedV}/${vills.length})`);
  check("qishloqlar farovonligi o'zgardi", prosShift > vills.length * 0.2, `(${prosShift}/${vills.length})`);
  console.log(`   (ko'chishlar ${count(w, 'emigrated', seq0)}, ocharchilik ${count(w, 'famine', seq0)}, meros ${count(w, 'inheritance', seq0)}, do'kon meros ${count(w, 'inherited_shop', seq0)})`);
  console.log(`   (yil statistikasi: risola topildi ${count(w, 'found_manual', seq0)}, raqibdan o'zdi ${count(w, 'surpassed_rival', seq0)}, bo'ron/qor ${count(w, 'weather', seq0)}, ${ms.toFixed(0)} ms/kun)`);
}

// ---- 3: muhim NPC o'ldiriladi ----
{
  const g = new Game(12), w = g.w;
  const sect = Object.values(w.factions).filter(f => f.active && f.ideology === 'righteous' && f.leader)
    .sort((a, b) => w.alive().filter(o => hasBond(o, b.leader!)).length - w.alive().filter(o => hasBond(o, a.leader!)).length)[0];
  const leader = w.npcs[sect.leader!];
  const close = w.alive().filter(o => hasBond(o, leader.id) && !o.player);
  const seq0 = w.seq;
  kill(w, leader, 'player', 'duel');
  runDays(w, 5);
  console.log(`\n# 3. Muhim NPC o'ldirildi: ${leader.name} (${sect.name} rahbari, ${close.length} yaqini)`);
  const knows = close.filter(o => o.memories.some(m => m.type === 'killed' && m.object === leader.id && m.subject === 'player'));
  const hate = close.filter(o => o.alive && rel(o, 'player', w).affection < -0.2);
  check('fraksiya reaksiyasi: rahbar o\'zgardi yoki vorislik boshlandi', sect.leader !== leader.id && (!!sect.leader || !!sect.succession || count(w, 'succession_crisis', seq0) > 0));
  check("yaqinlari qotilni bildi (xabar yetib bordi)", knows.length > 0, `(${knows.length}/${close.length})`);
  check("yaqinlari o'yinchidan nafratlanadi", hate.length > 0, `(${hate.length})`);
  const vows = w.events.filter(e => e.seq > seq0 && e.type === 'vow_revenge' && e.object === 'player').length;
  console.log(`   (qasos qasamlari: ${vows}, guvohlar xotirasi: ${w.alive().filter(o => o.memories.some(m => m.type === 'killed' && m.object === leader.id)).length})`);
  check('invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// ---- 6: savdo yo'li buziladi → iqtisod o'zgaradi ----
{
  const run = (blocked: boolean) => {
    const g = new Game(13), w = g.w;
    runDays(w, 1);
    const E = econ(w);
    const city = w.settlements().filter(id => w.locations[id].kind === 'city').find(c => w.settlements().some(v => w.locations[v].kind === 'village' && w.tradePartner(v) === c))!;
    for (let d = 0; d < 40; d++) {
      if (blocked) for (const v of [city, ...w.settlements().filter(x => w.tradePartner(x) === city || w.tradePartner(city) === x)]) for (const l of w.route(v, city) ?? []) E.danger[l.road] = w.day + 2;
      if (blocked) E.danger[city] = w.day + 2;
      runDays(w, 1);
    }
    const s = E.s[city];
    return { city, food: s.food, price: s.prices.food, pros: s.prosperity, merch: residentsOf(w, city).filter(n => n.role === 'merchant').reduce((a, n) => a + n.silver, 0) };
  };
  const a = run(false), b = run(true);
  console.log(`\n# 6. Savdo yo'li buzildi (${a.city}): zaxira ${a.food.toFixed(0)} → ${b.food.toFixed(0)} kun, don narxi ×${a.price} → ×${b.price}, farovonlik ${a.pros.toFixed(0)} → ${b.pros.toFixed(0)}`);
  check("shaharda oziq zaxirasi kamaydi", b.food < a.food);
  check('don narxi oshdi', b.price > a.price);
  check('farovonlik pasaydi', b.pros < a.pros);
}

// ---- 5: fraksiyalar urushi → hudud va NPC'lar o'zgaradi ----
{
  const g = new Game(14), w = g.w;
  const sects = Object.values(w.factions).filter(f => f.active && f.ideology === 'righteous' && !f.parent);
  let pair: [typeof sects[0], typeof sects[0]] | null = null;
  for (const a of sects) for (const b of sects) if (!pair && a !== b && w.hoursTo(a.base, b.base) <= 40 && w.ofKind('village').some(v => w.locations[v].owner === b.id)) pair = [a, b];
  if (!pair) check("urush uchun qo'shni sektalar topildi", false);
  else {
    const [a, b] = pair, seq0 = w.seq;
    (a.wars ??= []).push(b.id); (b.wars ??= []).push(a.id); a.allies = (a.allies ?? []).filter(x => x !== b.id); b.allies = (b.allies ?? []).filter(x => x !== a.id);
    a.tension[b.id] = 100; b.tension[a.id] = 100;
    for (const m of w.members(a.id)) m.realm += 2;                 // hujumchi kuchliroq
    const memA = w.members(a.id).length, memB = w.members(b.id).length, silverA = a.silver, silverB = b.silver, villB = w.ofKind('village').filter(v => w.locations[v].owner === b.id).length;
    for (let d = 0; d < 60 && !w.events.some(e => e.seq > seq0 && e.type === 'territory_gained'); d++) { a.tension[b.id] = Math.max(a.tension[b.id] ?? 0, 90); runDays(w, 1); }
    const exp = w.events.filter(e => e.seq > seq0 && e.type === 'expedition_declared' && e.object === b.id).length;
    const gained = w.events.filter(e => e.seq > seq0 && e.type === 'territory_gained' && e.subject === a.id).length;
    const deadB = memB - w.members(b.id).length;
    console.log(`\n# 5. Urush: ${a.name} → ${b.name} (yurishlar ${exp}, tortib olingan qishloqlar ${gained}, ${b.name} a'zolari ${memB} → ${w.members(b.id).length}, kumush ${Math.round(silverA)} → ${Math.round(a.silver)})`);
    check("urushda jazo yurishi bo'ldi", exp > 0);
    check("g'olib yengilganning qishlog'ini egalladi", gained > 0 && w.ofKind('village').filter(v => w.locations[v].owner === b.id).length < villB);
    check("NPC'lar o'zgardi (yengilganlar halok bo'ldi yoki yaralandi)", deadB > 0 || w.members(b.id).some(m => m.injury > 0.2), `(${deadB} kishi kamaydi)`);
    check("yengilgan tomon boyligini yo'qotdi (o'lja, ta'minot, hudud soliqlari)", b.silver < silverB, `(${Math.round(silverB)} → ${Math.round(b.silver)})`);
    check('invariantlar (urush)', invariants(w).length === 0, invariants(w)[0] ?? '');
    void memA;
  }
}

// ---- 4: NPC'ga jang risolasi berish → kuchayadi, o'yinchini eslaydi ----
{
  const g = new Game(15), w = g.w;
  runDays(w, 1);
  const n = w.alive().find(x => x.role === 'wanderer' && w.isMartial(x)) ?? w.alive().find(x => x.role === 'outer_disciple')!;
  const [nx, ny] = tileOf(...npcPos(w, n)); g.tx = nx; g.ty = ny; n.travel = undefined;
  g.inv.add('manual_combat', 1);
  const p0 = basePower(n), t0 = n.techs?.length ?? 0, r = g.giveManual(n.id, 'manual_combat');
  runDays(w, 30);
  console.log(`\n# 4. ${n.name}ga risola berildi: kuch ${p0.toFixed(1)} → ${basePower(n).toFixed(1)}, uslublar ${t0} → ${n.techs?.length ?? 0}`);
  check("NPC risoladan uslub o'rgandi", r.ok && (n.techs?.length ?? 0) > t0, r.msg);
  check('NPC kuchaydi', !n.alive || basePower(n) > p0 * (1 - 0.6 * n.injury) * 1.05);
  check("NPC o'yinchini eslaydi (ustoz sifatida)", n.memories.some(m => m.type === 'taught' && m.subject === 'player'));
}

console.log(failed ? `\n${failed} ta ssenariy muvaffaqiyatsiz` : '\nBarcha ssenariylar o\'tdi');
process.exit(failed ? 1 : 0);
