import { act, socialHour, updateNeeds } from './npcAI.js';
import { addMemory, decayMemories } from './memory.js';
import { daily, diplomacy, factionAI, leadership, monthly, plots, resolveOps } from './faction.js';
import { directorScan } from './director.js';
import type { World } from './world.js';
import { ambitions } from './ambition.js';
import { updateWeather } from './calendar.js';
import { economy } from './settlement.js';
import { family } from './family.js';
import { territory } from './territory.js';
import { lawDaily } from './law.js';
import { questsDaily } from './quests.js';
import { cultInit, cultivationMonthly, initNpc } from './cultivation.js';

export function stepHour(w: World): void {
  // 1) Yo'lchilar yetib keladi
  for (const n of w.alive()) {
    const t = n.travel;
    if (!t || w.h < t.legArrive) continue;
    n.location = t.legs[t.index].to;
    if (t.index + 1 < t.legs.length) { t.index++; n.location = t.legs[t.index].road; t.legArrive = w.h + t.legs[t.index].hours; }
    else n.travel = undefined;
  }
  // 2) Xabarlar yetib boradi
  const due = w.news.filter(x => x.at <= w.h);
  w.news = w.news.filter(x => x.at > w.h);
  for (const d of due) { const n = w.npcs[d.to]; if (n?.alive) addMemory(w, n, { ...d.memory, day: w.day }); }
  // 3) Qarorlar
  for (const n of w.alive()) if (n.alive && !n.player) act(w, n); // soat ichida o'ldirilganlar harakat qilmaydi
  // 4) Joydagi voqealar
  resolveOps(w);
  socialHour(w);
  for (const n of w.alive()) if (!n.player) updateNeeds(n);
  // 5) Kun oxiri
  if (w.hod === 23) endOfDay(w);
  w.h++;
}

function endOfDay(w: World): void {
  daily(w);
  cultInit(w); for (const n of w.alive()) if (!n.aff) initNpc(w, n);   // yangi kelganlar, to'da a'zolari
  if (w.day % 30 === 5) cultivationMonthly(w);
  economy(w);
  territory(w);
  lawDaily(w);
  questsDaily(w);
  family(w);
  ambitions(w);
  plots(w);
  leadership(w);
  factionAI(w);
  diplomacy(w);
  if (w.day % 30 === 29) monthly(w);
  decayMemories(w);
  directorScan(w);
  w.ops = w.ops.filter(o => !o.resolved || o.end > w.h - 24 * 30);
  updateWeather(w);
}

export function runDays(w: World, days: number): void {
  const until = w.h + days * 24;
  while (w.h < until) stepHour(w);
}
