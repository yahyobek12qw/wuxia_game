// Iltimosni o'yinchiga ko'rsatish (sarlavha, tavsif, mukofot, muddat, ishoralar)
import type { Game } from './game.js';
import type { Quest } from '../sim/quests.js';

export function questView(g: Game, q: Quest) {
  const w = g.w, giver = w.nameOf(q.giver), place = w.nameOf(q.place), gang = q.gang ? w.nameOf(q.gang) : '';
  const T: Record<string, [string, string]> = {
    caravan: ["Talangan karvon", `${giver}ning karvonini ${gang} taladi. To'da a'zolaridan birini yenging — savdogar do'konini saqlab qoladi.`],
    theft: ["O'g'ri kim?", `${giver}ning ${q.amount} kumushi o'g'irlandi. ${place} aholisi bilan gaplashing (💬) va o'g'rini ayblang (⚖ NPC panelida). Mish-mishlar har doim ham to'g'ri emas!`],
    liberate: [`${place}ni ozod qiling`, `${gang} qishloqni bosib olgan. Bosqinchilarni qishloqda yenging.`],
    relief: ['Ocharchilik', `${place} och qolmoqda. Joy panelida (E) don olib bering (60🪙) — aks holda odamlar o'ladi.`],
    murder: ['Qotilni toping', `${giver}ning yaqini ${w.nameOf(q.victim)} sirli o'ldirilgan. So'rab-surishtiring va qotilni ayblang (⚖).`],
    healer: ['Dori kerak', `${giver} og'ir yarador, yaqinda tabib yo'q. Unga shifo dorisi yoki 3 ta o't bering (NPC paneli).`],
  };
  const [title, desc] = T[q.kind];
  return { id: q.id, kind: q.kind, title, desc, giver: q.giver, giverName: giver, place: q.place, placeName: place, reward: q.reward, daysLeft: Math.max(0, q.due - w.day),
    taken: !!q.taken, status: q.status, solver: q.solver ?? null, clues: q.clues ?? [] };
}
