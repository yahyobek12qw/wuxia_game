# Tirik dunyo — arxitektura tahlili va yo'l xaritasi

Maqsad: mavjud prototipni (Tales of Immortal uslubidagi siyoh xarita, 500×350, ~550 NPC) qayta qurmasdan,
uning ostidagi simulyatsiyani chuqurlashtirish. Har bir yangi tizim kamida ikkita mavjud tizim bilan bog'lanishi shart:
`NPC → maqsad → qaror → harakat → dunyo o'zgarishi → boshqalarning reaksiyasi → fraksiya/iqtisod → yangi voqea → hikoya`.

## 1. Mavjud tizimlar (kod bo'yicha)

| Tizim | Qayerda | Holati |
|---|---|---|
| Dunyo holati, vaqt (soat/kun/yil=360 kun), deterministik RNG oqimlari | `sim/world.ts`, `core/rng.ts` | ✅ Soatma-soat `stepHour`, kun oxiri `endOfDay` |
| NPC modeli: rol (17 kasb), 8 xarakter (ambition, loyalty, greed, courage, honor, curiosity, temper, discipline), ehtiyojlar (hunger, rest, safety, social, purpose), jarohat, kumush, iste'dod, realm | `core/types.ts` | ✅ |
| Utility AI: kun tartibi (uyqu, ovqat, ish, mashq, suhbat, davolanish, qochish), qasos va ustoz izlash maqsadlari | `sim/npcAI.ts` | ✅ (maqsad turlari faqat 2 ta) |
| Xotira: turi, kun, joy, muhimlik, doimiylik, manba (ko'rgan/eshitgan), ishonch, sir; so'nish; siqish | `sim/memory.ts` | ✅ |
| Munosabat 5 o'lchovli: trust, respect, affection, fear, debt; rishtalar + xotiralardan qayta hisoblanadi, fraksiya qismi jonli | `sim/memory.ts` `rel()` | ✅ |
| Rishtalar: master, student, family, friend, rival, lover, sworn | `core/types.ts` | ✅ (rival/lover kam paydo bo'ladi) |
| Mish-mish (gossip): ishonch har uzatishda −20%, sirlar faqat ishonchli odamga, "noma'lum qotil" | `memory.ts` `gossip()` | ✅ |
| Sayohat: yo'l grafi, Dijkstra, real soatlar bilan oyoqma-oyoq yurish | `world.ts` `startTravel/route` | ✅ |
| Fraksiyalar: sekta/qaroqchi/qo'riqchi AI, operatsiyalar (raid, ambush, expedition, patrol), vorislik, bo'linish (schism), tarqalish, fitna/suiqasd/pora, yollash | `sim/faction.ts` | ✅ |
| Diplomatiya: raqobat, chegara to'qnashuvi, urush, sulh, ittifoq, musobaqa | `faction.ts` `diplomacy()` | ✅ |
| Jang (sim): kuch, jang, o'lim, guvohlar, yaqinlarga xabar (12–72 soat) | `sim/combat.ts` | ✅ |
| O'lim oqibatlari: qasos qasamyodi, rahbar o'limi → vorislik inqirozi | `combat.ts kill()`, `memory.ts onMemory()` | ✅ |
| Hikoya direktori: 15 qoida (urush, ittifoq, vorislik, qasos, qotillik sirlari, poraxo'r, yulduz, adovat…) | `sim/director.ts` | ✅ |
| Yilnoma matnlari | `sim/chronicle.ts` | ✅ |
| Katta xarita, hududlar (tier), POI, yo'llar; POI → sim joylari | `game/terrain.ts`, `game/worldgen.ts` | ✅ |
| O'yinchi = sim NPC; real-time jang; sekta a'zoligi/vazifalar; inventar/hunarmandchilik; joylar (taverna, mehmonxona, kutubxona, teleport) | `game/*.ts`, `public/*` | ✅ |
| Saqlash v2 (butun dunyo snapshot) | `game.ts toSave/restore` | ✅ |
| Kuzatuvchi (/) va o'yin (/play) — bitta dunyo; NPC paneli | `viewer/*` | ✅ |
| Testlar: determinizm, 203 o'yin testi, soak (yadro 10 seed), katta soak (3–5 seed) | `cli/*` | ✅ |

## 2. Qayta ishlatiladigan tizimlar
Xotira/munosabat/rishta, gossip, sayohat, operatsiyalar, vorislik/schism, diplomatiya, direktor, yilnoma,
saqlash, kuzatuvchi paneli — bularning hammasi to'g'ridan-to'g'ri kengaytiriladi, yangisi yozilmaydi.

## 3. O'zgartirilishi kerak bo'lgan tizimlar
- **Vaqt**: fasl va ob-havo yo'q → kalendar qatlami (fasl, ob-havo, hafta kuni) qo'shiladi; sayohat, mehnat, mashq, jinoyatga ta'sir qiladi.
- **Maqsadlar**: faqat `avenge`, `seek_master` → shuhratparastlik maqsadlari (unvon, boylik, raqibdan o'tish, risola izlash), ular `decide()` ga og'irlik beradi va bajarilganda dunyoni o'zgartiradi.
- **Kun tartibi**: kasbga xos smenalar (tungi qo'riqchi, kechki taverna, bozor soatlari, qaroqchilarning tungi faolligi).
- **NPC paneli**: kayfiyat, joriy maqsad, o'yinchiga munosabat, o'yinchi haqidagi xotiralar.
- **Iqtisod**: hozir faqat maosh + fraksiya kumushi → aholi punkti iqtisodi (oziq-ovqat, xavfsizlik, farovonlik, narxlar).
- **Kultivatsiya**: bitta `talent` raqami → iste'dod turlari, texnikalar, yorilish oqibatlari xilma-xil.

## 4. Yangi tizimlar
Kalendar va ob-havo · shuhratparastlik maqsadlari · kayfiyat · aholi punkti holati (aholi, oziq, xavfsizlik, farovonlik) ·
tovar narxlari · hudud nazorati (kim qaysi yo'l/qishloqni nazorat qiladi) · jinoyat/mukofot (bounty) · mahalliy obro' ·
oila (nikoh, tug'ilish, meros) · simulyatsiya darajalari (LOD) · tarix (yil/fasl bo'yicha xronika).

## 5. Ma'lumot tuzilmalari (rejalashtirilgan)
```ts
World.weather: { kind: 'clear'|'cloudy'|'rain'|'storm'|'fog'|'snow'; since: number }   // snapshot'ga kiradi
Goal.type += 'rank_up' | 'wealth' | 'surpass' | 'find_manual';   Goal.amount?: number
Settlement { id; pop; food; security; prosperity; prices: Record<Good, number>; controller?: factionId }   // 2-bosqich
Bounty { target; issuer; reward; reason; day }                                                             // 2-bosqich
Faction.territory: string[]  (nazoratdagi joylar)                                                          // 3-bosqich
NPC.talents?: Partial<Record<'sword'|'qi'|'body'|'alchemy'|'medicine'|'craft', number>>; techniques?: string[]  // 4-bosqich
```

## 6. Amalga oshirish tartibi
1. **Poydevor** — kalendar/ob-havo, kasbga xos kun tartibi, shuhratparastlik maqsadlari, raqiblik, kayfiyat,
   NPC paneli (kayfiyat, maqsad, o'yinchiga munosabat), ssenariy testlari (§49: 1, 2, 3). ✅ *bajarildi*
   (1 yil, 580 NPC: ~28 do'kon ochildi, ~50 oila boyidi, ~50 raqiblik, ~50 risola topildi, 85–108 ms/kun)
2. **Tirik dunyo** — aholi punkti iqtisodi va narxlar (qo'shni joylar orasida savdo, savdo yo'li buzilsa narx oshadi),
   jinoyat/mukofot, oila (nikoh, tug'ilish, meros), tungi jinoyatlar. Testlar: 6, 7.
   ✅ *bajarildi*: iqtisod, narxlar (NPC va o'yinchi bozori), oila, aholi yangilanishi, ko'chish, ocharchilik. Jinoyat/mukofot → 3-bosqich bilan.
   (1 yil: tug'ildi ~50–60, nikoh ~70, o'lim ~30–80, aholi +2…+8%, 73–98 ms/kun; xotira so'nishi haftalik — tezlik uchun)
3. **Fraksiyalar** ✅ *bajarildi* (jinoyat/mukofot, mahalliy obro', hudud nazorati va bosib olish, urush ta'minoti/charchash, sektalar urushida hudud o'tishi) — hudud o'zgarishi oqibatlari, urushda qo'shin/ta'minot, ichki siyosat chuqurlashuvi. Test 5.
4. **Kultivatsiya** ✅ *bajarildi* (+ aholi ×4 ≈ 2600 NPC, LOD va indekslar bilan ~200 ms/kun) — iste'dod turlari, texnikalar (risolalar NPC'larga ham), yorilish natijalari (mutatsiya, yangi texnika, o'lim). Test 4.
5. **Paydo bo'luvchi hikoyalar** ✅ *bajarildi* (`sim/quests.ts`) — iltimoslar dunyo voqealaridan (talangan karvon, guvohsiz o'g'rilik, bosib olingan qishloq, ocharchilik, sirli qotillik, tabibsiz yarador); dunyo ham hal qiladi (jazo yurishi, hudud egasining don karvoni, ozodlik), hech kim hal qilmasa — oqibat (do'kon yopiladi, ochlikdan o'lim, cho'loqlik); kechikkan oqibatlar (qasoskor, sekta taklifi, minnatdorlik). To'dalar bozor arafasida karvon yo'llarini nishonga oladi. Testlar 8, 9.
   (1 yil, katta dunyo: karvon ~41, bosib olingan qishloqni ozod qilish ~35, o'g'rilik tergovi ~15, tabib/dori ~14, ocharchilik ~12; oqibatlar: ~2 do'kon yopiladi, hudud egasi ~1 marta don karvoni yuboradi (qolgan ocharchiliklarda — ochlikdan o'lim). Ssenariy 8 (1 yil, seed 11): 51 karvon iltimosi, yordamsiz qolgan har bir savdogar kumushining yarmini yo'qotdi, 8 do'kon yopildi; director/plots/gossip tezlashtirildi — bir xil mashinada 425–503 → 324–355 ms/kun (director yil oxirida ~200 → ~5 ms/kun). Diqqat: bu sinov VM'ida katta soak tezlik gate'i (< 100 ms/kun har 1000 NPC) hali o'tmaydi — o'zgartirishdan oldin ham o'tmagan edi)
6. **Tarix** ← *keyingi* — yil/fasl bo'yicha xronika, NPC/fraksiya/hudud tarixi, o'yinchi qarorlari; Voqealar ro'yxati bosiladigan; eski voqealarni yillik xulosaga siqish (`w.events` cheksiz o'sadi), 10 yillik soak.

## 7. Unumdorlik xavflari
- Hozir ~550 NPC × har soat utility AI ≈ 80–105 ms/kun (chegara 150). Yangi har-soat mantiq qo'shilmaydi;
  maqsad va iqtisod — kunlik/oylik.
- Aholi punkti iqtisodi — joy darajasida (NPC emas), kuniga bir marta: O(joylar + yo'llar).
- LOD (3-daraja: statistik qishloq) — faqat o'lchov ko'rsatsa kiritiladi (keraksiz murakkablik qilmaslik).
- `w.at(loc)` va `w.members()` chiziqli — og'ir joylarda `perHour` keshidan foydalanish.
- Xotira o'sishi: 200 da siqiladi; yangi xotira turlari ham shu chegaraga bo'ysunadi.
- `w.events` cheksiz o'sadi: kunlik kod uni boshidan skanerlamasligi kerak — `w.eventsOf(type)` / `lastEventOf()` (turi bo'yicha indeks) yoki oxiridan `seq` bo'yicha. Tarix bosqichida eski voqealar yillik xulosaga siqiladi.
- Saqlash hajmi: snapshot'ga qo'shiladigan har maydon kichik bo'lishi kerak (voqealar ro'yxati eng katta qism).

## Ssenariy testlari (§49)
`npm run scenarios` — har bosqich o'z testlarini qo'shadi.
| # | Ssenariy | Bosqich |
|---|---|---|
| 1 | O'yinchi 30 kun hech narsa qilmaydi → dunyo o'zgaradi | 1 ✅ |
| 2 | 1 yil → kimdir o'ladi, kimdir kuchayadi, maqsadlar bajariladi, fraksiyalar o'zgaradi | 1 ✅ |
| 3 | Muhim NPC o'ldiriladi → yaqinlar, fraksiya reaksiyasi | 1 ✅ |
| 4 | NPC'ga risola berish → kuchayadi | 4 ✅ |
| 5 | Fraksiya urushi → hudud va NPC'lar o'zgaradi | 3 ✅ |
| 6 | Savdo yo'li buziladi → iqtisod o'zgaradi | 2 ✅ |
| 7 | Qishloqni 1 yil tark etish → qishloq holati o'zgaradi | 2 ✅ |
| 8 | Karvon talanadi, hech kim yordam bermaydi → savdogar kambag'allashadi, do'kon yopiladi | 5 ✅ |
| 9 | O'yinchi qaroqchini o'ldiradi → kunlar o'tib qasoskor keladi | 5 ✅ |
