// Story Director: dunyo holatidan "hikoya urug'lari"ni topadi, ballaydi, temp bo'yicha chiqaradi va kuzatadi.
// U hikoya yozmaydi va dunyoni o'zgartirmaydi.
import type { SimEvent, StorySeed } from '../core/types.js';
import type { World } from './world.js';
import { rel } from './memory.js';

interface Candidate { key: string; roles: Record<string, string>; }
interface Rule {
  type: string; drama: number; cooldown: number; multiSect?: boolean;   // multiSect: faqat bir nechta sektali (katta) dunyoda
  detect: (w: World, today: SimEvent[]) => Candidate[];
  resolve: (w: World, s: StorySeed) => string | null;
}

const alive = (w: World, id?: string) => !!(id && w.npcs[id]?.alive);
const ev = (today: SimEvent[], type: string) => today.filter(e => e.type === type);
// Hikoya boshlangandan keyingi oxirgi mos voqea (oxiridan, hikoya kunigacha — butun ro'yxatni nusxalamasdan)
const lastEvent = (w: World, s: StorySeed, types: string[], pred: (e: SimEvent) => boolean = () => true): SimEvent | undefined => {
  for (let k = w.events.length - 1; k >= 0; k--) { const e = w.events[k]; if (e.day < s.day) return undefined; if (types.includes(e.type) && pred(e)) return e; }
  return undefined;
};

export const RULES: Rule[] = [
  { type: 'sect_war', drama: 0.92, cooldown: 0, multiSect: true,
    detect: (w, t) => ev(t, 'war_declared').map(e => ({ key: `war:${e.subject}:${e.object}:${e.day}`, roles: { a: e.subject!, b: e.object! } })),
    resolve: (w, s) => {
      const p = lastEvent(w, s, ['peace_made'], e => [e.subject, e.object].includes(s.roles.a) && [e.subject, e.object].includes(s.roles.b));
      if (p) return `Sulh tuzildi (${p.day - s.day} kunlik urushdan so'ng).`;
      for (const id of [s.roles.a, s.roles.b]) if (!w.factions[id]?.active) return `${w.nameOf(id)} urushda yo'q bo'lib ketdi.`;
      return null;
    } },
  { type: 'alliance', drama: 0.6, cooldown: 20, multiSect: true,
    detect: (w, t) => ev(t, 'alliance_formed').map(e => ({ key: `ally:${e.subject}:${e.object}:${e.day}`, roles: { a: e.subject!, b: e.object!, enemy: e.data!.against as string } })),
    resolve: (w, s) => {
      const br = lastEvent(w, s, ['alliance_broken', 'war_declared'], e => [e.subject, e.object].includes(s.roles.a) && [e.subject, e.object].includes(s.roles.b));
      if (br) return br.type === 'war_declared' ? "Ittifoqchilar dushmanga aylandi!" : 'Ittifoq buzildi.';
      if (!w.factions[s.roles.enemy]?.active) return `Umumiy dushman (${w.nameOf(s.roles.enemy)}) yo'q qilindi.`;
      return w.day - s.day > 120 ? 'Ittifoq mustahkam.' : null;
    } },
  { type: 'tournament', drama: 0.5, cooldown: 25, multiSect: true,
    detect: (w, t) => ev(t, 'tournament').map(e => ({ key: `tour:${e.day}`, roles: { winner: e.subject!, loser: e.object!, wf: e.data!.winner as string, lf: e.data!.loser as string } })),
    resolve: (w, s) => `${w.nameOf(s.roles.winner)} (${w.nameOf(s.roles.wf)}) g'olib chiqdi.` },
  { type: 'new_art', drama: 0.55, cooldown: 20, multiSect: true,
    detect: (w, t) => ev(t, 'technique_created').map(e => ({ key: `art:${e.subject}:${e.data!.tech}`, roles: { master: e.subject!, art: e.data!.tech as string } })),
    resolve: (w, s) => {
      const heirs = w.alive().filter(n => n.id !== s.roles.master && n.techs?.includes(s.roles.art)).length;
      if (heirs) return `Uslub ${heirs} shogirdga o'tdi.`;
      if (!alive(w, s.roles.master)) return 'Uslub egasi bilan birga yo\'qoldi.';
      return w.day - s.day > 180 ? 'Uslub hali hech kimga o\'rgatilmagan.' : null;
    } },
  { type: 'occupation', drama: 0.75, cooldown: 0, multiSect: true,
    detect: (w, t) => ev(t, 'territory_seized').map(e => ({ key: `occ:${e.location}:${e.day}`, roles: { place: e.location, gang: e.object! } })),
    resolve: (w, s) => {
      const l = lastEvent(w, s, ['territory_liberated'], e => e.location === s.roles.place);
      if (l) return `${w.nameOf(s.roles.place)} ${l.day - s.day} kundan so'ng ozod bo'ldi (${l.subject === 'player' ? 'siz tufayli' : w.nameOf(l.subject)}).`;
      return w.day - s.day > 120 ? 'Qishloq hamon bosqinchilar qo\'lida.' : null;
    } },
  { type: 'manhunt', drama: 0.5, cooldown: 10, multiSect: true,
    detect: (w, t) => ev(t, 'bounty_hunter').map(e => ({ key: `hunt:${e.subject}:${e.object}`, roles: { hunter: e.subject!, target: e.object! } })),
    resolve: (w, s) => {
      const t = w.npcs[s.roles.target], h = w.npcs[s.roles.hunter];
      if (!t.alive) return t.killer === h.id ? `${h.name} nishonni yo'q qildi.` : `${t.name} boshqa sabab bilan halok bo'ldi.`;
      if (!h.alive) return `Ovchi ${h.name} halok bo'ldi.`;
      return w.day - s.day > 90 ? `${t.name} hamon qochib yuribdi.` : null;
    } },
  { type: 'famine', drama: 0.7, cooldown: 30, multiSect: true,
    detect: (w, t) => ev(t, 'famine').map(e => ({ key: `famine:${e.location}:${e.day}`, roles: { place: e.location } })),
    resolve: (w, s) => {
      const o = lastEvent(w, s, ['famine_over'], e => e.location === s.roles.place);
      if (o) return `Ocharchilik ${o.data!.days} kundan keyin tugadi.`;
      const left = w.events.filter(e => e.day >= s.day && e.type === 'emigrated' && e.location === s.roles.place).length;
      return w.day - s.day > 90 ? `Ocharchilik cho'zilmoqda${left ? `, ${left} oila ko'chib ketdi` : ''}.` : null;
    } },
  { type: 'rivalry', drama: 0.45, cooldown: 15,
    detect: (w, t) => ev(t, 'rivalry').map(e => ({ key: `rival:${e.subject}:${e.object}`, roles: { a: e.subject!, b: e.object! } })),
    resolve: (w, s) => {
      const sp = lastEvent(w, s, ['surpassed_rival'], e => [s.roles.a, s.roles.b].includes(e.subject!) && [s.roles.a, s.roles.b].includes(e.object!));
      if (sp) return `${w.nameOf(sp.subject)} raqibidan o'zib ketdi.`;
      for (const id of [s.roles.a, s.roles.b]) if (!alive(w, id)) return `${w.nameOf(id)} halok bo'ldi — raqiblik tugadi.`;
      return w.day - s.day > 180 ? 'Raqiblik hamon davom etmoqda.' : null;
    } },
  { type: 'succession_crisis', drama: 0.95, cooldown: 60,
    detect: (w, t) => ev(t, 'succession_crisis').map(e => ({ key: `succ:${e.object}:${e.day}`, roles: { faction: e.object!, claimant_a: (e.data!.claimants as string[])[0], claimant_b: (e.data!.claimants as string[])[1] } })),
    resolve: (w, s) => {
      if (w.factions[s.roles.faction]?.succession) return null;
      const sch = lastEvent(w, s, ['schism'], e => w.factions[e.object!]?.parent === s.roles.faction);
      if (sch) return `Sekta bo'lindi: ${w.nameOf(sch.subject)} tarafdorlari bilan ${w.nameOf(sch.object)}ni tuzdi.`;
      const nl = lastEvent(w, s, ['new_leader'], e => e.object === s.roles.faction);
      return nl ? `${w.nameOf(nl.subject)} yangi rahbar bo'ldi.` : 'Inqiroz rahbarsiz yakunlandi.';
    } },
  { type: 'revenge_vow', drama: 0.75, cooldown: 0,
    detect: (w, t) => ev(t, 'vow_revenge').map(e => ({ key: `rev:${e.subject}:${e.object}`, roles: { avenger: e.subject!, target: e.object!, victim: e.data!.victim as string } })),
    resolve: (w, s) => {
      const a = w.npcs[s.roles.avenger], t = w.npcs[s.roles.target];
      if (!t.alive) return t.killer === a.id ? `${a.name} qasos oldi: ${t.name} o'ldirildi.` : `${t.name} boshqa sabab bilan halok bo'ldi (${w.nameOf(t.killer) }); qasos o'z-o'zidan yopildi.`;
      if (!a.alive) return `${a.name} qasos yo'lida halok bo'ldi${a.killer ? ` (${w.nameOf(a.killer)} qo'lida)` : ''}.`;
      return null;
    } },
  { type: 'bandit_threat', drama: 0.6, cooldown: 25,
    detect: (w) => {
      const n = w.events.filter(e => e.day > w.day - 10 && ['raid', 'ambush'].includes(e.type));
      const byF = new Map<string, number>();
      for (const e of n) byF.set(e.object!, (byF.get(e.object!) ?? 0) + 1);
      return [...byF].filter(([, c]) => c >= 2).map(([f]) => ({ key: `threat:${f}:${Math.floor(w.day / 30)}`, roles: { faction: f, leader: w.factions[f].leader ?? '' } }));
    },
    resolve: (w, s) => {
      const f = w.factions[s.roles.faction];
      if (!f.active) return `${f.name} tarqalib ketdi.`;
      if (!alive(w, s.roles.leader)) return `${w.nameOf(s.roles.leader)} halok bo'ldi, to'da boshsiz qoldi.`;
      const quiet = !w.events.some(e => e.day > w.day - 20 && ['raid', 'ambush'].includes(e.type) && e.object === f.id);
      return quiet ? 'Hujumlar to\'xtadi, tahdid vaqtincha susaydi.' : null;
    } },
  { type: 'murder_mystery', drama: 0.9, cooldown: 0,
    detect: (w, t) => ev(t, 'death').filter(e => e.secret && ['assassination', 'sudden_illness'].includes(e.data!.cause as string))
      .map(e => ({ key: `murder:${e.subject}`, roles: { victim: e.subject!, culprit_hidden: e.object! } })),
    resolve: (w, s) => {
      const ex = lastEvent(w, s, ['murder_exposed'], e => e.object === s.roles.victim);
      if (ex) return `Haqiqat ochildi: qotil ${w.nameOf(ex.subject)}.`;
      if (!alive(w, s.roles.culprit_hidden)) return 'Qotil sirini qabrga olib ketdi.';
      return null;
    } },
  { type: 'corrupt_official', drama: 0.65, cooldown: 0,
    detect: (w, t) => ev(t, 'bribe').map(e => ({ key: `bribe:${e.subject}`, roles: { official: e.subject!, briber: e.object! } })),
    resolve: (w, s) => {
      const ex = lastEvent(w, s, ['official_exposed'], e => e.object === s.roles.official);
      if (ex) return `${w.nameOf(ex.subject)} poraxo'rni fosh qildi; ${w.nameOf(s.roles.official)} lavozimdan olindi.`;
      if (!alive(w, s.roles.official)) return 'Poraxo\'r amaldor vafot etdi.';
      return null;
    } },
  { type: 'missing_disciple', drama: 0.55, cooldown: 10,
    detect: (w, t) => [...ev(t, 'ambush'), ...ev(t, 'raid')].flatMap(e => ((e.data?.victims as string[]) ?? [])
      .filter(v => ['inner_disciple', 'outer_disciple'].includes(w.npcs[v]?.role) && w.npcs[v].injury > 0.25)
      .map(v => ({ key: `missing:${v}:${e.day}`, roles: { disciple: v, attacker: e.subject! } }))),
    resolve: (w, s) => {
      const d = w.npcs[s.roles.disciple];
      if (!d.alive) return `${d.name} jarohatlardan vafot etdi.`;
      if (d.injury < 0.2 && d.location === d.home) return `${d.name} sog'ayib uyiga qaytdi.`;
      return null;
    } },
  { type: 'rising_star', drama: 0.4, cooldown: 30,
    detect: (w, t) => ev(t, 'breakthrough').filter(e => (e.data!.realm as number) >= 3 && ['outer_disciple', 'inner_disciple', 'wanderer'].includes(w.npcs[e.subject!].role))
      .map(e => ({ key: `star:${e.subject}:${e.data!.realm}`, roles: { star: e.subject! } })),
    resolve: (w, s) => `${w.nameOf(s.roles.star)} ${w.npcs[s.roles.star].realm}-bosqichga yetdi.` },
  { type: 'hidden_master', drama: 0.7, cooldown: 0,
    detect: (w, t) => ev(t, 'taught').map(e => ({ key: `master:${e.object}`, roles: { student: e.object!, master: e.subject! } })),
    resolve: (w, s) => `${w.nameOf(s.roles.student)} yashirin ustozdan saboq oldi.` },
  { type: 'defection', drama: 0.5, cooldown: 15,
    detect: (w, t) => ev(t, 'defected').map(e => ({ key: `defect:${e.subject}`, roles: { traitor: e.subject!, faction: e.object! } })),
    resolve: (w, s) => alive(w, s.roles.traitor) ? (w.day - s.day > 30 ? `${w.nameOf(s.roles.traitor)} hamon qaroqchilar safida.` : null) : `${w.nameOf(s.roles.traitor)} halok bo'ldi.` },
  { type: 'feud', drama: 0.45, cooldown: 20,
    detect: (w) => {
      if (w.day % 7) return [];
      const out: Candidate[] = [];
      for (const a of w.alive()) {
        if (!w.isMartial(a)) continue;
        for (const bid of Object.keys(a.relations)) {
          const b = w.npcs[bid];
          if (!b?.alive || a.id >= b.id || !w.isMartial(b)) continue;
          if (rel(a, b.id, w).affection < -0.45 && rel(b, a.id, w).affection < -0.45) out.push({ key: `feud:${a.id}:${b.id}`, roles: { a: a.id, b: b.id } });
        }
      }
      return out;
    },
    resolve: (w, s) => {
      if (!alive(w, s.roles.a) || !alive(w, s.roles.b)) return `Adovat o'lim bilan tugadi.`;
      return rel(w.npcs[s.roles.a], s.roles.b, w).affection > -0.1 ? 'Ular yarashdi.' : null;
    } },
  { type: 'expedition', drama: 0.85, cooldown: 0,
    detect: (w, t) => ev(t, 'expedition_declared').map(e => ({ key: `exp:${e.subject}:${e.day}`, roles: { leader: e.subject ?? '', enemy: e.object! } })),
    resolve: (w, s) => {
      const r = lastEvent(w, s, ['expedition_victory', 'expedition_failed']);
      if (!r) return w.day - s.day > 3 ? 'Yurish bo\'lmadi.' : null;
      return r.type === 'expedition_victory' ? `Yurish g'alaba bilan tugadi (${r.data!.killed} kishi halok).` : `Yurish muvaffaqiyatsiz (${r.data!.killed} kishi halok).`;
    } },
  { type: 'power_vacuum', drama: 0.6, cooldown: 0,
    detect: (w, t) => ev(t, 'leader_died').filter(e => w.factions[e.object!]?.ideology !== 'righteous').map(e => ({ key: `vac:${e.subject}`, roles: { fallen: e.subject!, faction: e.object! } })),
    resolve: (w, s) => {
      const nl = lastEvent(w, s, ['new_leader', 'faction_disbanded'], e => e.object === s.roles.faction);
      return nl ? (nl.type === 'new_leader' ? `${w.nameOf(nl.subject)} boshchilikni oldi.` : 'Fraksiya tarqaldi.') : null;
    } },
];

const CHANNELS: [number, string][] = [[0.85, 'sahna (cinematic)'], [0.65, 'NPC iltimosi'], [0.5, "e'lonlar taxtasi"], [0, 'gossip']];

export function directorScan(w: World): void {
  const today = w.events.filter(e => e.day === w.day);
  const r = w.rng.get('director');
  w.intensity *= 0.85;
  const fresh: StorySeed[] = [];
  for (const rule of RULES) {
    for (const c of rule.detect(w, today)) {
      if (w.seeds.some(s => s.key === c.key)) continue;
      const last = [...w.seeds].reverse().find(s => s.type === rule.type && s.surfaced);
      const cooling = last && w.day - last.day < rule.cooldown;
      fresh.push({ id: w.nextId('seed'), key: c.key, type: rule.type, day: w.day, roles: c.roles, drama: rule.drama * (cooling ? 0.5 : 1), surfaced: false, status: 'open' });
    }
  }
  // Pacing: kuchli voqeadan keyin "nafas olish"
  fresh.sort((a, b) => b.drama - a.drama);
  let surfacedToday = 0;
  for (const s of fresh) {
    const bar = 0.3 + 0.15 * w.intensity;
    if (surfacedToday < 2 && s.drama + 0.1 * r.next() > bar) {
      s.surfaced = true; surfacedToday++;
      s.channel = CHANNELS.find(([d]) => s.drama >= d)![1];
      w.intensity += s.drama;
    }
    w.seeds.push(s);
  }
  for (const s of w.seeds) {
    if (s.status !== 'open') continue;
    const out = RULES.find(x => x.type === s.type)!.resolve(w, s);
    if (out) { s.status = 'resolved'; s.resolvedDay = w.day; s.outcome = out; }
  }
}
