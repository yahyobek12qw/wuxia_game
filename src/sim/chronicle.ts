// Event log'ni o'qiladigan o'zbekcha xronikaga aylantiradi.
import type { SimEvent } from '../core/types.js';
import type { World } from './world.js';

const CAUSE: Record<string, string> = { old_age: 'qarilikdan', assassination: 'suiqasd natijasida', sudden_illness: "to'satdan kasallikdan", raid: 'bosqinda',
  ambush: 'pistirmada', expedition: 'jazo yurishida', revenge: 'qasos jangida', qi_deviation: "yorilishda qi og'ishidan", famine: 'ochlikdan', bounty: "mukofot ovchisi qo'lida" };
export const TYPES: Record<string, string> = { succession_crisis: 'Vorislik inqirozi', revenge_vow: 'Qasos qasami', bandit_threat: 'Qaroqchilar tahdidi', murder_mystery: 'Sirli qotillik',
  corrupt_official: "Poraxo'r amaldor", missing_disciple: 'Yarador shogird', rising_star: 'Yangi yulduz', hidden_master: 'Yashirin ustoz', defection: 'Xiyonat',
  feud: 'Adovat', expedition: 'Jazo yurishi', power_vacuum: "Hokimiyat bo'shlig'i", sect_war: 'Sektalar urushi', alliance: 'Ittifoq', tournament: 'Musobaqa', rivalry: 'Raqiblik', famine: 'Ocharchilik', occupation: 'Bosib olingan qishloq', manhunt: 'Mukofot ovi', new_art: 'Yangi uslub' };

export function line(w: World, e: SimEvent): string | null {
  const s = w.nameOf(e.subject), o = w.nameOf(e.object), at = w.nameOf(e.location);
  const d = e.data ?? {};
  switch (e.type) {
    case 'death': return e.object ? `**${s}** ${at}da ${CAUSE[d.cause as string] ?? ''} halok bo'ldi${e.secret ? ' (qotil noma\'lum)' : ` — ${o} qo'lida`}.` : `**${s}** ${CAUSE[d.cause as string] ?? ''} vafot etdi.`;
    case 'raid': return `${o} ${at}ni talon-taroj qildi (${d.loot} kumush, ${d.killed} o'lik). Boshchi: ${s}.`;
    case 'raid_repelled': return `${at}dagi bosqin qaytarildi (${o}, ${d.killed} o'lik).`;
    case 'ambush': return `${o} ${at}da pistirma qo'ydi: ${(d.victims as string[]).map(v => w.nameOf(v)).join(', ')} talandi.`;
    case 'ambush_repelled': return `${at}dagi pistirma qaytarildi.`;
    case 'expedition_declared': return `${s} ${o}ga qarshi jazo yurishini e'lon qildi.`;
    case 'expedition_victory': return `Jazo yurishi g'alaba bilan tugadi (${d.killed} o'lik, ${d.loot} kumush o'lja).`;
    case 'expedition_failed': return `Jazo yurishi muvaffaqiyatsiz tugadi (${d.killed} o'lik).`;
    case 'vow_revenge': return `**${s}** ${w.nameOf(d.victim as string)} uchun ${o}dan qasos olishga qasam ichdi.`;
    case 'revenge_fulfilled': return `**${s}** qasos oldi: ${o} o'ldirildi.`;
    case 'petition': return `${s} ${w.nameOf(d.faction as string)} rahbariyatidan ${o}ga qarshi chora ko'rishni talab qildi.`;
    case 'gang_founded': return `**${s}** ${at}da yangi to'da — ${o}ni tuzdi.`;
    case 'breakthrough': return (d.realm as number) >= 3 ? `${s} ${d.realm}-bosqichga ko'tarildi.` : null;
    case 'qi_deviation': return `${s} breakthrough paytida qi og'ishiga uchradi.`;
    case 'promoted': return `${s} ${d.to === 'elder' ? 'oqsoqol' : 'ichki shogird'} darajasiga ko'tarildi.`;
    case 'new_leader': return `**${s}** ${o} rahbari bo'ldi${d.votes ? ` (ovozlar: ${(d.votes as [string, number][]).map(([id, n]) => `${w.nameOf(id)} ${n}`).join(', ')})` : ''}.`;
    case 'succession_crisis': return `${o}da vorislik inqirozi: ${(d.claimants as string[]).map(c => w.nameOf(c)).join(' va ')} da'vogar.`;
    case 'schism': return `**${s}** tarafdorlari bilan ajralib, ${o}ni tuzdi.`;
    case 'scheme_gift': return null;
    case 'secret_kill': return null;
    case 'assassination_failed': return null;
    case 'murder_exposed': return `Fosh bo'ldi: ${o}ni ${s} o'ldirgan.`;
    case 'leader_ousted': return `${s} rahbarlikdan haydaldi.`;
    case 'expelled': return `${s} ${o}dan haydaldi.`;
    case 'bribe': return null;
    case 'official_exposed': return `${s} hokim ${o}ning poraxo'rligini fosh qildi.`;
    case 'taught': return `**${s}** ${o}ga saboq berdi.`;
    case 'rejected': return `${s} ${o}ni shogirdlikka qabul qilmadi.`;
    case 'seeks_master': return `${s} afsonaviy yashirin ustozni izlashga otlandi.`;
    case 'defected': return `${s} qishloqdan ketib, ${o}ga qo'shildi.`;
    case 'joined': return `${s} ${o}ga qo'shildi.`;
    case 'wanderer_arrived': return `Sarson-sargardon ${s} ${at}ga keldi.`;
    case 'faction_disbanded': return `${o} tarqalib ketdi.`;
    case 'border_clash': return `${s} (${w.nameOf(d.a as string)}) va ${o} (${w.nameOf(d.b as string)}) chegarada to'qnashdi.`;
    case 'quest_done': return `✔ Iltimos bajarildi: ${o} minnatdor${d.reward ? ` (+${d.reward} kumush)` : ''}.`;
    case 'quest_failed': return d.wrong ? `✖ Ikki marta noto'g'ri aybladingiz — ${o} sizga ishonmay qo'ydi.` : `✖ ${o}ning iltimosi bajarilmadi.`;
    case 'shop_closed': return `${s} talangan karvonidan keyin kambag'allashib, do'konini yopdi.`;
    case 'crippled': return `${s} o'z vaqtida davolanmadi — yarasi bir umrga iz qoldirdi.`;
    case 'vendetta': return `⚔ ${w.nameOf(d.gang as string)} sizdan o'ch olish uchun ${s}ni yubordi!`;
    case 'invitation': return `📜 ${s} (${w.nameOf(d.faction as string)} rahbari) shon-shuhratingizni eshitib, sizni sektaga taklif qildi — bazasida ichki shogird bo'lib qo'shilishingiz mumkin.`;
    case 'gratitude': return `🎁 ${at} aholisi minnatdorlik bilan ${d.gift} kumush yubordi.`;
    case 'thief_exposed': return `${s} o'g'ri ekani fosh bo'ldi.`;
    case 'technique_learned': return d.how === 'player' ? `Siz ${s}ga «${d.name}» risolasini berdingiz.` : d.how === 'master' ? `${s} ustozi ${o}dan «${d.name}» uslubini o'rgandi.` : d.how === 'manual' ? `${s} risoladan «${d.name}» uslubini o'zlashtirdi.` : `${s} «${d.name}»ni meros qilib oldi.`;
    case 'technique_created': return `✨ **${s}** o'z uslubini yaratdi: «${d.name}» (${'I'.repeat(d.tier as number)}).`;
    case 'mutation': return `${s} tanasida g'aroyib o'zgarish yuz berdi — iste'dodi uyg'ondi.`;
    case 'great_breakthrough': return `🌟 **${s}** ${d.realm}-bosqichga erishdi — bu xabar butun dunyoga tarqaldi!`;
    case 'bounty_posted': return `💰 ${s} ${o} boshiga ${d.reward} kumush mukofot e'lon qildi (${({ murder: 'qotillik', theft: "o'g'rilik", raid: 'bosqin' } as Record<string, string>)[d.reason as string] ?? d.reason}).`;
    case 'bounty_claimed': return `${s} ${o}ni o'ldirib, ${d.reward} kumush mukofotni oldi.`;
    case 'bounty_hunter': return `${s} ${o} boshiga qo'yilgan mukofot ortidan tushdi.`;
    case 'theft': return d.seen ? `${s} ${at}da ${o}ning ${d.amount} kumushini o'g'irladi.` : null;
    case 'territory_seized': return `⚑ ${o} ${at}ni bosib oldi${d.from ? ` (${w.nameOf(d.from as string)} himoya qila olmadi)` : ''}; endi qishloq o'lpon to'laydi.`;
    case 'territory_liberated': return `⚑ ${at} ozod qilindi (${e.subject === 'player' ? 'siz' : s} — ${o} quvildi).`;
    case 'territory_gained': return `⚑ ${s} urushda ${o}dan ${at}ni tortib oldi.`;
    case 'born': return `👶 ${((d.parents as string[]) ?? []).map(x => w.nameOf(x)).join(' va ')} oilasida farzand tug'ildi: ${s}.`;
    case 'came_of_age': return `${s} voyaga yetdi va ${({ farmer: 'dehqon', merchant: 'savdogar', innkeeper: 'mehmonxonachi', doctor: 'tabib', blacksmith: 'temirchi', wanderer: 'sargardon', outer_disciple: 'shogird', bandit: 'qaroqchi', guard: 'qo\'riqchi' } as Record<string, string>)[d.role as string] ?? d.role} bo'ldi${d.faction ? ` (${w.nameOf(d.faction as string)})` : ''}.`;
    case 'married': return `💍 ${s} va ${o} turmush qurdi.`;
    case 'inheritance': return `${s}dan ${d.amount} kumush meros qoldi (${d.heirs} merosxo'r).`;
    case 'inherited_shop': return `${s} marhum ${o}ning do'konini meros qilib oldi.`;
    case 'emigrated': return `${s} oilasi bilan (${d.count} kishi) ${at}dan ${o}ga ko'chib ketdi.`;
    case 'famine': return `🍚 ${at}da ocharchilik boshlandi!`;
    case 'relief_sent': return `🍚 ${s} och qolgan ${at}ga don karvoni yubordi.`;
    case 'famine_over': return `${at}da ocharchilik tugadi (${d.days} kun davom etdi).`;
    case 'season_change': return `🍂 ${({ spring: 'Bahor', summer: 'Yoz', autumn: 'Kuz', winter: 'Qish' } as Record<string, string>)[d.season as string]} keldi.`;
    case 'weather': return d.kind === 'storm' ? "⛈ Dunyoni bo'ron qopladi: yo'llar xavfli, karvonlar to'xtadi." : '❄ Qor yog\'di: yo\'llar sekinlashdi.';
    case 'rivalry': return `${s} va ${o} raqibga aylandi.`;
    case 'surpassed_rival': return `**${s}** raqibi ${o}dan o'zib ketdi.`;
    case 'ambition_fulfilled': return d.goal === 'rank_up' ? `${s} orzusiga erishdi: ${d.to === 'elder' ? 'oqsoqol' : 'ichki shogird'} bo'ldi.` : null;
    case 'opened_shop': return `${s} yiqqan pulga ${at}da do'kon ochdi.`;
    case 'prospered': return `${s} boyidi${d.family ? ` va oilasiga ulush berdi` : ''}.`;
    case 'seeks_manual': return `${s} ${o}dagi qadimiy risolani izlab yo'lga chiqdi.`;
    case 'found_manual': return `**${s}** ${at}da qadimiy risola topdi!`;
    case 'tournament_announced': return `🏆 ${s} va ${o} ${d.day}-kuni musobaqa o'tkazishini e'lon qildi.`;
    case 'war_declared': return `⚔ **${s}** va **${o}** o'rtasida urush boshlandi!`;
    case 'peace_made': return `${s} va ${o} sulh tuzdi.`;
    case 'alliance_formed': return `🤝 **${s}** va **${o}** ${w.nameOf(d.against as string)}ga qarshi ittifoq tuzdi.`;
    case 'alliance_broken': return `${s} va ${o} ittifoqi buzildi.`;
    case 'ally_joins': return `${s} ittifoqchisi ${o} yurishiga qo'shildi.`;
    case 'tournament': return `🏆 Musobaqa: **${s}** (${w.nameOf(d.winner as string)}) ${o}ni (${w.nameOf(d.loser as string)}) yengdi.`;
    default: return null;
  }
}

export function chronicle(w: World): string {
  const out: string[] = [];
  const days = w.day;
  const deaths = Object.values(w.npcs).filter(n => !n.alive);
  const surfaced = w.seeds.filter(s => s.surfaced);
  out.push(`# Xronika — seed ${w.seed}, ${days} kun`, '');
  out.push(`Tirik NPC: ${w.alive().length} · O'limlar: ${deaths.length} · Hikoya urug'lari: ${w.seeds.length} (chiqarilgan: ${surfaced.length}, yakunlangan: ${surfaced.filter(s => s.status === 'resolved').length}) · Event'lar: ${w.events.length}`, '');
  out.push('## Fraksiyalar (yakun)', '');
  for (const f of Object.values(w.factions))
    out.push(`- **${f.name}**${f.active ? '' : ' (tarqalgan)'}: rahbar ${w.nameOf(f.leader)}, a'zolar ${w.members(f.id).length}, kumush ${Math.round(f.silver)}, tension ${Object.entries(f.tension).map(([k, v]) => `${w.nameOf(k)} ${Math.round(v)}`).join(', ')}`);
  out.push('', '## Player ko\'radigan hikoyalar', '');
  for (const s of surfaced) {
    const roles = Object.entries(s.roles).filter(([k]) => !k.endsWith('_hidden')).map(([k, v]) => `${k}: ${w.nameOf(v)}`).join(', ');
    out.push(`### ${s.day}-kun · ${TYPES[s.type] ?? s.type} — ${s.channel}`, '', `Rollar: ${roles}`, '',
      s.status === 'resolved' ? `Yakun (${s.resolvedDay}-kun): ${s.outcome}` : 'Holat: ochiq', '');
  }
  out.push('## Voqealar xronologiyasi', '');
  let lastDay = -1;
  for (const e of w.events) {
    const l = line(w, e);
    if (!l) continue;
    if (e.day !== lastDay) { out.push('', `**${e.day}-kun**`); lastDay = e.day; }
    out.push(`- ${l}`);
  }
  return out.join('\n');
}
