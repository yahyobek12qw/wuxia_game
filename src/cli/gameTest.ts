// O'yin qatlami testi: skriptlangan o'yinchi bir necha oy yashaydi; xato va invariant buzilishi bo'lmasligi kerak.
import { Game } from '../game/game.js';
import { invariants } from './invariants.js';
import { kill } from '../sim/combat.js';
import { diplomacy } from '../sim/faction.js';
import { ambitions, mood } from '../sim/ambition.js';
import { addMemory } from '../sim/memory.js';
import { bear, family } from '../sim/family.js';
import { econ, economy, residentsOf } from '../sim/settlement.js';
import { runDays } from '../sim/sim.js';
import { book, openQuests, questsDaily } from '../sim/quests.js';
import { cultInit, cultivationMonthly, deviationDeath, learn, techOf } from '../sim/cultivation.js';
import { basePower } from '../sim/combat.js';
import { bountiesOn, lawDaily, lawFaction, repAt } from '../sim/law.js';
import { liberateHit, ownerOf, territory, terr } from '../sim/territory.js';
import { T, tileOf, OX, OY, CORE_C, CORE_R, COLS, ROWS } from '../game/terrain.js';
import { npcPos } from '../viewer/geo.js';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

const settle = (g: Game) => { if (g.enc) g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0 }); };
for (const seed of [1, 2, 3]) {
  const g = new Game(seed);
  const start = { x: g.tx, y: g.ty, h: g.w.h };
  let moves = 0, talks = 0, blocked = 0;
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]];
  for (let step = 0; step < 400 && !g.over; step++) {
    const d = dirs[(Math.floor(step / 8) + seed) % dirs.length];
    const r = g.move(d[0], d[1]); if (r.ok) moves++; else blocked++;
    settle(g);
    if (step % 6 === 0) g.explore();
    if (step % 9 === 0) g.cultivate(6);
    if (step % 11 === 0) g.rest(8);
    if (step % 15 === 0) g.sell();
    const st = g.state();
    const adj = st.npcs.find(n => n.adj);
    if (adj) { if (g.talk(adj.id).ok) talks++; if (step % 30 === 0) g.gift(adj.id, 5); }
    if (g.energy < 10) g.rest(10);
  }
  const st = g.state();
  const bad = invariants(g.w);
  check(`seed ${seed}: o'yinchi yurdi`, moves > 20 && (g.tx !== start.x || g.ty !== start.y), `(yurish ${moves}, to'siq ${blocked}, suhbat ${talks})`);
  check(`seed ${seed}: vaqt o'tdi`, g.w.h > start.h + 200, `(${Math.round((g.w.h - start.h) / 24)} kun)`);
  check(`seed ${seed}: statlar chegarada`, st.player.energy >= 0 && st.player.energy <= st.player.energyMax && st.player.vit >= 0 && st.player.focus >= 0);
  check(`seed ${seed}: invariantlar`, bad.length === 0, bad[0] ?? '');
  console.log(`      realm=${st.player.realmName} progress=${st.player.progress}/${st.player.threshold} silver=${st.player.silver} herb=${st.player.herb} ore=${st.player.ore} alive=${st.player.alive} explored=${g.explored.reduce((a, b) => a + b, 0)}`);
}
// ---- Jang uchrashuvlari ----
{
  const g = new Game(7);
  const st0 = g.state();
  const enc = g.forceEncounter('wolf', 3);
  check('uchrashuv boshlandi', !!g.state().enc && enc.enemies.length === 3 && enc.player!.vitMax === st0.player.vitMax);
  check('jang paytida harakat bloklanadi', !g.move(1, 0).ok && !g.explore().ok && !g.rest(2).ok);
  const p0 = g.p.progress, h0 = g.w.h;
  g.endEncounter({ result: 'win', hp: 90, energy: 40, focus: 20, herbsUsed: 0 });
  check("g'alaba: tajriba, jarohat, vaqt", g.p.progress > p0 && g.p.injury > 0 && g.w.h > h0 && g.enc === null, `(+${g.p.progress - p0} tajriba, injury ${g.p.injury.toFixed(2)})`);
  check('endEncounter ikki marta ishlamaydi', !g.endEncounter({ result: 'win', hp: 1, energy: 1, focus: 1, herbsUsed: 0 }).ok);

  const silver0 = g.p.silver;
  g.forceEncounter('tiger'); g.endEncounter({ result: 'lose', hp: 0, energy: 0, focus: 0, herbsUsed: 0 });
  check("mag'lubiyat: o'lmaydi, kumush kamayadi", g.p.alive && g.p.silver <= silver0 && g.p.injury >= 0.5, `(injury ${g.p.injury.toFixed(2)})`);

  g.forceEncounter('boar'); g.endEncounter({ result: 'flee', hp: 50, energy: 5, focus: 5, herbsUsed: 0 });
  check('qochish ishlaydi', g.enc === null && g.p.alive);

  g.herb = 2; g.forceEncounter('wolf'); g.endEncounter({ result: 'win', hp: 100, energy: 9999, focus: -5, herbsUsed: 5 });
  check('statlar va o\'t sarfi chegarada', g.energy <= g.energyMax && g.focus >= 0 && g.herb >= 0);

  // NPC duel: ayash va o'ldirish
  for (const spare of [true, false]) {
    const gg = new Game(2);
    const npcs = gg.state().npcs;
    const target = npcs.find(n => !n.hostile && n.role !== 'merchant') ?? npcs[0];
    if (!target) { check('NPC topildi', false); continue; }
    gg.tx = target.tx; gg.ty = target.ty; gg.p.location = gg.grid.loc[gg.i] ?? '';
    const r = gg.fight(target.id);
    check(`duel boshlandi (${spare ? 'ayash' : "o'ldirish"})`, r.ok && gg.enc?.kind === 'npc' && gg.enc.npcId === target.id);
    gg.endEncounter({ result: 'win', hp: 100, energy: 50, focus: 30, herbsUsed: 0, spare });
    const n = gg.w.npc(target.id)!;
    check(spare ? 'ayalgan NPC tirik' : "o'ldirilgan NPC o'lgan", spare ? n.alive : !n.alive && n.killer === 'player');
    check(`duelden keyin invariantlar`, invariants(gg.w).length === 0);
  }
  // Tasodifiy uchrashuvlar: ko'p yurishda hech bo'lmaganda bir marta chiqadi va to'g'ri hal bo'ladi
  const g2 = new Game(11); let encs = 0, bosses = 0;
  for (let step = 0; step < 900 && !g2.over; step++) {
    const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][(Math.floor(step / 5)) % 4];
    const r = g2.move(d[0], d[1]);
    if (r.enc) { encs++; if (r.enc.kind === 'boss') bosses++; g2.endEncounter({ result: 'win', hp: g2.vitMax, energy: g2.energyMax / 2, focus: g2.focusMax / 2, herbsUsed: 0 }); }
    if (g2.energy < 15) g2.rest(10);
  }
  check('tasodifiy uchrashuvlar chiqadi', encs > 0, `(${encs} ta, boss ${bosses})`);
  check('uchrashuvlardan keyin invariantlar', invariants(g2.w).length === 0);
}

// ---- Ko'nikma daraxti ----
{
  const g = new Game(4);
  check("boshida ochko yo'q", g.sp === 0 && !g.upgradeSkill('ball').ok);
  g.sp = 3;
  check("1-daraja ko'nikma 1 ochko", g.upgradeSkill('ball').ok && g.skillLv.ball === 2 && g.sp === 2);
  check("2→3 daraja 2 ochko", g.upgradeSkill('ball').ok && g.skillLv.ball === 3 && g.sp === 0);
  g.sp = 9;
  check("realm yetmasa (nova 3-bosqich) rad etiladi", !g.upgradeSkill('nova').ok);
  check("noma'lum ko'nikma rad etiladi", !g.upgradeSkill('zzz').ok);
  g.sp = 20; for (let i = 0; i < 6; i++) g.upgradeSkill('slash');
  check('maksimum 5-daraja', g.skillLv.slash === 5 && !g.upgradeSkill('slash').ok);
  const enc = g.forceEncounter('wolf'); check("uchrashuv spetsifikatsiyasida ko'nikma darajalari", enc.player!.skills.ball === 3);
  g.endEncounter({ result: 'win', hp: 50, energy: 10, focus: 10, herbsUsed: 0 });
  const sp0 = g.sp; g.forceEncounter('treant'); g.endEncounter({ result: 'win', hp: 50, energy: 10, focus: 10, herbsUsed: 0 });
  check('boss g\'alabasi +2 ochko', g.sp === sp0 + 2);
}

// ---- Saqlash / yuklash: yuklangan o'yin aynan bir xil davom etishi kerak ----
{
  const script = (g: Game, from: number, to: number) => {
    for (let step = from; step < to; step++) {
      const d: [number, number] = [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(step / 4) % 4] as [number, number];
      g.move(d[0], d[1]); settle(g);
      if (step % 7 === 0) { g.explore(); settle(g); }
      if (step % 13 === 0) g.cultivate(4);
      if (step % 5 === 0 && g.energy < 20) g.rest(8);
    }
  };
  const a = new Game(6);
  script(a, 0, 120); a.sp = 2; a.upgradeSkill('ball');
  const saved = JSON.parse(JSON.stringify(a.toSave()));      // faylga yozib o'qishni taqlid qiladi
  const b = new Game(6); b.restore(saved);
  const same = (x: Game, y: Game) => JSON.stringify(x.state()) === JSON.stringify(y.state());
  check('yuklangan holat saqlanganiga teng', same(a, b));
  check("ko'nikma va ochko saqlanadi", b.skillLv.ball === 2 && b.sp === a.sp);
  script(a, 120, 260); script(b, 120, 260);
  check("yuklangandan keyin 140 harakat aynan bir xil (determinizm)", same(a, b), `(kun ${Math.round(a.w.h / 24)})`);
  check('yuklangan dunyoda invariantlar', invariants(b.w).length === 0);
  let bad = false; try { new Game(1).restore({ v: 9 } as never); } catch { bad = true; }
  check('yaroqsiz saqlash fayli rad etiladi', bad);
}

// ---- Sekta / fraksiya a'zoligi ----
{
  // O'yinchini manzil katagiga ko'chirish (test uchun)
  const goto = (g: Game, id: string) => {
    const k = g.grid.loc.findIndex((l, i) => l === id && (g.grid.t[i] === T.PLACE || g.grid.t[i] === T.ROAD));
    g.tx = k % g.grid.cols; g.ty = Math.floor(k / g.grid.cols); g.p.location = id;
  };
  const g = new Game(2);
  goto(g, 'qingyun_peak');
  const here = g.state().faction.here;
  check("bazada fraksiya ko'rinadi", here.some(f => f.id === 'qingyun' && f.join.ok), JSON.stringify(here.map(f => f.id)));
  check("sektaga qo'shilish", g.joinFaction('qingyun').ok && g.p.faction === 'qingyun' && g.p.role === 'outer_disciple');
  check("ikki marta qo'shilib bo'lmaydi", !g.joinFaction('qingyun').ok);
  check('vazifa olish (1)', g.takeTask().ok);
  check('vazifa olish (2)', g.takeTask().ok);
  check('uchinchi vazifa rad etiladi', !g.takeTask().ok && g.sect.tasks.length === 2);
  check('vazifalar har xil turda', g.sect.tasks[0].kind !== g.sect.tasks[1].kind, g.sect.tasks.map(x => x.kind).join(','));
  // Har bir vazifani o'z yo'li bilan bajarish
  for (const task of [...g.sect.tasks]) {
    if (task.kind === 'hunt') { g.forceEncounter(task.types![0], task.need); g.endEncounter({ result: 'win', hp: g.vitMax, energy: 50, focus: 30, herbsUsed: 0 }); }
    else if (task.kind === 'gather') { if (task.item === 'ore') g.ore += task.need; else g.herb += task.need; }
    else if (task.kind === 'patrol') for (const id of task.places!) { goto(g, id); g.sect.onMove(g); }
    else task.done = true, task.have = task.need;   // qasos: testda qo'lda
  }
  check('vazifalar bajarildi', g.sect.tasks.every(x => x.done || x.kind === 'gather'), g.sect.tasks.map(x => `${x.kind}:${x.have}/${x.need}`).join(' '));
  goto(g, 'qingyun_peak');
  const s0 = g.p.silver;
  check('vazifalarni topshirish', g.turnIn().ok && g.sect.tasks.length === 0 && g.sect.contrib > 0 && g.p.silver >= s0, `(hissa ${g.sect.contrib})`);
  g.sect.contrib += 20;
  const prog0 = g.p.progress;
  check('ustozdan saboq', g.lesson().ok && g.p.progress > prog0);
  check('saboq 7 kunda bir marta', !g.lesson().ok);
  const herb0 = g.herb; check("xazina: 2 o't", g.exchange('herb').ok && g.herb === herb0 + 2);
  check('bazadan tashqarida vazifa olinmaydi', (goto(g, 'river_city'), !g.takeTask().ok));
  const silver1 = g.p.silver; for (let k = 0; k < 64 && !g.over; k++) { g.rest(12); settle(g); }
  check('oylik maosh', g.log.some(l => l.text.includes('oylik ulush')) || g.p.silver > silver1);
  check("sim o'yinchini ko'chirmaydi", g.p.travel === undefined);
  // Saqlash / yuklash
  const b = new Game(2); b.restore(JSON.parse(JSON.stringify(g.toSave())));
  check("a'zolik saqlanadi", b.p.faction === g.p.faction && b.sect.totalContrib === g.sect.totalContrib);
  // O'z a'zosini o'ldirish — haydalish
  goto(g, 'qingyun_peak');
  const victim = g.w.members('qingyun').find(m => m.id !== 'player' && m.id !== g.w.factions.qingyun.leader);
  if (victim) {
    victim.location = 'qingyun_peak'; victim.travel = undefined;
    const [x, y] = npcPos(g.w, victim); [g.tx, g.ty] = tileOf(x, y);
    check("a'zo bilan duel", g.fight(victim.id).ok);
    g.endEncounter({ result: 'win', hp: g.vitMax, energy: 50, focus: 30, herbsUsed: 0, spare: false });
    check("birodarni o'ldirgan haydaladi", !victim.alive && g.p.faction === null && g.sect.tasks.length === 0);
    goto(g, 'qingyun_peak');
    check("haydalgan qayta qo'shila olmaydi", !g.joinFaction('qingyun').ok);
  }
  check('sektadan keyin invariantlar', invariants(g.w).length === 0, invariants(g.w)[0] ?? '');
  // Qaroqchilar yo'li
  const h = new Game(3); goto(h, 'black_wind_camp');
  const gang = h.state().faction.here.find(f => f.ideology === 'demonic');
  if (gang) {
    const s1 = h.p.silver;
    check("qaroqchilarga qo'shilish (40 kumush)", h.joinFaction(gang.id).ok && h.p.role === 'bandit' && h.p.silver === s1 - 40);
    let kinds = new Set<string>(); for (let k = 0; k < 6; k++) { h.sect.tasks = []; h.takeTask(); h.sect.tasks.forEach(x => kinds.add(x.kind)); }
    check("qaroqchi vazifalari", kinds.has('tribute') || kinds.has('rival'), [...kinds].join(','));
    check('tark etish', h.leaveFaction().ok && h.p.faction === null);
  }
}

// ---- Inventar va hunarmandchilik ----
{
  const gotoPlace = (g: Game, id: string) => { const k = g.grid.loc.findIndex((l, i) => l === id && g.grid.t[i] === T.PLACE); g.tx = k % g.grid.cols; g.ty = Math.floor(k / g.grid.cols); g.p.location = id; };
  const g = new Game(8);
  const win = () => g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0 });
  g.forceEncounter('tiger'); win();
  check("yo'lbarsdan suyak va teri", g.inv.count('bone') === 1 && g.inv.count('pelt') >= 1);
  g.forceEncounter('treant'); win();
  check("bossdan ruh o'ti va kristall", g.inv.count('spirit_herb') >= 2 && g.inv.count('crystal') >= 1);
  // Alkimyo: ehtimolli, lekin ko'p urinishda dori chiqadi
  g.herb = 20; let ok = 0;
  for (let k = 0; k < 6; k++) { g.energy = g.energyMax; g.focus = g.focusMax; if (g.craft('heal_pill').ok) ok++; }
  check("alkimyo: shifo dorisi (xom ashyo sarflanadi)", ok === 6 && g.inv.count('heal_pill') >= 1 && g.herb === 8, `(dori ${g.inv.count('heal_pill')}, o't ${g.herb})`);
  { // muvaffaqiyat ulushi alchemyChance ga mos (realm 1 → 68%)
    const a = new Game(9); let made = 0;
    for (let k = 0; k < 200; k++) { a.herb = 2; a.energy = a.energyMax; a.focus = a.focusMax; const before = a.inv.count('heal_pill'); a.craft('heal_pill'); if (a.inv.count('heal_pill') > before) made++; }
    check('alkimyo ehtimoli ~68%', made / 200 > 0.58 && made / 200 < 0.78, `(${made}/200)`);
  }
  g.p.injury = 0.7; check('shifo dorisi davolaydi', g.useItem('heal_pill').ok && g.p.injury < 0.2);
  check("xom ashyosiz yasab bo'lmaydi", !g.craft('spirit_sword').ok);
  // Temirchilik: faqat temirchi bor shaharda
  g.ore = 3; check('temirchilik faqat shaharda', !g.craft('iron_sword').ok && g.ore === 3);
  gotoPlace(g, 'river_city');
  const atk0 = g.forceEncounter('wolf').player!.atk; win();
  check('shaharda temir qilich', g.craft('iron_sword').ok && g.inv.count('iron_sword') === 1 && g.ore === 0);
  check('qilichni kiyish', g.equip('iron_sword').ok && g.inv.equip.weapon === 'iron_sword' && g.inv.count('iron_sword') === 0);
  const atk1 = g.forceEncounter('wolf').player!.atk; win();
  check('qilich hujumni oshiradi', atk1 === atk0 + 4, `(${atk0} → ${atk1})`);
  g.inv.add('pelt', 3); const vit0 = g.vitMax;
  check('teri zirh: vitality va himoya', g.craft('pelt_armor').ok && g.equip('pelt_armor').ok && g.vitMax === vit0 + 15 && g.forceEncounter('wolf').player!.def > 0); win();
  check('yechish', g.unequip('armor').ok && g.inv.count('pelt_armor') === 1 && g.vitMax === vit0);
  // Bozor
  const s0 = g.p.silver;
  check("shahar bozori: o't sotib olish", g.buy('herb').ok && g.p.silver === s0 - 10);
  const s1 = g.p.silver; check('shaharda sotish ×1.3', g.sellItem('pelt_armor').ok && g.p.silver === s1 + Math.round(25 * 1.3));
  check("sotilmaydigan buyumni sotib olib bo'lmaydi", !g.buy('spirit_sword').ok);
  // Temirchi o'lsa, temirxona yopiladi (sim bilan bog'liqlik)
  const smith = Object.values(g.w.npcs).find(n => n.role === 'blacksmith')!;
  kill(g.w, smith, null, 'old_age'); g.ore = 3;
  check("temirchi o'lsa temirchilik yo'q", !g.craft('iron_sword').ok && g.ore === 3);
  // Dorilar: kuch va yutuq
  g.inv.add('power_pill'); g.useItem('power_pill');
  const pw = g.forceEncounter('wolf').player!; win();
  check('kuch dorisi: +25% hujum', pw.power && pw.atk === Math.round((10 + 5 * g.p.realm + 4) * 1.25));
  g.forceEncounter('wolf'); win(); g.forceEncounter('wolf'); win();
  check("kuch dorisi 3 jangdan keyin tugaydi", !g.inv.buffs.power);
  g.inv.add('break_pill'); const pr0 = g.p.progress;
  check('yutuq dorisi', g.useItem('break_pill').ok && g.inv.buffs.breakthrough === true && g.p.progress > pr0);
  check('ikkinchi yutuq dorisi rad etiladi', (g.inv.add('break_pill'), !g.useItem('break_pill').ok));
  // Saqlash/yuklash va eski format
  const save = JSON.parse(JSON.stringify(g.toSave()));
  const b = new Game(8); b.restore(save);
  check('inventar va jihozlar saqlanadi', JSON.stringify(b.inv.toJSON()) === JSON.stringify(g.inv.toJSON()) && b.vitMax === g.vitMax);
  const old = JSON.parse(JSON.stringify(save)); delete old.g.inv; old.g.herb = 5; old.g.ore = 2;
  const c = new Game(8); c.restore(old);
  check('eski saqlash fayli (inventarsiz) yuklanadi', c.herb === 5 && c.ore === 2 && Object.keys(c.inv.equip).length === 0);
  check('inventardan keyin invariantlar', invariants(g.w).length === 0);
}

// ---- Katta dunyo (500×350) ----
{
  const g = new Game(12), G = g.grid;
  check('xarita 175 000 katak', G.t.length === 175000 && COLS * ROWS === 175000);
  const tiers = new Set(G.regions.map(r => r.tier));
  check('hududlar: 1..8 xavf darajalari', [1, 2, 3, 4, 5, 6, 7, 8].every(x => tiers.has(x)) && G.regions[0].tier === 0, `(${G.regions.length} hudud)`);
  check("joylar ko'p va har xil", G.pois.length >= 80 && new Set(G.pois.map(p => p.kind)).size === 8, `(${G.pois.length})`);
  check('joylar yadrodan tashqarida', G.pois.every(p => !(p.tx >= OX && p.tx < OX + CORE_C && p.ty >= OY && p.ty < OY + CORE_R)));
  check('sim manzillari yadroda', Object.values(g.w.locations).filter(l => l.x != null).every(l => { const [c, r] = tileOf(l.x!, l.y!); return G.loc[r * COLS + c] === l.id; }));
  // Hudud darajasi uchrashuv kuchiga ta'sir qiladi
  const far = G.pois.filter(p => p.kind === 'cave').sort((a, b) => b.tier - a.tier)[0];
  g.tx = far.tx; g.ty = far.ty; (g as unknown as { reveal(): void }).reveal();
  const e = g.explore().enc!;
  check("qo'riqchili joyda Z — jang", !!e && e.poi === G.poi[far.ty * COLS + far.tx] - 1 && e.enemies.length === 3);
  const wolf7 = e.enemies.find(x => x.type === 'wolf')!;
  check("yuqori darajadagi yirtqich kuchliroq", far.tier >= 5 && wolf7.hp >= Math.round(34 * (1 + 0.3 * (far.tier - 1))), `(daraja ${far.tier}, bo'ri hp ${wolf7.hp})`);
  const items0 = JSON.stringify(g.inv.items), sp0 = g.sp;
  g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0 });
  check('joy tozalandi va xazina berildi', g.cleared.includes(e.poi!) && g.sp === sp0 + 1 && JSON.stringify(g.inv.items) !== items0);
  check("tozalangan joyda qayta jang yo'q", !g.explore().enc);
  const shrine = G.pois.find(p => p.kind === 'shrine')!;
  check('ibodatxonada qi yuqori', G.qi[shrine.ty * COLS + shrine.tx] >= 60);
  // Bitset va saqlash
  const s2 = JSON.parse(JSON.stringify(g.toSave()));
  check("saqlash ixcham (v2)", s2.v === 2 && typeof s2.g.explored === 'string' && s2.g.explored.length < 40000, `(${s2.g.explored.length} belgi)`);
  const b = new Game(12); b.restore(s2);
  check('bitset aniq tiklanadi', b.explored.every((v, i) => v === g.explored[i]) && b.cleared.length === g.cleared.length);
  // Eski v1 saqlash (50×35) yadroga ko'chiriladi
  const v1 = JSON.parse(JSON.stringify(s2)); v1.v = 1; v1.g.tx = 22; v1.g.ty = 17;
  v1.g.explored = '0'.repeat(CORE_C * CORE_R).split('').map((_, k) => (k === 17 * CORE_C + 22 ? '1' : '0')).join('');
  const c = new Game(12); c.restore(v1);
  check("v1 saqlash ko'chiriladi", c.tx === 22 + OX && c.ty === 17 + OY && c.explored[(17 + OY) * COLS + 22 + OX] === 1);
  // Tezlik: yurish va holat
  const t0 = performance.now(); for (let k = 0; k < 50; k++) { g.move(k % 2 ? 1 : -1, 0); settle(g); } const ms = (performance.now() - t0) / 50;
  const t1 = performance.now(); for (let k = 0; k < 50; k++) g.state(); const sms = (performance.now() - t1) / 50;
  check('yurish va holat tez', ms < 60 && sms < 15, `(yurish ${ms.toFixed(1)} ms, holat ${sms.toFixed(1)} ms)`);
}

// ---- Tashqi dunyo sim'da yashaydi ----
{
  const g = new Game(4), G = g.grid, w = g.w;
  const town = G.pois.find(p => p.kind === 'town')!, tid = town.id;
  const people = w.alive().filter(n => n.home === tid);
  check("shaharda tirik aholi", people.length >= 7 && people.some(n => n.role === 'blacksmith') && people.some(n => n.faction === `guard_${tid}`), `(${people.length} kishi)`);
  check("uyalarda to'dalar", G.pois.filter(p => p.kind === 'hideout').every(p => w.factions[`gang_${p.id}`]?.active));
  check("sim yo'llari bog'langan", G.pois.filter(p => p.kind === 'town' || p.kind === 'village').every(p => w.hoursTo('willow_village', p.id) < Infinity));
  g.tx = town.tx; g.ty = town.ty; g.p.location = tid; (g as unknown as { reveal(): void }).reveal();
  const st = g.state();
  check("o'yinchi shahar aholisini ko'radi", st.npcs.filter(n => Math.max(Math.abs(n.tx - town.tx), Math.abs(n.ty - town.ty)) <= 2).length >= 5);
  check("shahar qo'riqchilariga qo'shilish", st.faction.here.some(f => f.id === `guard_${tid}`) && g.joinFaction(`guard_${tid}`).ok && g.p.role === 'guard');
  g.ore = 3;
  check("shahar temirxonasi", g.craft('iron_sword').ok && g.inv.count('iron_sword') === 1);
  for (const smith of w.alive().filter(n => n.role === 'blacksmith' && n.home === tid)) kill(w, smith, null, 'old_age'); g.ore = 3;   // shaharda bir nechta temirchi bo'lishi mumkin
  check("temirchilar o'lsa shu shahar temirxonasi yopiladi", !g.craft('iron_sword').ok);
  // Bir necha hafta: tashqi to'dalar harakat qiladi
  const outer = new Set(G.pois.map(p => p.id));
  for (let k = 0; k < 40; k++) g.rest(12);
  const ops = w.ops.filter(o => o.faction.startsWith('gang_poi')).length, ev = w.events.filter(e => outer.has(e.location) || e.location.startsWith('road_')).length;
  check("tashqi to'dalar operatsiya rejalashtiradi", ops > 0 && ev > 0, `(${ops} operatsiya, ${ev} voqea)`);
  check('tashqi dunyo invariantlari', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// ---- Tashqi sektalar ----
{
  const g = new Game(3), G = g.grid, w = g.w;
  const sects = G.pois.filter(p => p.kind === 'sect');
  const good = sects.filter(p => !p.evil), evil = sects.filter(p => p.evil);
  check("tashqi sektalar (to'g'ri va iblis)", good.length >= 3 && evil.length >= 1, `(${good.length} + ${evil.length} iblis)`);
  const s = good[0], f = w.factions[`sect_${s.id}`];
  const members = w.members(f.id);
  check('sekta tuzilmasi: rahbar, oqsoqollar, shogirdlar', members.some(m => m.role === 'sect_leader') && members.filter(m => m.role === 'elder').length >= 2 && members.filter(m => m.role.endsWith('disciple')).length >= 6);
  check('ustoz-shogird rishtalari', members.some(m => m.bonds.some(b => b.type === 'master')));
  check('ibodatxonalarda zohidlar', w.alive().filter(n => n.role === 'hermit').length >= 3);
  g.tx = s.tx; g.ty = s.ty; g.p.location = s.id;
  check("tashqi sektaga qo'shilish", g.joinFaction(f.id).ok && g.p.role === 'outer_disciple' && g.sect.cultMult(g) > 1);
  check('sekta vazifasi', g.takeTask().ok);
  const e = evil[0], ef = w.factions[`sect_${e.id}`];
  check('iblis sektasi demonic', ef.ideology === 'demonic' && w.members(ef.id).some(m => m.role === 'sect_leader'));
  check("sektada mashq: qi yuqori", G.qi[s.ty * G.cols + s.tx] >= 60 && w.locations[s.id].qi === 2);
}

// ---- Sektalararo diplomatiya ----
{
  const g = new Game(4), w = g.w;
  const sects = Object.values(w.factions).filter(f => f.active && f.ideology === 'righteous' && f.id.startsWith('sect_'));
  let pair: [typeof sects[0], typeof sects[0]] | null = null;
  for (const a of sects) for (const b of sects) if (!pair && a.id < b.id && w.hoursTo(a.base, b.base) <= 48) pair = [a, b];
  check('qo\'shni sektalar juftligi bor', !!pair);
  if (pair) {
    const [a, b] = pair;
    a.allies = []; b.allies = []; a.tension[b.id] = 95; b.tension[a.id] = 95;
    for (let k = 0; k < 40 && !a.wars?.includes(b.id); k++) diplomacy(w);
    check('yuqori taranglik — urush', !!a.wars?.includes(b.id) && !!b.wars?.includes(a.id) && w.events.some(e => e.type === 'war_declared'));
    g.tx = g.grid.pois.find(p => p.id === a.base)!.tx; g.ty = g.grid.pois.find(p => p.id === a.base)!.ty; g.p.location = a.base;
    g.joinFaction(a.id);
    let kinds = new Set<string>(); for (let k = 0; k < 8; k++) { g.sect.tasks = []; g.takeTask(); g.sect.tasks.forEach(x => kinds.add(x.title.startsWith('Urush') ? 'war' : x.kind)); }
    check('urush vazifasi', kinds.has('war'), [...kinds].join(','));
    check('zalda urush ko\'rinadi', g.state().faction.wars.includes(b.name));
    a.tension[b.id] = 30; b.tension[a.id] = 30; diplomacy(w);
    check('taranglik pasaysa — sulh', !a.wars?.includes(b.id) && w.events.some(e => e.type === 'peace_made'));
    check('diplomatiya invariantlari', invariants(w).length === 0, invariants(w)[0] ?? '');

    // Musobaqa: 8-kuni e'lon, o'yinchi chempion bo'ladi, 15-kuni natija o'yinchi g'alabasi bilan
    for (const f of Object.values(w.factions)) delete f.tourney;
    w.h = (Math.ceil((w.day + 1) / 30) * 30 + 8) * 24; diplomacy(w);
    check("musobaqa e'lon qilinadi", w.events.some(e => e.type === 'tournament_announced') && Object.values(w.factions).filter(f => f.tourney).length === 2);
    for (const f of Object.values(w.factions)) delete f.tourney;
    a.tourney = { vs: b.id, day: w.day + 7, host: true }; b.tourney = { vs: a.id, day: w.day + 7, host: false };
    g.sect.tasks = [];
    const c0 = g.sect.contrib, enc = g.tournamentFight().enc;
    check('chempion jangi boshlanadi', enc?.kind === 'tournament' && enc.npcId !== undefined && w.npc(enc.npcId)?.faction === b.id);
    g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0 });
    check("g'alaba sektaga yoziladi", a.tourney?.player === 'win' && g.sect.contrib === c0 + 30 && w.npc(enc!.npcId!)!.alive, `${a.tourney?.player} ${g.sect.contrib - c0} ${w.npc(enc!.npcId!)!.alive}`);
    check('ikki marta bellashib bo\'lmaydi', !g.tournamentFight().ok);
    check('zalda musobaqa ko\'rinadi', g.state().faction.tourney?.player === 'win');
    w.h = a.tourney!.day * 24; diplomacy(w);
    const te = w.events.filter(e => e.type === 'tournament').pop();
    check("musobaqa kuni o'yinchi g'olib deb e'lon qilinadi", te?.subject === 'player' && te.data?.winner === a.id && !a.tourney && !b.tourney);
    check('musobaqadan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
  }
}

// ---- Joy xizmatlari: taverna, mehmonxona, noyob savdo, risolalar, teleport ----
{
  const g = new Game(6), G = g.grid, w = g.w;
  const at = (id: string) => { const p = G.pois.find(x => x.id === id)!; g.tx = p.tx; g.ty = p.ty; g.p.location = id; (g as unknown as { reveal(): void }).reveal(); };
  const town = G.pois.find(p => p.kind === 'town' && w.alive().some(n => n.home === p.id && n.role === 'merchant'))!;
  at(town.id); g.p.silver = 5000;
  const P = g.state().place!;
  check('shaharda xizmatlar', !!P && ['tavern', 'inn', 'market', 'forge', 'library', 'teleport'].every(s => P.services.includes(s as never)), P?.services.join(','));
  const exp0 = g.explored.reduce((a, b) => a + b, 0);
  check('taverna mish-mishi joy ochadi', g.rumor().ok && g.explored.reduce((a, b) => a + b, 0) > exp0 && g.log.some(l => l.text.startsWith('Mish-mish')));
  g.energy = 1; g.p.injury = 0.5;
  check('mehmonxona tiklaydi', g.innRest().ok && g.energy === g.energyMax && g.p.injury <= 0.2 + 1e-9);
  const stock = P.rare!;
  check("noyob savdo (savdogar bor)", !!stock.seller && stock.items.length >= 2);
  const it = stock.items[0], c0 = g.inv.count(it.id);
  check('noyob tovar sotib olish', g.buyRare(it.id).ok && g.inv.count(it.id) === c0 + 1 && g.state().place!.rare!.items[0].left === it.left - 1);
  check('risola sotib olish va o\'qish', g.buyManual('manual_combat').ok && (() => { const sp = g.sp; return g.useItem('manual_combat').ok && g.sp === sp + 1; })());
  const tps = g.state().place!.teleport!;
  const unknown = tps.find(x => !x.known);
  if (unknown) check("noma'lum joyga teleport yo'q", !g.teleport(unknown.id).ok);
  const dest = tps.find(x => x.id === 'river_city' || x.id === 'qingyun_peak') ?? tps[0];
  g.explored[dest.ty * G.cols + dest.tx] = 1;
  const s0 = g.p.silver;
  check("ma'lum joyga teleport", g.teleport(dest.id).ok && g.tx === dest.tx && g.ty === dest.ty && g.p.silver === s0 - dest.cost, dest.name);
  for (const m of w.alive().filter(n => n.home === town.id && n.role === 'merchant')) kill(w, m, null, 'old_age');
  at(town.id);
  check("savdogar o'lsa noyob savdo yo'q", !g.state().place!.rare!.seller);
  const b = new Game(6); b.restore(JSON.parse(JSON.stringify(g.toSave())));
  check('noyob xaridlar saqlanadi', JSON.stringify(b.placeBought) === JSON.stringify(g.placeBought));
  check('joy xizmatlaridan keyin invariantlar', invariants(w).length === 0);
}

// ---- Tirik dunyo, 1-bosqich: kalendar, ob-havo, maqsadlar, kayfiyat, NPC paneli ----
{
  const g = new Game(7), w = g.w;
  w.weather = { kind: 'storm', since: w.day };
  const b = new Game(7); b.restore(JSON.parse(JSON.stringify(g.toSave())));
  check('ob-havo saqlanadi', b.w.weather.kind === 'storm');
  const mer = w.alive().find(x => x.role === 'merchant' && !x.travel && w.tradePartner(x.home))!;
  const dest = w.tradePartner(mer.home)!, clearH = w.travelTime(w.nodeOf(mer), dest);
  w.startTravel(mer, dest, 'test');
  const stormH = mer.travel!.legs.reduce((s, l) => s + l.hours, 0);
  check("bo'ronda yo'l uzoqroq", stormH > clearH, `${clearH}→${stormH} soat`);
  w.weather = { kind: 'clear', since: w.day };

  const d = w.alive().find(x => x.role === 'outer_disciple' && !x.player)!;
  d.goals.push({ type: 'rank_up', target: 'inner_disciple', since: w.day }); d.role = 'inner_disciple'; ambitions(w);
  check('unvon orzusi bajariladi', !d.goals.some(x => x.type === 'rank_up') && w.events.some(e => e.type === 'ambition_fulfilled' && e.subject === d.id));
  const f = w.alive().find(x => x.role === 'farmer' && w.alive().filter(o => o.home === x.home && o.role === 'merchant').length < 2)!;
  f.goals.push({ type: 'wealth', amount: 100, since: w.day }); f.silver = 200; ambitions(w);
  check("dehqon pul yig'ib do'kon ochadi", f.role === 'merchant' && w.events.some(e => e.type === 'opened_shop' && e.subject === f.id));
  const m = w.alive().find(x => !x.player && x.id !== f.id)!; m.injury = 0.8; m.needs.hunger = 90;
  check('yarador va och NPC kayfiyati yomon', mood(w, m).v < 0.3, mood(w, m).label);

  const seen = g.state().npcs.find(x => !w.npcs[x.id].memories.some(mm => mm.subject === 'player'));
  if (seen) {
    const npc = w.npcs[seen.id], i1 = g.npcInfo(seen.id)!;
    check("NPC paneli: begonaning maqsadi yashirin", !!i1 && (i1.known || i1.goals === null), i1?.relLabel);
    addMemory(w, npc, { type: 'saved_life', subject: 'player', object: npc.id, day: w.day, location: npc.location, source: 'witnessed', confidence: 1 });
    const i2 = g.npcInfo(seen.id)!;
    check("qutqarilgan NPC ishonadi, maqsadini ochadi va eslaydi", i2.known && i2.goals !== null && i2.memories.length > 0 && i2.rel.debt > 0, i2.relLabel);
  } else check("NPC paneli: ko'rinadigan NPC bor", false);
  check("ko'rinmaydigan NPC haqida ma'lumot yo'q", g.npcInfo(w.alive().find(x => !x.player && !g.state().npcs.some(s => s.id === x.id))!.id) === null);
  check("holatda fasl va ob-havo", !!g.state().season && !!g.state().weather.icon);
  check('1-bosqichdan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// ---- Tirik dunyo, 2-bosqich: oila, aholi punkti iqtisodi, narxlar ----
{
  const g = new Game(8), w = g.w;
  runDays(w, 1);
  const E = econ(w);
  const vil = w.settlements().find(id => w.locations[id].kind === 'village' && residentsOf(w, id).some(n => n.bonds.some(b => b.type === 'spouse')))!;
  const a = residentsOf(w, vil).find(n => n.bonds.some(b => b.type === 'spouse'))!, b = w.npcs[a.bonds.find(x => x.type === 'spouse')!.other];
  const kids0 = a.bonds.filter(x => x.type === 'family').length;
  const c = bear(w, a, b, vil);
  check("bola tug'iladi: ota-ona bilan bog'langan, xarakter meros", c.role === 'child' && c.age === 0 && c.home === vil && a.bonds.filter(x => x.type === 'family').length === kids0 + 1
    && c.bonds.some(x => x.other === b.id) && Math.abs(c.traits.honor - (a.traits.honor + b.traits.honor) / 2) <= 0.19);
  { const [cx, cy] = tileOf(...npcPos(w, c)); g.tx = cx; g.ty = cy; const r = g.fight(c.id); check("bolaga hujum qilib bo'lmaydi", !r.ok && r.msg.includes('Bola') && !g.enc, r.msg); }
  c.age = 16; family(w);
  check('16 yoshda kasb tanlaydi', c.role !== 'child' && w.events.some(e => e.type === 'came_of_age' && e.subject === c.id), c.role);
  a.silver = 100; const bs = b.silver; kill(w, a, null, 'old_age');
  check("meros turmush o'rtog'iga va farzandlarga", b.silver > bs && w.events.some(e => e.type === 'inheritance' && e.subject === a.id));
  check('yaqinlari motam tutadi', b.memories.some(m => m.type === 'mourned' && m.subject === a.id));

  const s = E.s[vil], sec0 = s.security;
  w.emit({ type: 'raid', location: vil, subject: 'x', object: 'y', data: { loot: 0, killed: 0, victims: [] } }); economy(w);
  check('bosqin xavfsizlikni pasaytiradi, yo\'lni xavfli qiladi', s.security < sec0 && (E.danger[vil] ?? -1) >= w.day);
  s.food = 0; economy(w);
  check("oziq tugasa — ocharchilik, don qimmat", s.famine !== undefined && s.prices.food > 1.3 && w.events.some(e => e.type === 'famine' && e.location === vil), `×${s.prices.food}`);
  // O'yinchi bozori joy narxlariga bog'liq
  const town = g.grid.pois.find(p => p.kind === 'town')!;
  g.tx = town.tx; g.ty = town.ty; g.p.location = town.id; g.p.silver = 1000;
  E.s[town.id].prices.medicine = 2;
  const herb = g.state().inventory.market!.buy.find(x => x.id === 'herb')!;
  check('dori taqchil — o\'t narxi ikki barobar', herb.buy === 20, String(herb.buy));
  const s0 = g.p.silver; g.buy('herb');
  check("xarid joy narxida", g.p.silver === s0 - 20);
  check("joy panelida holat va narxlar", !!g.state().place?.settle && g.state().place!.settle!.prices.length === 6);
  const b2 = new Game(8); b2.restore(JSON.parse(JSON.stringify(g.toSave())));
  check('iqtisod saqlanadi', b2.w.econ!.s[vil].famine === s.famine && b2.w.econ!.s[town.id].prices.medicine === 2);
  check('2-bosqichdan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// ---- Tirik dunyo, 3-bosqich: jinoyat, mukofot, obro', hudud ----
{
  const g = new Game(9), w = g.w;
  runDays(w, 1);
  const gang = Object.values(w.factions).find(f => f.active && f.ideology === 'demonic' && f.leader && w.members(f.id).length >= 3)!;
  const vil = w.ofKind('village').filter(v => w.locations[v].owner && w.locations[v].owner !== gang.id && lawFaction(w, v)).sort((a, b) => w.hoursTo(gang.base, a) - w.hoursTo(gang.base, b))[0];
  const chief = w.npcs[gang.leader!];
  w.emit({ type: 'raid', location: vil, subject: chief.id, object: gang.id, data: { loot: 0, killed: 0, victims: [] } }); lawDaily(w);
  check("bosqinchi boshiga mukofot e'lon qilinadi", bountiesOn(w, chief.id).length > 0, String(bountiesOn(w, chief.id)[0]?.reward));
  // Bosib olish: 30 kunda 3 bosqin
  const owner0 = w.locations[vil].owner;
  w.emit({ type: 'raid', location: vil, subject: chief.id, object: gang.id, data: { loot: 0, killed: 0, victims: [] } });
  w.emit({ type: 'raid', location: vil, subject: chief.id, object: gang.id, data: { loot: 0, killed: 0, victims: [] } });
  territory(w);
  check("3 bosqindan keyin qishloq bosib olinadi", w.locations[vil].owner === gang.id && terr(w).held[vil]?.prev === owner0 && w.events.some(e => e.type === 'territory_seized' && e.location === vil));
  const b2 = new Game(9); b2.restore(JSON.parse(JSON.stringify(g.toSave())));
  check('bosib olish va mukofotlar saqlanadi', b2.w.locations[vil].owner === gang.id && bountiesOn(b2.w, chief.id).length > 0);
  // O'yinchi bosqinchilarni qishloqda yengadi → mukofot, ozodlik, obro'
  const s0 = g.p.silver, reward = bountiesOn(w, chief.id).reduce((a, b) => a + b.reward, 0);
  chief.location = vil; kill(w, chief, 'player', 'duel');
  check("nishonni o'ldirgan mukofotni oladi", g.p.silver === s0 + reward && !bountiesOn(w, chief.id).length && w.events.some(e => e.type === 'bounty_claimed' && e.subject === 'player'));
  if (terr(w).held[vil]) { terr(w).held[vil].control = 5; const bandit = w.members(gang.id).find(n => !n.player)!; liberateHit(w, vil, gang.id, bandit.realm); }   // boshliq o'limi o'zi ozod qilgan bo'lishi mumkin
  check("bosqinchilarni qishloqda yengish — qishloq ozod", w.locations[vil].owner === owner0 && !terr(w).held[vil] && w.events.some(e => e.type === 'territory_liberated' && e.location === vil && e.subject === 'player'));
  const rep = repAt(w, vil);
  check("ozod qilingan qishloqda obro' yuqori", rep.score >= 18 && rep.known > 0, `${rep.label} ${rep.score}`);
  // Guvohlar oldida begunohni o'ldirish → qidiruv
  const victim = w.alive().find(n => n.home === vil && n.role === 'farmer' && !n.faction && w.at(n.location).filter(o => o.id !== n.id).length > 0)
    ?? w.alive().find(n => n.role === 'farmer' && !n.faction && w.at(n.location).filter(o => o.id !== n.id && !o.player).length > 0)!;
  const lf = lawFaction(w, w.nodeOf(victim));
  kill(w, victim, 'player', 'duel');
  check("guvohlar oldida qotillik — o'yinchi qidiruvda", bountiesOn(w, 'player').some(b => b.reason === 'murder' && b.issuer === lf));
  // Hibsga olish: qo'riqchi yonida
  const guard = w.members(lf!).find(n => n.role === 'guard' || n.role === 'guard_captain')!;
  const [gx, gy] = tileOf(...npcPos(w, guard)); g.tx = gx; g.ty = gy; guard.travel = undefined; guard.injury = 0;
  for (let k = 0; k < 10 && !g.enc; k++) (g as unknown as { lawCheck(): void }).lawCheck();
  check("qo'riqchi hibsga olishga urinadi", !!g.enc && g.enc.arrest === lf);
  g.p.silver = 500;
  g.endEncounter({ result: 'lose', hp: 0, energy: 0, focus: 0, herbsUsed: 0 });
  check("hibsdan keyin jarima undiriladi, qidiruv bekor", g.p.silver < 500 && !bountiesOn(w, 'player').some(b => b.issuer === lf));
  // Jarimani to'lash (joy panelida)
  kill(w, w.alive().find(n => n.role === 'farmer' && !n.faction && w.at(n.location).filter(o => o.id !== n.id && !o.player).length > 0)!, 'player', 'duel');
  const iss = bountiesOn(w, 'player')[0]?.issuer, base = iss ? w.factions[iss].base : '';
  const ti = g.grid.loc.findIndex((l, i) => l === base && g.grid.t[i] === T.PLACE);
  const town = ti >= 0 ? { tx: ti % COLS, ty: Math.floor(ti / COLS), id: base } : null;
  if (town) {
    g.tx = town.tx; g.ty = town.ty; g.p.location = town.id; g.p.silver = 2000;
    const st = g.state().place!;
    check("joy panelida qidiruv, jarima va e'lonlar taxtasi", !!st.law && st.law.fine > 0 && st.law.rep.wanted > 0 && st.law.board.some(b => b.you));
    check("qidiruvdagini mehmonxonaga kiritishmaydi", !g.innRest().ok);
    check("jarimani to'lash qidiruvni bekor qiladi", g.payFine().ok && g.state().place!.law!.fine === 0);
  } else check("jarima uchun shahar topildi", false, JSON.stringify(bountiesOn(w, 'player').map(b => [b.issuer, b.reason, w.factions[b.issuer]?.ideology, w.factions[b.issuer]?.base])));
  check('3-bosqichdan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
  void ownerOf;
}

// ---- Tirik dunyo, 4-bosqich: iste'dod, uslublar, ustozdan uzatish, yorilish, risola ----
{
  const g = new Game(10), w = g.w;
  cultInit(w);
  const leader = w.npcs[Object.values(w.factions).find(f => f.active && f.ideology === 'righteous' && f.leader)!.leader!];
  check("sekta rahbari sirli san'atni biladi, kuchi uslubdan oshgan", !!leader.techs?.some(id => techOf(w, id)?.secret) && (leader.tp ?? 1) > 1.1, String(leader.tp));
  check("har NPC'da iste'dod turi bor", w.alive().every(n => !!n.aff));
  const d = w.alive().find(n => n.role === 'outer_disciple' && n.bonds.some(b => b.type === 'master'))!;
  const m = w.npcs[d.bonds.find(b => b.type === 'master')!.other];
  const art = m.techs!.find(id => !d.techs!.includes(id) && !techOf(w, id)!.secret);
  if (art) {
    for (let k = 0; k < 20 && !d.techs!.includes(art); k++) cultivationMonthly(w);
    check("ustoz shogirdga uslub o'rgatadi", d.techs!.includes(art));
  }
  const p0 = basePower(d), t3 = ['t_sky_splitter', 't_diamond_body', 't_seven_stars', 't_dragon_fist'].find(id => techOf(w, id)!.aff === d.aff)!; learn(w, d, t3, null, 'manual');   // iste'dodga mos uslub
  check("iste'dodga mos III darajali uslub kuchni oshiradi", basePower(d) > p0 * 1.2, `${p0.toFixed(1)} → ${basePower(d).toFixed(1)}`);
  const risky = { ...d, realm: 6, injury: 0.6, traits: { ...d.traits, discipline: 0.1 } };
  check("yuqori bosqichda jarohatli yorilish — o'lim xavfi bor", deviationDeath(risky, 0.1) && !deviationDeath({ ...risky, realm: 1 }, 0));
  // O'yinchi NPC'ga risola beradi
  const near = g.state().npcs.find(x => w.isMartial(w.npcs[x.id]) || w.npcs[x.id].role !== 'child')!;
  const n = w.npcs[near.id], [nx, ny] = tileOf(...npcPos(w, n)); g.tx = nx; g.ty = ny;
  g.inv.add('manual_ancient', 1);
  const q0 = basePower(n), r = g.giveManual(n.id, 'manual_ancient');
  check("risola berilgan NPC uslub o'rganadi va kuchayadi", r.ok && basePower(n) > q0 && g.inv.count('manual_ancient') === 0, `${q0.toFixed(1)} → ${basePower(n).toFixed(1)}`);
  check("risola bergan o'yinchini ustoz sifatida eslaydi", n.memories.some(mm => mm.type === 'taught' && mm.subject === 'player') && g.npcInfo(n.id)!.techs.length > 0);
  const b2 = new Game(10); b2.restore(JSON.parse(JSON.stringify(g.toSave())));
  check("uslublar saqlanadi", JSON.stringify(b2.w.npcs[n.id].techs) === JSON.stringify(n.techs) && b2.w.npcs[n.id].tp === n.tp && !!b2.w.techs);
  check('4-bosqichdan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// ---- Tirik dunyo, 5-bosqich: paydo bo'luvchi iltimoslar va kechikkan oqibatlar ----
{
  const g = new Game(12), w = g.w;
  runDays(w, 1);
  const goTo = (n: { id: string }) => { const [x, y] = tileOf(...npcPos(w, w.npcs[n.id])); g.tx = x; g.ty = y; };
  const gang = Object.values(w.factions).find(f => f.active && f.ideology === 'demonic' && w.members(f.id).length >= 4)!;
  const merchants = w.alive().filter(n => n.role === 'merchant' && !n.player).slice(0, 2);
  w.emit({ type: 'ambush', location: w.tradeRoads()[0], subject: gang.leader!, object: gang.id, data: { loot: 0, killed: 0, victims: merchants.map(m => m.id) } });
  questsDaily(w);
  const cq = openQuests(w).filter(q => q.kind === 'caravan' && q.gang === gang.id);
  check("karvon talansa — savdogar iltimos qiladi", cq.length === 2, String(cq.length));
  // bajarilmasa: savdogar kambag'allashadi, do'kon yopiladi
  const [q1, q2] = cq, m2 = w.npcs[q2.giver]; m2.silver = 100; q2.due = w.day - 1;
  questsDaily(w);
  check("yordam bo'lmasa — savdogar kambag'allashib do'konini yopadi", q2.status === 'failed' && m2.silver === 50 && m2.role === 'farmer' && w.events.some(e => e.type === 'shop_closed' && e.subject === m2.id));
  // o'yinchi to'da a'zosini yengadi → iltimos bajarildi, mukofot
  g.takeQuest(q1.id);
  const bandit = w.members(gang.id).find(n => n.id !== gang.leader && !n.opId)!; bandit.travel = undefined; goTo(bandit);
  const s0 = g.p.silver, giverSilver = w.npcs[q1.giver].silver;
  check("to'da a'zosi bilan jang", g.fight(bandit.id).ok && !!g.enc);
  g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0, spare: false });
  check("karvon iltimosi bajarildi, mukofot olindi", q1.status === 'done' && q1.solver === 'player' && g.p.silver > s0 && w.npcs[q1.giver].silver < giverSilver);
  check("to'da a'zosini o'ldirgach — qasoskor rejalashtirildi", book(w).later.some(l => l.kind === 'vendetta' && l.gang === gang.id));
  // qasoskor keladi
  book(w).later.forEach(l => { if (l.kind === 'vendetta') l.at = w.h + 1; });
  for (let k = 0; k < 12 && !g.enc; k++) g.rest(4);
  check("kunlar o'tib to'da qasoskor yuboradi", !!g.enc && g.enc.title.startsWith('Qasoskor'), g.enc?.title);
  if (g.enc) g.endEncounter({ result: 'win', hp: g.vitMax, energy: g.energy, focus: g.focus, herbsUsed: 0, spare: true });
  // O'g'rilik tergovi: guvohsiz o'g'rilik → iltimos → so'rab-surishtirish → ayblash
  const civ = (id: string) => residentsOf(w, id).filter(n => n.role !== 'child' && !n.player && !n.faction);   // o'g'rilar fraksiyasiz odamlardan chiqadi
  const vil = w.settlements().find(id => civ(id).length >= 6)!;
  const ppl = civ(vil);
  const [victim, thief, innocent, ...others] = ppl;
  w.emit({ type: 'theft', location: vil, subject: thief.id, object: victim.id, data: { amount: 30, seen: false }, secret: true });
  questsDaily(w);
  const tq = openQuests(w).find(q => q.kind === 'theft' && q.giver === victim.id)!;
  check("guvohsiz o'g'rilik — tergov iltimosi", !!tq && tq.target === thief.id);
  g.takeQuest(tq.id);
  for (const o of [...others, innocent]) { if (tq.clues!.length) break; o.travel = undefined; goTo(o); g.energy = g.energyMax; g.focus = g.focusMax; g.talk(o.id); g.talk(o.id); }
  check("so'rab-surishtirish ishora beradi", tq.clues!.length > 0, tq.clues![0]);
  innocent.travel = undefined; goTo(innocent);
  g.accuseNpc(innocent.id, tq.id);
  check("noto'g'ri ayblov — begunoh ranjiydi", tq.wrong === 1 && tq.status === 'open' && innocent.memories.some(m => m.type === 'insulted' && m.subject === 'player'));
  thief.travel = undefined; thief.silver = 40; const v0 = victim.silver; goTo(thief);
  g.accuseNpc(thief.id, tq.id);
  check("to'g'ri ayblov — o'g'irlangan qaytadi, o'g'ri qidiruvda, jabrlanuvchi mukofot to'laydi", tq.status === 'done' && thief.silver < 20 && Math.abs(victim.silver - (v0 + 30 - tq.reward)) < 5 && bountiesOn(w, thief.id).length > 0);   // ayblovdan keyin 1 soat o'tadi (ovqat/ish)
  // Ocharchilik: don olib berish
  const fv = w.settlements().find(id => id !== vil && w.locations[id].kind === 'village' && residentsOf(w, id).length >= 3)!;
  econ(w).s[fv].food = 0; economy(w); questsDaily(w);
  const rq = openQuests(w).find(q => q.kind === 'relief' && q.place === fv);
  const ti = g.grid.loc.findIndex((l, i) => l === fv && g.grid.t[i] === T.PLACE); g.tx = ti % COLS; g.ty = Math.floor(ti / COLS); g.p.location = fv; g.p.silver = 500;
  check("ocharchilikda don olib berish — iltimos bajarildi", !!rq && g.donateRelief().ok && rq!.status === 'done' && econ(w).s[fv].food > 5);
  // Shon-shuhrat: sekta taklifi → ichki shogird
  const sect = Object.values(w.factions).find(f => f.active && f.ideology === 'righteous' && !f.parent)!;
  book(w).invites[sect.id] = w.day;
  const bi = g.grid.loc.findIndex((l, i) => l === sect.base && g.grid.t[i] === T.PLACE); g.tx = bi % COLS; g.ty = Math.floor(bi / COLS); g.p.location = sect.base;
  if (g.p.faction) g.leaveFaction();
  check("taklif qilgan sektaga ichki shogird bo'lib kirish", g.joinFaction(sect.id).ok && g.p.role === 'inner_disciple', g.p.role);
  const b2 = new Game(12); b2.restore(JSON.parse(JSON.stringify(g.toSave())));
  check('iltimoslar saqlanadi', b2.w.quests!.list.length === book(w).list.length);
  check('5-bosqichdan keyin invariantlar', invariants(w).length === 0, invariants(w)[0] ?? '');
}

// Saqlangan holat va intel ishlaydi
const g = new Game(5); g.rest(12);
const intel = g.intel();
check('intel ishlaydi', Array.isArray(intel.events) && Array.isArray(intel.letters));
process.exit(failed ? 1 : 0);
