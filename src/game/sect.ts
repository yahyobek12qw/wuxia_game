// Fraksiyaga a'zolik: qo'shilish, vazifalar, hissa (contribution), saboq, xazina, maosh.
// Vazifalar sim holatidan tuziladi (masalan, qasos vazifasi — sim'dagi haqiqiy qotil).
import { book } from '../sim/quests.js';
import type { Faction, NPC } from '../core/types.js';
import { addMemory, rel } from '../sim/memory.js';
import { threshold } from '../sim/npcAI.js';
import { T } from './terrain.js';
import type { Game, ActResult } from './game.js';

export const RANK_NAME: Record<string, string> = {
  outer_disciple: 'Tashqi shogird', inner_disciple: 'Ichki shogird', elder: 'Oqsoqol', sect_leader: 'Sekta rahbari',
  bandit: 'Qaroqchi', bandit_lieutenant: "Boshliq o'rinbosari", bandit_chief: 'Boshliq', guard: "Qo'riqchi", guard_captain: 'Kapitan', magistrate: 'Hokim', wanderer: 'Sargardon',
};
const STIPEND: Record<string, number> = { outer_disciple: 15, inner_disciple: 30, elder: 60, sect_leader: 100, bandit: 12, bandit_lieutenant: 25, bandit_chief: 60, guard: 20, guard_captain: 40, magistrate: 80 };
const ENTRY_ROLE = { righteous: 'outer_disciple', demonic: 'bandit', neutral: 'guard' } as const;
const PATROL_POOL = ['willow_village', 'river_road', 'black_forest', 'mountain_path', 'river_city', 'hidden_cave', 'black_wind_camp', 'qingyun_peak'];
export const EXCHANGE = { sp: { cost: 40, name: "1 ko'nikma ochkosi" }, herb: { cost: 8, name: "2 ta shifobaxsh o't" }, heal: { cost: 4, name: "To'liq davolanish" } } as const;
const LESSON_COST = 5, LESSON_EVERY = 7, MAX_TASKS = 2, TASK_DAYS = 20;

export type TaskKind = 'hunt' | 'gather' | 'patrol' | 'avenge' | 'tribute' | 'rival';
export interface Task {
  id: number; kind: TaskKind; title: string; desc: string; faction: string; need: number; have: number; done: boolean; until: number;
  types?: string[]; item?: 'herb' | 'ore' | 'silver'; target?: string; targetFaction?: string; places?: string[]; visited?: string[];
  reward: { contrib: number; silver: number };
}

export class Sect {
  contrib = 0; totalContrib = 0; tasks: Task[] = []; taskSeq = 0; lastStipendDay = 0; lastLessonDay = -99; joinedDay = -1;

  toJSON() { return { contrib: this.contrib, totalContrib: this.totalContrib, tasks: this.tasks, taskSeq: this.taskSeq, lastStipendDay: this.lastStipendDay, lastLessonDay: this.lastLessonDay, joinedDay: this.joinedDay }; }
  static from(o: Partial<ReturnType<Sect['toJSON']>> | null | undefined): Sect { return Object.assign(new Sect(), o ?? {}); }

  // ---------- Yordamchilar ----------
  private own(g: Game): Faction | null { const f = g.p.faction ? g.w.factions[g.p.faction] : undefined; return f?.active ? f : null; }
  /** O'yinchi turgan joyda bazasi bo'lgan faol fraksiyalar. */
  factionsHere(g: Game): Faction[] {
    const loc = g.grid.loc[g.i];
    if (!loc || g.grid.t[g.i] !== T.PLACE) return [];
    return Object.values(g.w.factions).filter(f => f.active && f.base === loc);
  }
  private atOwnBase(g: Game): Faction | null { const f = this.own(g); return f && this.factionsHere(g).includes(f) ? f : null; }
  /** O'yinchi fraksiya a'zolaridan birini o'ldirganmi? */
  private killedMembers(g: Game, fid: string): number { return Object.values(g.w.npcs).filter(n => !n.alive && n.killer === 'player' && n.faction === fid).length; }

  canJoin(g: Game, f: Faction): { ok: boolean; why: string } {
    const p = g.p;
    if (p.faction === f.id) return { ok: false, why: "Siz allaqachon a'zosiz." };
    if (p.faction && g.w.factions[p.faction]?.active) return { ok: false, why: 'Avval hozirgi fraksiyangizni tark eting.' };
    if (this.killedMembers(g, f.id)) return { ok: false, why: "Siz ularning a'zosini o'ldirgansiz. Eshik yopiq." };
    const leader = g.w.npc(f.leader);
    if (leader?.alive && rel(leader, 'player', g.w).trust < -0.3) return { ok: false, why: `${leader.name} sizga ishonmaydi.` };
    if (f.ideology === 'righteous' && p.realm < 1) return { ok: false, why: 'Kamida Qi tozalash (I) bosqichi kerak.' };
    if (f.ideology === 'demonic' && p.silver < 40) return { ok: false, why: "Qo'shilish uchun 40 kumush o'lpon kerak." };
    const isSect = g.w.locations[f.base]?.kind === 'sect';
    return { ok: true, why: f.ideology === 'demonic' ? (isSect ? "40 kumush o'lpon to'lab, iblis sektasiga shogird bo'lasiz." : "40 kumush o'lpon to'laysiz.") : f.ideology === 'righteous' ? 'Tashqi shogird sifatida qabul qilinasiz.' : "Qo'riqchi sifatida xizmatga olinasiz." };
  }

  // ---------- Qo'shilish / tark etish ----------
  join(g: Game, fid: string): ActResult {
    const f = this.factionsHere(g).find(x => x.id === fid);
    if (!f) return { ok: false, msg: "Fraksiya bazasida bo'lishingiz kerak." };
    const c = this.canJoin(g, f); if (!c.ok) return { ok: false, msg: c.why };
    const p = g.p;
    if (f.ideology === 'demonic') { p.silver -= 40; f.silver += 40; }
    const invited = g.w.day - (book(g.w).invites[f.id] ?? -999) <= 60;   // shon-shuhrat taklifi: ichki shogird bo'lib kiradi
    p.faction = f.id; g.w.dirty(); p.role = g.w.locations[f.base]?.kind === 'sect' ? (invited ? 'inner_disciple' : 'outer_disciple') : ENTRY_ROLE[f.ideology]; p.home = f.base;
    Object.assign(this, new Sect(), { joinedDay: g.w.day, lastStipendDay: g.w.day });
    g.w.emit({ type: 'joined', location: f.base, subject: 'player', object: f.id, data: { role: p.role } });
    const leader = g.w.npc(f.leader);
    if (leader?.alive) addMemory(g.w, leader, { type: 'helped', subject: 'player', object: leader.id, day: g.w.day, location: f.base, source: 'witnessed', confidence: 0.5, importance: 0.2, origin: `join_${f.id}_${g.w.day}` });
    g.say(`${f.name}ga qo'shildingiz: ${RANK_NAME[p.role]}. Bazada vazifa oling (G).`, 'good');
    return { ok: true, msg: '' };
  }

  private drop(g: Game, reason: 'left' | 'expelled' | 'gone'): void {
    const p = g.p, f = p.faction ? g.w.factions[p.faction] : undefined;
    if (f && reason !== 'gone') {
      for (const m of g.w.members(f.id)) if (m.id !== 'player' && (reason === 'expelled' || m.id === f.leader))
        addMemory(g.w, m, { type: 'betrayed', subject: 'player', object: m.id, day: g.w.day, location: f.base, source: 'heard', confidence: reason === 'expelled' ? 0.9 : 0.5, origin: `${reason}_player_${f.id}_${g.w.day}` });
      if (reason === 'expelled') g.w.emit({ type: 'expelled', location: f.base, subject: 'player', object: f.id });
    }
    p.faction = null; g.w.dirty(); p.role = 'wanderer'; p.home = 'willow_village';
    this.tasks = []; this.contrib = 0;
  }
  leave(g: Game): ActResult {
    const f = this.own(g); if (!f) return { ok: false, msg: "Siz hech qaysi fraksiyada emassiz." };
    this.drop(g, 'left'); g.say(`${f.name}ni tark etdingiz. Rahbar buni unutmaydi.`, 'bad');
    return { ok: true, msg: '' };
  }

  // ---------- Vazifalar ----------
  takeTask(g: Game): ActResult {
    const f = this.atOwnBase(g); if (!f) return { ok: false, msg: "Vazifa olish uchun o'z bazangizda bo'ling." };
    if (this.tasks.length >= MAX_TASKS) return { ok: false, msg: `Bir vaqtda ${MAX_TASKS} tadan ortiq vazifa olib bo'lmaydi.` };
    const t = this.makeTask(g, f);
    if (!t) return { ok: false, msg: "Hozircha vazifa yo'q." };
    this.tasks.push(t);
    g.say(`Yangi vazifa: ${t.title}. ${t.desc}`, 'alert');
    return { ok: true, msg: '' };
  }

  private makeTask(g: Game, f: Faction): Task | null {
    const w = g.w, rng = w.rng.get('player'), realm = g.p.realm, base = { id: ++this.taskSeq, faction: f.id, have: 0, done: false, until: w.day + TASK_DAYS };
    const taken = new Set(this.tasks.map(t => t.kind));
    const options: (() => Task | null)[] = [];
    const byDist = (pred: (x: Faction) => boolean, max = 60) => Object.values(w.factions).filter(x => x.active && x.id !== f.id && pred(x) && w.hoursTo(f.base, x.base) <= max).sort((a, b) => w.hoursTo(f.base, a.base) - w.hoursTo(f.base, b.base))[0];
    const gang = byDist(x => x.ideology === 'demonic');
    // Qasos: so'nggi 90 kunda a'zosini o'ldirgan, hali tirik begona
    const avengeTarget = (): NPC | null => {
      for (let k = w.events.length - 1; k >= 0; k--) {
        const e = w.events[k]; if (e.day < w.day - 90) break;
        if (e.type !== 'death' || e.secret || !e.object || e.object === 'player') continue;
        const victim = w.npcs[e.subject!], killer = w.npc(e.object);
        if (victim?.faction === f.id && killer?.alive && killer.faction !== f.id) return killer;
      }
      return null;
    };
    if (f.ideology !== 'demonic') {
      if (gang) options.push(() => ({ ...base, kind: 'hunt', title: 'Qaroqchilarni jazolash', desc: `${gang.name} odamlaridan 3 tasini mag'lub eting (yo'ldagi qaroqchilar yoki to'da a'zolari).`, need: 3, types: ['bandit', 'archer'], targetFaction: gang.id, reward: { contrib: 14, silver: 30 } }));
      const tgt = avengeTarget();
      if (tgt) options.push(() => ({ ...base, kind: 'avenge', title: `Qasos: ${tgt.name}`, desc: `${tgt.name} birodarimizni o'ldirgan. Uni duelda yengib, jazolang.`, need: 1, target: tgt.id, reward: { contrib: 30, silver: 60 } }));
      const item = f.ideology === 'neutral' ? 'ore' : 'herb', n = f.ideology === 'neutral' ? 2 + rng.int(0, 2) : 3 + rng.int(0, 3);
      options.push(() => ({ ...base, kind: 'gather', title: item === 'ore' ? "Ruda yetkazish" : "Shifobaxsh o't yig'ish", desc: `${n} ta ${item === 'ore' ? 'ruda' : "o't"} olib keling.`, need: n, item, reward: { contrib: 6 + 2 * n, silver: 10 } }));
    } else {
      const amt = 60 + 20 * realm;
      options.push(() => ({ ...base, kind: 'tribute', title: "O'lpon", desc: `Boshliqqa ${amt} kumush keltiring.`, need: amt, item: 'silver', reward: { contrib: 16, silver: 0 } }));
      const rival = byDist(x => x.ideology !== 'demonic' && w.tension(f.id, x.id) > 20) ?? byDist(x => x.ideology !== 'demonic');
      if (rival?.active) options.push(() => ({ ...base, kind: 'rival', title: `${rival.name}ni qo'rqitish`, desc: `${rival.name} a'zolaridan birini duelda yening.`, need: 1, targetFaction: rival.id, reward: { contrib: 22, silver: 40 } }));
    }
    // Urush: dushman sektaning a'zosini mag'lub etish
    for (const eid of f.wars ?? []) { const en = w.factions[eid]; if (en?.active) options.push(() => ({ ...base, kind: 'rival', title: `Urush: ${en.name}`, desc: `Sektamiz ${en.name} bilan urushda. Ularning a'zolaridan birini duelda yening.`, need: 1, targetFaction: en.id, reward: { contrib: 25, silver: 45 } })); }
    options.push(() => ({ ...base, kind: 'hunt', title: 'Yirtqichlarni haydash', desc: "4 ta yirtqich (bo'ri, to'ng'iz yoki yo'lbars) ni yo'q qiling.", need: 4, types: ['wolf', 'boar', 'tiger'], reward: { contrib: 9, silver: 15 } }));
    const nearIds = [...w.settlements(), ...w.tradeRoads(), ...w.ofKind('camp'), ...w.ofKind('cave')].filter(id => id !== f.base && w.hoursTo(f.base, id) <= 30);
    const pool = nearIds.length >= 3 ? nearIds : PATROL_POOL.filter(id => id !== f.base && g.w.locations[id]);
    rng.shuffle(pool);
    const places = pool.slice(0, 3);
    options.push(() => ({ ...base, kind: 'patrol', title: f.ideology === 'demonic' ? "Yo'l nazorati" : 'Patrul', desc: `Quyidagi joylarni aylanib chiqing: ${places.map(id => g.w.nameOf(id)).join(', ')}.`, need: places.length, places, visited: [], reward: { contrib: 10, silver: 12 } }));
    // Bir xil turdagi ikki vazifa bo'lmasin
    const made = options.map(o => o()).filter((t): t is Task => !!t && !taken.has(t.kind));
    return made.length ? made[Math.floor(rng.next() * made.length)] : null;
  }

  private progress(g: Game, t: Task, by = 1): void {
    if (t.done) return;
    t.have = Math.min(t.need, t.have + by);
    if (t.have >= t.need) { t.done = true; g.say(`Vazifa bajarildi: «${t.title}». Bazaga qaytib topshiring.`, 'good'); }
  }
  /** Jang g'alabasidan keyin chaqiriladi. */
  onWin(g: Game, enemyTypes: string[], npc: NPC | undefined, killed: boolean): void {
    for (const t of this.tasks) {
      if (t.done || t.faction !== g.p.faction) continue;
      if (t.kind === 'hunt' && t.types) { const n = enemyTypes.filter(x => t.types!.includes(x)).length; if (n) this.progress(g, t, n); }
      if (npc && (t.kind === 'hunt' || t.kind === 'rival') && t.targetFaction && npc.faction === t.targetFaction) this.progress(g, t);
      if (npc && t.kind === 'avenge' && t.target === npc.id && killed) this.progress(g, t);
    }
    // O'z a'zosini o'ldirish — haydalish
    if (npc && killed && g.p.faction && npc.faction === g.p.faction) {
      const name = g.w.factions[g.p.faction].name;
      this.drop(g, 'expelled'); g.say(`Siz birodaringizni o'ldirdingiz. ${name} sizni haydadi!`, 'bad');
    }
  }
  /** Har yurishdan keyin: patrul joylari. */
  onMove(g: Game): void {
    const loc = g.grid.loc[g.i]; if (!loc) return;
    for (const t of this.tasks) if (t.kind === 'patrol' && !t.done && t.places!.includes(loc) && !t.visited!.includes(loc)) {
      t.visited!.push(loc); g.say(`Patrul: ${g.w.nameOf(loc)} tekshirildi (${t.visited!.length}/${t.need}).`, 'info'); this.progress(g, t);
    }
  }
  /** Har harakatdan keyin: maosh, muddat, fraksiya holati. */
  tick(g: Game): void {
    const p = g.p, f = this.own(g);
    if (!f) {
      if (p.faction || this.tasks.length) { if (p.faction) { g.say(`${g.w.nameOf(p.faction)} tarqalib ketdi. Siz yana sargardonsiz.`, 'bad'); } this.drop(g, 'gone'); }
      return;
    }
    this.tasks = this.tasks.filter(t => t.faction === p.faction);   // sim sizni boshqa fraksiyaga o'tkazgan bo'lishi mumkin (bo'linish)
    while (g.w.day - this.lastStipendDay >= 30) {
      this.lastStipendDay += 30;
      const pay = Math.min(f.silver, STIPEND[p.role] ?? 10);
      if (pay > 0) { f.silver -= pay; p.silver += pay; g.say(`${f.name} oylik ulush to'ladi: ${Math.round(pay)} kumush.`, 'good'); }
    }
    for (const t of this.tasks) if (!t.done && g.w.day > t.until) { t.done = true; t.need = -1; this.contrib = Math.max(0, this.contrib - 5); g.say(`Vazifa muddati o'tdi: «${t.title}». Hissa −5.`, 'bad'); }
    this.tasks = this.tasks.filter(t => t.need !== -1);
  }

  turnIn(g: Game): ActResult {
    const f = this.atOwnBase(g); if (!f) return { ok: false, msg: "Topshirish uchun o'z bazangizda bo'ling." };
    const p = g.p, done: Task[] = [];
    for (const t of this.tasks) {
      if (t.kind === 'gather') { const have = t.item === 'ore' ? g.ore : g.herb; if (have >= t.need) { if (t.item === 'ore') g.ore -= t.need; else g.herb -= t.need; done.push(t); } }
      else if (t.kind === 'tribute') { if (p.silver >= t.need) { p.silver -= t.need; f.silver += t.need; done.push(t); } }
      else if (t.done) done.push(t);
    }
    if (!done.length) return { ok: false, msg: "Topshiradigan bajarilgan vazifa yo'q." };
    for (const t of done) {
      this.contrib += t.reward.contrib; this.totalContrib += t.reward.contrib; p.silver += t.reward.silver;
      g.say(`«${t.title}» topshirildi: +${t.reward.contrib} hissa${t.reward.silver ? `, +${t.reward.silver} kumush` : ''}.`, 'good');
    }
    this.tasks = this.tasks.filter(t => !done.includes(t));
    const leader = g.w.npc(f.leader);
    if (leader?.alive) addMemory(g.w, leader, { type: 'helped', subject: 'player', object: leader.id, day: g.w.day, location: f.base, source: 'witnessed', confidence: 1, origin: `task_${f.id}_${g.w.h}` });
    this.promote(g, f);
    return { ok: true, msg: '' };
  }

  // Hissa bo'yicha unvon ko'tarilishi (sim ham bosqich bo'yicha ko'taradi)
  private promote(g: Game, f: Faction): void {
    const p = g.p, before = p.role;
    if (f.ideology === 'righteous' || g.w.locations[f.base]?.kind === 'sect') {
      if (p.role === 'outer_disciple' && this.totalContrib >= 50 && p.realm >= 2) p.role = 'inner_disciple';
      else if (p.role === 'inner_disciple' && this.totalContrib >= 160 && p.realm >= 4) p.role = 'elder';
    } else if (f.ideology === 'demonic') {
      if (p.role === 'bandit' && this.totalContrib >= 60) p.role = 'bandit_lieutenant';
    } else if (p.role === 'guard' && this.totalContrib >= 80 && p.realm >= 3) p.role = 'guard_captain';
    if (p.role !== before) {
      g.w.emit({ type: 'promoted', location: f.base, subject: 'player', object: f.id, data: { to: p.role } });
      g.say(`Unvoningiz oshdi: ${RANK_NAME[p.role]}!${p.role === 'elder' ? ' Endi vorislik inqirozida da\'vogar bo\'lishingiz mumkin.' : ''}`, 'good');
    }
  }

  lesson(g: Game): ActResult {
    const f = this.atOwnBase(g); if (!f) return { ok: false, msg: "Saboq faqat o'z bazangizda." };
    if (g.w.day - this.lastLessonDay < LESSON_EVERY) return { ok: false, msg: `Keyingi saboq ${LESSON_EVERY - (g.w.day - this.lastLessonDay)} kundan keyin.` };
    if (this.contrib < LESSON_COST) return { ok: false, msg: `Saboq uchun ${LESSON_COST} hissa kerak.` };
    const teacher = g.w.members(f.id).filter(m => m.id !== 'player').sort((a, b) => b.realm - a.realm)[0];
    if (!teacher || teacher.realm <= g.p.realm) return { ok: false, msg: "Bu yerda sizdan kuchliroq ustoz yo'q." };
    this.contrib -= LESSON_COST; this.lastLessonDay = g.w.day;
    g.run(4);
    const gain = Math.round(threshold(g.p.realm) * 0.12);
    g.p.progress += gain;
    addMemory(g.w, g.p, { type: 'taught', subject: teacher.id, object: 'player', day: g.w.day, location: f.base, source: 'witnessed', confidence: 1, origin: `lesson_${teacher.id}_${g.w.day}` });
    g.say(`${teacher.name} (${teacher.realm}-bosqich) sizga saboq berdi: +${gain} tajriba.`, 'good');
    return { ok: true, msg: '' };
  }

  exchange(g: Game, what: string): ActResult {
    const f = this.atOwnBase(g); if (!f) return { ok: false, msg: "Xazina faqat o'z bazangizda." };
    const x = EXCHANGE[what as keyof typeof EXCHANGE]; if (!x) return { ok: false, msg: "Noma'lum narsa." };
    if (this.contrib < x.cost) return { ok: false, msg: `${x.cost} hissa kerak.` };
    if (what === 'heal' && g.p.injury <= 0) return { ok: false, msg: 'Siz sog\'lomsiz.' };
    this.contrib -= x.cost;
    if (what === 'sp') g.sp++; else if (what === 'herb') g.herb += 2; else g.p.injury = 0;
    g.say(`Xazinadan oldingiz: ${x.name} (−${x.cost} hissa).`, 'good');
    return { ok: true, msg: '' };
  }

  /** Mashq tezligi: to'g'ri yo'l sektalari o'z usulini o'rgatadi. */
  cultMult(g: Game): number {
    const f = this.own(g); if (!f) return 1;
    return f.ideology === 'righteous' ? (g.p.role === 'outer_disciple' ? 1.15 : 1.3) : 1.05;
  }
  isBandit(g: Game): boolean { return this.own(g)?.ideology === 'demonic'; }

  state(g: Game) {
    const f = this.own(g), here = this.factionsHere(g);
    const markers: { kind: 'place' | 'npc'; id: string }[] = [];
    for (const t of this.tasks) {
      if (t.kind === 'patrol' && !t.done) for (const id of t.places!) if (!t.visited!.includes(id)) markers.push({ kind: 'place', id });
      if (t.kind === 'avenge' && !t.done && t.target) markers.push({ kind: 'npc', id: t.target });
    }
    if (this.tasks.some(t => t.done || (t.kind === 'gather' && (t.item === 'ore' ? g.ore : g.herb) >= t.need) || (t.kind === 'tribute' && g.p.silver >= t.need)) && f) markers.push({ kind: 'place', id: f.base });
    return {
      id: f?.id ?? null, name: f?.name ?? null, base: f?.base ?? null, role: g.p.role, rank: RANK_NAME[g.p.role] ?? g.p.role, contrib: this.contrib, totalContrib: this.totalContrib,
      leader: f ? g.w.nameOf(f.leader) : null, members: f ? g.w.members(f.id).length : 0,
      wars: (f?.wars ?? []).map(id => g.w.nameOf(id)), allies: (f?.allies ?? []).map(id => g.w.nameOf(id)),
      tourney: f?.tourney ? { vs: g.w.nameOf(f.tourney.vs), day: f.tourney.day, inDays: f.tourney.day - g.w.day, player: f.tourney.player ?? null } : null,
      lessonIn: Math.max(0, LESSON_EVERY - (g.w.day - this.lastLessonDay)), cultMult: this.cultMult(g),
      tasks: this.tasks.map(t => ({ id: t.id, kind: t.kind, title: t.title, desc: t.desc, need: t.need, until: t.until, done: t.done, reward: t.reward,
        have: t.kind === 'gather' ? Math.min(t.need, t.item === 'ore' ? g.ore : g.herb) : t.kind === 'tribute' ? Math.min(t.need, Math.round(g.p.silver)) : t.have,
        places: t.places?.map(id => ({ id, name: g.w.nameOf(id), done: t.visited!.includes(id) })), target: t.target ? g.w.nameOf(t.target) : null })),
      here: here.map(x => ({ id: x.id, name: x.name, ideology: x.ideology, leader: g.w.nameOf(x.leader), members: g.w.members(x.id).length, member: x.id === f?.id, join: this.canJoin(g, x) })),
      markers, exchange: EXCHANGE,
    };
  }
}
