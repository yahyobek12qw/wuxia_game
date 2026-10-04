# WUXIA: A Living Martial World — M0 headless simulyatsiya

Grafikasiz dunyo simulyatsiyasi: 50 NPC, 3 fraksiya, 8 manzil. Dunyo player'siz yashaydi va o'zidan hikoyalar chiqaradi.
Bu TDD'dagi **M0 bosqichi**. Maqsad — grafikaga pul sarflashdan oldin dizaynni arzon tekshirish.

## Ishga tushirish

```bash
npm install
npm run sim -- --seed=2 --days=365          # out/chronicle_seed2.md + out/events_seed2.jsonl
npm run soak                                 # 10 seed × 365 kun, M0 gate hisoboti: out/soak_report.md
npm run scenarios                            # tirik dunyo ssenariylari: 30 kun / 1 yil o'yinchisiz, muhim NPC o'limi
npm run soak:big                             # katta dunyo (~460 NPC) 3 seed × 365 kun: out/big_soak_report.md
npm test                                     # determinizm + save/load testi
npm run sim -- --seed=5 --days=120 --save=out/s.json   # holatni saqlash
npm run sim -- --seed=5 --days=120 --load=out/s.json   # davom ettirish
npm run viewer                               # http://localhost:5173 (kuzatuvchi) va http://localhost:5173/play (o'yin)
npm run gen                                  # data/npcs.json ni qayta generatsiya qilish
```

## M0 gate natijasi

| Mezon | Natija |
| --- | --- |
| 1 yil player'siz, ≥10 hikoya, ≥6 tur, invariantlar (10 seed) | 10/10 PASS (33–73 hikoya, 8–11 tur) |
| Xilma-xillik: eng katta tur ≤40%, o'lik qoidalar yo'q | PASS (eng katta ulush 32%, 12/12 qoida ishlaydi) |
| Determinizm (bir xil seed → bir xil dunyo) | PASS |
| Save/load o'rtada == to'g'ridan-to'g'ri ishlatish | PASS |
| Tezlik | 1 o'yin yili ≈ 4 s (Node 22) |

## O'yin rejimi (Tales of Immortal uslubida) — `/play`

O'yinchi sim ichidagi haqiqiy NPC (`id: player`), har harakati dunyo vaqtini soatma-soat oldinga suradi, dunyo esa unga javob beradi (bosqinda tinch aholi sifatida kumushi talanadi, suhbat orqali mish-mishlar o'rganiladi, sovg'a/jang NPC xotirasiga yoziladi).

- **Katakli xarita:** 50×35 katak, siyoh-akvarel uslubi (bambuk, tol, tog', ko'l), kulrang tuman: ochilgan hududni eslab qoladi.
- **Harakat:** WASD/o'qlar yoki katakni bosib borish (yo'l topish, voqea bo'lsa to'xtaydi). Vaqt: yo'l 1s, dala 2s, o'rmon 3s, tog' 5s; suvdan o'tib bo'lmaydi.
- **Z** tadqiq (o't/ruda/kumush topish), **C** mashq (qi katakka bog'liq, yutuq yoki qi og'ishi), **T** dam olish, **H** o't ishlatish, **U** sotish, **L** razvedka (kashf etilgan joylardagi voqealar), **R** hikoyalar/maktublar, **N** atrofdagilar panelini yig'ish.
- **Statlar:** Vitality (jarohatdan), Energy, Focus; bosqichlar: Qi tozalash → Poydevor → Oltin yadro → Yangi ruh.
- **Real-time jang** (`src/viewer/public/combat.js`): tepadan ko'rinish, siyoh uslubi. Jang klientda 60 kadr/s o'ynaladi, server uchrashuvni belgilaydi va natijani sim'ga qo'llaydi (jarohat, o'lja, tajriba, NPC xotirasi).
  - Boshqaruv: WASD yurish, sichqoncha nishon va zarba, 1–7 yoki hotbar ko'nikmalari, Probel sakrash, o'ng tugma qi to'pi, Q shifo o'ti, X qochish.
  - Ko'nikmalar bosqichga qarab ochiladi: Qilich, Qi to'pi, Sakrash (1-bosqich), Shamol tig'i, Himoya (2), Qi portlashi (3), Shifo o'ti. Energy va Focus sarflanadi.
  - Dushmanlar: bo'ri to'dasi, to'ng'iz (zaryad), yo'lbars (sakrash), qaroqchi/o'qchi, NPC duelchi; **boss** — Qora o'rmon Daraxt Ruhi (ildiz zarbalari, chirmovuq askarlar, 2-faza).
  - Uchrashuvlar: yurishda tasodifiy (o'rmon 12%, tog' 15%, dala 5%, yo'l 3%), Qora o'rmonda boss, NPC bilan «Jang». G'alabadan keyin NPC ni ayash yoki o'ldirish tanlanadi; mag'lubiyatda o'lmaysiz (jarohat, kumush yo'qoladi).
  - Dev: `/api/game/debug?realm=3&enc=wolf&n=3&sp=5&item=ore&n=3` — bosqich, uchrashuv, ochko, buyum (faqat localhost; nashrdan oldin olib tashlash kerak).
- **Ko'nikma daraxti (K):** har yutuq uchun 1, boss uchun 2 ochko. Ko'nikma 1→5 daraja (n→n+1 narxi n ochko); har daraja zarar +18%, sarf −5%, sovish −6%.
- **Saqlash:** o'yin `saves/game.json` ga avtomatik saqlanadi (har harakatdan 3 soniya keyin, atomik yozuv), 💾 tugmasi qo'lda saqlaydi; server qayta ishga tushsa o'yin davom etadi. ↻ yangi o'yin boshlaydi. Yuklangan o'yin aynan bir xil davom etishi testda tekshiriladi.
- **Fraksiyalar (G):** `src/game/sect.ts`. Bazada (Qingyun cho'qqisi, qaroqchilar lageri, Daryo shahri) qo'shilasiz: sekta — tashqi shogird, to'da — 40 kumush o'lpon, hokimiyat — qo'riqchi. Rahbarning ishonchi va o'tmishingiz (a'zolarini o'ldirganmisiz) hisobga olinadi.
  - Vazifalar sim holatidan tuziladi: qaroqchi/yirtqich ovi, o't yoki ruda yig'ish, patrul, qasos (sim'dagi haqiqiy qotil), qaroqchilar uchun o'lpon va raqib fraksiyani qo'rqitish. 20 kun muddat, bir vaqtda 2 tagacha.
  - Hissa: ustoz saboqi (7 kunda bir), xazina (ko'nikma ochkosi, o't, davolanish). Oylik maosh unvonga qarab, sekta usuli mashqni tezlashtiradi.
  - Unvon hissa va bosqich bilan oshadi; oqsoqol bo'lsangiz sim'dagi vorislik inqirozida da'vogar bo'lishingiz mumkin. O'z birodaringizni o'ldirsangiz haydalasiz.
  - Xaritada vazifa joylari oltin belgi bilan, ekrandan tashqarida bo'lsa chekkada strelka; qasos nishoni ☠.
- **Inventar va hunarmandchilik (I):** `src/game/items.ts`.
  - Xom ashyo: o't, ruda (tadqiq), hayvon terisi (bo'ri/to'ng'iz), yo'lbars suyagi, ruh o'ti va qi kristali (qi zich o'rmon/tog' kataklari, boss).
  - Alkimyo istalgan joyda (muvaffaqiyat 60% + 8%×bosqich, omadsizlikda xom ashyo yo'qoladi): shifo, qi, kuch (3 jang +25% hujum), yutuq (+25% yutuq imkoniyati) dorilari.
  - Temirchilik Daryo shahrida, faqat temirchi Chen Kai tirik bo'lsa (sim'da o'lsa — yopiladi): qilichlar, zirhlar, tumor. Jihozlar hujum, himoya, vitality, focus, energy'ga qo'shiladi va jangda ishlaydi.
  - Bozor: qishloq (o't, teri) va shahar (ruda, dorilar ham; sotish ×1.3). Eski saqlash fayllari (inventarsiz) ham yuklanadi.
- **Katta dunyo (M — xarita):** 500×350 = 175 000 katak, `src/game/terrain.ts` har seed uchun ~0.4 s da yaratadi.
  - Markazda — sim yadrosi (Majnuntol vodiysi, 50×35, oldingi xarita o'zgarmagan); atrofda protsedural dunyo: sharqda dengiz, tog' tizmalari, daryolar, ko'llar.
  - ~19 hudud, xavf darajasi 1..8 (yadrodan uzoqlashgan sari yirtqichlar kuchliroq), hududga kirganda ogohlantirish.
  - ~140 joy: shahar (bozor + temirxona), qishloq (bozor), g'or, xaroba (ruh boss), tashlandiq sekta, ibodatxona (mashq ×1.5), qaroqchilar uyasi. Qo'riqchili joylarda Z — jang, tozalansa xazina (kristall, ruh o'ti, jihoz) va ko'nikma ochkosi.
  - Joylar va sim manzillari yo'llar bilan bog'langan (ko'priklar, dovonlar).
  - Texnik: xarita bir marta ~490 KB (base64), har harakatda holat ~6 KB; kashf etilganlar klientda, saqlashda bitset (v2). Eski v1 saqlash yadroga ko'chiriladi. Yo'l topish — heap'li A*.
  - **Butun dunyo sim'da yashaydi** (`src/game/worldgen.ts`): har shahar/qishloq/uya/ziyorat joyi sim manzili, har yo'l sim yo'li (A* bilan chizilgan, ~3 katak/soat). Har shaharda qo'riqchilar fraksiyasi va aholi (hokim, kapitan, qo'riqchilar, savdogar, temirchi, shifokor...), qishloqlarda oilalar, uyalarda to'dalar — ~460 NPC, ~30 fraksiya. To'dalar yaqin qishloqlarni talaydi va savdo yo'llarida pistirma qiladi, qo'riqchilar patrul va jazo yurishi qiladi; temirchi o'lsa o'sha shahar temirxonasi yopiladi. Kuzatuvchi rejimi (`/`) va o'yin (`/play`) — **bitta dunyo**: kuzatuvchi o'yin dunyosini ko'rsatadi (o'yinchi 'Siz' belgisi bilan), tezlik tugmalari shu dunyoning vaqtini yuritadi (o'yinchi kutib turadi; o'yinda harakat qilsangiz yoki jang boshlansa — pauza), 'Qayta boshlash' ikkala oyna uchun yangi o'yin. Kuzatuvchi o'yin bilan bir xil siyoh-akvarel uslubida; standart holatda **tuman** — faqat o'yinchi kashf etgan joylar ochiq (NPC, voqea va to'lqinlar ham), **V** — butun dunyo (xudo nigohi). Ko'rinishi (relyef katakli xaritadan, yaqinda daraxt/tog' belgilari, barcha joylar, yo'llar, fraksiya hududlari, ~550 NPC).
- **Tashqi sektalar:** har dunyoda 8–11 tirik sekta (tog' va o'rmonlarda, qi zich), ~1/4 qismi eng xavfli hududlardagi iblis sektalari. Har sektada rahbar, 2–3 oqsoqol, ichki va tashqi shogirdlar, ustoz-shogird rishtalari. To'g'ri yo'l sektalari yaqin qishloqlarni himoya qiladi va dushmanga jazo yurishiga chiqadi; iblis sektalari qaroqchilardek talaydi. Ikkita ibodatxonada zohid ustoz — ustoz izlash safarlari. O'yinchi istalgan sektaga qo'shila oladi (iblis sektasiga — o'lpon bilan).
- **Tezlik:** fraksiya munosabatlari endi har NPC'da saqlanmaydi, o'qishda jonli hisoblanadi (`rel(a, b, w)`); `alive()` keshi. Katta dunyo (~550 NPC) kuniga ~90 ms.
- **Sektalararo diplomatiya** (`diplomacy()` faction.ts): 48 soat ichidagi to'g'ri yo'l sektalari raqobatlashadi (rahbarlar shuhratparastligi, chegara to'qnashuvlari, oylik musobaqalar); taranglik 85 dan oshsa urush (sekta sektaga jazo yurishi qila oladi), 45 dan tushsa sulh; umumiy iblis tahdidi bo'lsa ittifoq — ittifoqchilar yurishlarga birga chiqadi. Hikoya turlari: Sektalar urushi, Ittifoq, Musobaqa. Sektangiz urushda bo'lsa — urush vazifasi; zal va kuzatuvchi panelida ⚔/🤝.
- **Musobaqada qatnashish:** musobaqa har oyning 8-kuni e'lon qilinadi va 15-kuni o'tadi. Shu orada sektangiz zalida (G) «⚔ Sekta chempioni bo'lish» tugmasi chiqadi: raqib sektaning eng kuchli shogirdi bilan o'limsiz real-time bellashuv. G'alaba: tajriba, +60 kumush, +30 hissa, rahbar sizni eslaydi; musobaqa kuni sektangiz g'olib deb e'lon qilinadi (yilnomada «Siz»). Mag'lubiyat: faqat jarohat, kumush yo'qolmaydi. Qatnashmasangiz chempionlarni sim o'zi bellashtiradi.
- **Tovush** (`public/sound.js`, fayllarsiz — WebAudio sintezi): har bir ko'nikma, zarba, jarohat, to'siq, o'q, Daraxt ruhining g'azabi, g'alaba/mag'lubiyat; xaritada qadam, tadqiq, mashq, kumush, yorilish (gong + arpedjio), teleport, voqealar (yaxshi/yomon/xavf). Generativ musiqa: sayohatda D-minor pentatonik guzheng (Karplus–Strong) + dron, jangda taiko ritmi. 🔊 tugmasi yoki **O**: hammasi → faqat effektlar → ovozsiz (brauzerda eslab qolinadi). Tovush birinchi bosish/tugmadan keyin yoqiladi (brauzer qoidasi).
- **Joylarga kirish (E)** (`src/game/places.ts`): shahar — taverna, mehmonxona, savdo palatasi, temirxona, qo'llanmalar markazi, teleport darvozasi, zal; qishloq — taverna, mehmonxona, bozor; sekta — kutubxona, teleport, zal; uya — qora bozor, taverna. Taverna mish-mishi yashirin joyni xaritada ochadi; savdo palatasida haftalik noyob tovar (sotuvchi — sim'dagi tirik savdogar); risolalar ko'nikma ochkosi/tajriba beradi (sekta a'zosiga 50% chegirma); teleport faqat kashf etilgan shahar/sektalarga.
- **Dunyo xaritasi (M):** tumanli relyef (kashf etilmagan joylar shakli), hudud nomlari va xavfi doim, mashhur shahar/sektalar '?' bilan; g'ildirak bilan yaqinlashtirish, sudrab siljitish, joyni bosganda tafsilot paneli, teleport va yo'l chizish.
- **Tirik dunyo, 1-bosqich** (yo'l xaritasi: `docs/LIVING_WORLD_PLAN.md`):
  - **Kalendar va ob-havo** (`sim/calendar.ts`): 4 fasl × 90 kun; har kuni ob-havo (ochiq, bulutli, yomg'ir, bo'ron, tuman, qor; faslga qarab). Yomg'ir/qor/bo'ron NPC va o'yinchi sayohatini sekinlashtiradi, bo'ronda qaroqchilar hujum qilmaydi va odamlar uydan chiqmaydi, dehqon daromadi faslga bog'liq (kuzda hosil), bo'ron mashqni susaytiradi. HUD va kuzatuvchida fasl + ob-havo.
  - **Kasbga xos kun tartibi**: dehqon tongdan, mehmonxonachi kechqurun, bozor 8–18, qo'riqchilarning uchdan biri tungi smenada.
  - **Shuhratparastlik maqsadlari** (`sim/ambition.ts`): unvon (tashqi → ichki shogird → oqsoqol), boylik (dehqon pul yig'ib do'kon ochadi — yangi savdogar paydo bo'ladi; boshqalar oilasiga ulush beradi), raqibdan o'zish, xarobada qadimiy risola izlash. Maqsad mashq/ish og'irligini oshiradi, bajarilganda yilnomaga tushadi. Bir sektadagi teng kuchli shuhratparast shogirdlar **raqib** bo'ladi (yangi hikoya turi «Raqiblik»).
  - **Kayfiyat**: ehtiyojlar, jarohat, so'nggi 10 kun xotiralari, qasos va qashshoqlikdan; g'azabnok odam alamini boshqalardan oladi.
  - **NPC paneli** (o'yinda «Atrofdagilar»dagi ismni bosing): rol, yosh, bosqich, joy, hozirgi ishi, kayfiyati, sizga munosabati (ishonch, hurmat, mehr, nafrat, qo'rquv, qarz), yaqinlari, siz haqingizdagi xotiralari. **Maqsad va xarakter yashirin** — ishonchini qozonganingizdan keyin ochiladi. Kuzatuvchi panelida ham kayfiyat va maqsadlar.
- **Tirik dunyo, 2-bosqich:**
  - **Aholi punkti iqtisodi** (`sim/settlement.ts`): har shahar/qishloqda oziq-ovqat zaxirasi (kunlarda), xavfsizlik, farovonlik, baxt, aholi va sig'im. Dehqonlar hosil yetishtiradi (kuzda ko'p, qishda kam), qishloq ortiqchasini savdo yo'li orqali shaharga yuboradi; pistirma/bosqin/bo'ron yo'lni yopadi → shaharda zaxira kamayadi, don qimmatlashadi, farovonlik tushadi. Ocharchilik (yangi hikoya turi) → odamlar ko'chib ketadi, kambag'al dehqonlar qaroqchilarga qo'shiladi; qaroqchilar boy, lekin himoyasiz qishloqlarni tanlaydi.
  - **Narxlar** 6 tovar guruhida (oziq, dori, temir, qurol, teri/mato, noyob buyumlar): taqchillik, urush, yarador aholi, farovonlikka bog'liq. NPC ovqat xarajati va maoshi (dehqon — don narxi, savdogar — farovonlik, tabib — dori narxi) va **o'yinchi bozori** shu narxlarda. Joy paneli (E) holat va narxlarni ko'rsatadi.
  - **Oila** (`sim/family.ts`): to'ylar (bir-birini yomon ko'rmaydigan turmush qurmaganlar), tug'ilish (joyning baxti, oziq-ovqati va sig'imiga bog'liq; bola ota-onaning xarakteri va iste'dodini meros oladi), bolalik (yengil kun tartibi, jangga kirmaydi, bolaga hujum qilib bo'lmaydi), 16 yoshda kasb tanlash (iste'dodli va oliyjanob — sektaga, aks holda ota-ona kasbi, qaroqchi bolasi — to'daga), meros (pul turmush o'rtog'i va farzandlarga, do'kon farzandga), motam.
  - **Aholi o'zini to'ldiradi**: o'lganlar o'rnini tug'ilganlar, sarson-sargardonlar va yangi to'dalar egallaydi; joylar sig'imi cheksiz o'sishni to'xtatadi (1 yilda: ~60–80 o'lim, ~70–85 qo'shilish).
- **Tirik dunyo, 3-bosqich:**
  - **Hudud nazorati** (`sim/territory.ts`): qaroqchilar 30 kunda 3 marta talagan va egasi himoya qila olmagan qishloqni **bosib oladi** — qishloq o'lpon to'laydi, xavfsizlik va farovonlik tushadi, asl egasi qasos yurishiga tayyorlanadi. Ozodlik: jazo yurishi to'da uyasini yengsa, to'da tarqalsa, to'da kuchsizlansa yoki asl egasi bosim o'tkazsa (nazorat 0 ga tushadi), yoki **o'yinchi bosqinchilarni shu qishloqda yengsa**. Ozod qishloq 60 kun mustahkam. Sektalar urushida g'olib yengilganning qishloqlarini oladi. Hudud fraksiyaga soliq/o'lpon beradi, urush esa kumushni yeydi — kumush tugasa urushdan charchash sulhga olib keladi. Egalik saqlashda saqlanadi.
  - **Jinoyat va mukofot** (`sim/law.ts`): o'g'rilik (kambag'al, ochko'z, vijdonsiz odamlar; guvoh bo'lmasa — "noma'lum o'g'ri"), guvohlar oldida qotillik, bosqin → mahalliy qonun (qo'riqchilar yoki joy egasi) jinoyatchi boshiga **mukofot e'lon qiladi**. Mukofot ovchilari (qo'riqchilar, ochko'z jasur sargardonlar) nishonni yolg'iz tutishga harakat qiladi; kim o'ldirsa — mukofot o'shaniki (o'yinchi ham).
  - **O'yinchi qidiruvda**: guvohlar oldida begunohni o'ldirsangiz — shu hudud qo'riqchilari dushman (qizil), yoningizga kelsa hibsga olishga urinadi (yutqazsangiz — jarima va zindon); joy panelida jarimani to'lab qutulish mumkin; mehmonxonaga kiritishmaydi.
  - **Mahalliy obro'**: har joyda alohida — aholining sizga munosabatidan (ishonch, hurmat, mehr, qo'rquv) va qidiruvdan hisoblanadi: Qahramon / Hurmatli / Tanish / Notanish / Shubhali / Yomon otliq / Qidiruvdagi jinoyatchi. Qaroqchi yoki jinoyatchini o'ldirsangiz — atrofdagi qishloq eshitadi; qishloqni ozod qilsangiz — butun aholi "hayotimni saqlab qolgan" deb eslaydi. Obro' narxlarga ta'sir qiladi (qahramonga −10%).
  - **Joy paneli (E)** — «Qonun va obro'»: obro'ingiz, qonun egasi, hudud egasi (bosib olingan bo'lsa — kim, qachondan, nazorat %), qidiruv va jarima, **e'lonlar taxtasi** (nishon, jinoyati, bosqichi, oxirgi ko'rilgan joyi, ortidagi ovchi, mukofot).
- **Aholi ×4 (~2600 NPC)**: qishloqda 5–7 oila (qari ota-onalar, qarindosh qo'shnilar), shaharda 8–10 oila va ko'proq qo'riqchi/hunarmand, sektada 25–30, to'dada 13–16 kishi.
- **Simulyatsiya darajalari (LOD) va tezlik** (brif §39–40): o'yinchidan 10 soatlik yo'ldan uzoqdagi NPC'lar har soatda qayta o'ylamaydi — joriy ishini (uyqu, ish, mashq, suhbat, davolanish) davom ettiradi, natijasi har soat hisoblanadi; jangchilar har 3, oddiy aholi har 4 soatda qaror qiladi, shoshilinch ehtiyoj, ovqat vaqti yoki qasos/ov maqsadi bo'lsa — darhol. O'yinchi yaqinidagilar — to'liq AI. Joy va fraksiya indekslari, inkremental munosabatlar, mish-mish keshlari, haftalik xotira so'nishi. Natija: ~2700 NPC — ~200 ms/kun (1000 NPC'ga ~75 ms, avvalgidan 2× samaraliroq); o'yinda 4 soatlik dam olish ~45 ms. Katta soak gate: < 100 ms/kun har 1000 NPC.
- **Tirik dunyo, 4-bosqich — kultivatsiya** (`sim/cultivation.ts`):
  - **Iste'dod turi**: qilich, musht, qi, tana, kimyogarlik, tabobat, hunarmandlik (bola ota yoki onadan oladi). Qi — mashq tezroq, tana — kuchliroq, tabobat — tabib tezroq davolaydi, hunar — temirchi ko'proq topadi.
  - **Uslublar**: I–III darajali umumiy uslublar, har sektaning o'z uslubi (II) va rahbarga meros sirli san'ati (III), NPC'lar yaratgan uslublar. Kuch = bosqich × jarohat × uslublar (iste'dodga mos uslub ×1.5) — janglar, fraksiya kuchini baholash, qasos tayyorligi hammasi shundan.
  - **Ustoz–shogird**: ustoz har oy shogirdga uslub o'rgatadi; ustoz yonida mashq 25% tezroq; ichki shogirdlar va oqsoqollar sekta uslubini oladi, rahbar — sirli san'atni.
  - **Yorilish natijalari**: muvaffaqiyat, ilhom (yangi uslub yaratadi — hikoya turi «Yangi uslub»), mutatsiya (iste'dod uyg'onadi), qi og'ishi (jarohat), yuqori bosqichda jarohatli va intizomsiz bo'lsa — o'lim; 7-bosqich — butun dunyoga tarqaladigan buyuk yorilish.
  - **Risolalar**: xarobada topilgan risola NPC'ga uslub beradi; **o'yinchi NPC'ga risola sovg'a qila oladi** (NPC paneli → «📕 … berish»): u uslub o'rganadi, kuchayadi va sizni ustoz sifatida umrbod eslaydi. NPC panelida kuch, iste'dod (ishonch qozonilgach) va uslublar.
- **Keyingi:** 5-bosqich — paydo bo'luvchi vazifalar (dunyo holatidan: yo'qolgan karvon, o'g'irlangan narsa, bosib olingan qishloq, mukofot), kechikkan oqibatlar; 6-bosqich — tarix (yil/fasl xronikasi).

## Kuzatuvchi: jonli 2D xarita (viewer)

`npm run viewer` (ixtiyoriy: `-- --seed=5`) → brauzerda http://localhost:5173. Qo'shimcha kutubxonasiz: Node HTTP server simulyatsiyani yuritadi, `src/viewer/public/index.html` esa canvas'da 3200×2200 o'lchamli xaritani chizadi.

- Relyef, daryo, ko'llar, o'rmon, tog'lar, yo'llar (koordinatalar `data/world.json` da: `x`, `y`, `pts`).
- NPC'lar yo'l bo'ylab yuradi; fraksiya rangi, rahbar halqasi, jarohat, harakat belgisi (zoom ≥1.3).
- Hudud ranglari, kecha/kunduz, jang/o'lim/siyosat to'lqinlari.
- O'ng panelni **P** tugmasi yoki chetdagi tugma bilan yashirish mumkin (tanlov eslab qolinadi).
- Pan/zoom, minixarita, NPC'ni bosish → xarakter, ehtiyoj, munosabat, xotira; kuzatish (F), pauza (probel).
- Panellar: voqealar (filtr, bosilsa xaritada uchadi), fraksiyalar (tension), hikoyalar.
- Tezlik: 2/6/24/96 soat/s va MAX; seed tanlash va qayta boshlash.

## Tuzilma (TDD bo'limlari bilan)

| Fayl | Nima qiladi | TDD |
| --- | --- | --- |
| `src/core/rng.ts` | Seed'li RNG, har tizim uchun alohida oqim | 13 |
| `src/core/eventBus.ts` | Tizimlar faqat event orqali gaplashadi | 3, 15 |
| `src/sim/world.ts` | Dunyo holati, yo'llar, sayohat, snapshot | 3, 13 |
| `src/sim/npcAI.ts` | Utility AI: ehtiyojlar, jadval, mashq, gossip | 5 |
| `src/sim/memory.ts` | Xotira, decay, 5 o'qli munosabatlar, qasos maqsadlari | 6 |
| `src/sim/combat.ts` | L2 jang: formula, "yiqilish", o'lim qarori | 9 |
| `src/sim/faction.ts` | Fraksiya AI, operatsiyalar, vorislik, fitnalar, yollash | 7 |
| `src/sim/director.ts` | Story Director: 12 ta seed rule, pacing, kuzatuv | 8 |
| `src/sim/chronicle.ts` | Event log → o'zbekcha xronika | 15 (Sim Log Viewer o'rniga) |
| `data/*.json` | Dunyo, fraksiyalar, NPC'lar | 12 |
| `src/viewer/` | Server, kuzatuvchi xaritasi (`index.html`) va o'yin (`play.html`) | 15 |
| `src/game/` | O'yinchi qatlami: katakli relyef (`terrain.ts`), harakatlar (`game.ts`) | — |

Vaqt: simulyatsiya 1 soatlik tick'da ishlaydi (TDD'dagi L2 darajasi). Kunlik tizimlar soat 23:00 da ishlaydi.

## Emergent hikoya misoli (seed 2)

Hech biri oldindan yozilmagan:

1. 16-kun: sekta rahbari Mo Tianhe qarilikdan vafot etadi → Han Jue va Su Qinglan o'rtasida vorislik inqirozi.
2. Ikkala da'vogar shogirdlarga sovg'a berib, tarafdor yig'adi.
3. 22-kun, tunda: Han Jue (ambition 0.9, honor 0.3) raqibini yashirincha o'ldiradi. Tasodifan 2 shogird buni ko'rib qoladi.
4. 23-kun: yagona da'vogar sifatida Han Jue rahbar bo'ladi. Guvohlar qo'rqib jim yurishadi.
5. 143-kun: sir asta-sekin ishonchli odamlar orasida tarqaladi, uch kishi haqiqatni biladi → fosh bo'ladi → Han Jue haydaladi, rahbarlikni Fang Lu oladi.

## Sim'ni umumlashtirish (katta dunyo uchun)

- Fraksiya va NPC AI endi joy nomlariga bog'liq emas: to'dalar 24 soat ichidagi qishloqlarni, 20 soat ichidagi savdo yo'llarini nishonga oladi; sektalar o'z qishloqlarini qo'riqlaydi; qo'riqchilar o'z yo'llarini patrul qiladi; uzoq nishonga operatsiya vaqti suriladi.
- Yadro natijalari saqlangan: 10 seeddan 7 tasi bit-ma-bit bir xil, farq faqat bo'linish bo'lgan seedlarda (bo'lingan sekta endi o'z bazasida yashaydi).
- Tezlik: `alive()` keshi, Dijkstra marshrut va masofa keshlari, soatlik keshlar.

## O'zgarishlar (M0 barqarorlashtirish)

- Fraksiya tarangligi kuniga 0.15 ga so'nadi; tarqalgan fraksiya tensionlari tozalanadi.
- Jazo yurishi faqat kuch ustunligi (≥1.2×) bo'lganda e'lon qilinadi.
- Bir jangchi bir jangda ko'pi bilan 2 kishini tugatadi.
- Xatolar: vorislikda o'lik da'vogar toj kiyishi; soat ichida o'ldirilgan NPC harakat qilishi.
- Iqtisod: fraksiya saqlash xarajati, daromad, qaroqchilar isrofi.
- Aholi 70 ga yetganda sargardonlar kelmaydi; hokimiyatga yollash qo'shildi (5 yillik soak).
- `src/cli/invariants.ts` va kengaytirilgan soak gate. Eski natija: `out/soak_baseline.md`.

## Ma'lum cheklovlar (M1 dan oldin)

- Utility harakatlari hali kodda, JSON'da emas (TDD 12-bo'lim talabi). Bu keyingi refaktor.
- Iqtisod hali sodda: fraksiya daromadi/xarajati va isrofi bor, lekin narxlar yo'q.
- Qasos (revenge) hali yuqori o'lim sababi (74/~280; maqsad 120 kunda so'nadi); qasos jangi mantig'i keyingi balans qadami.
- Qarilikdan o'lim juda kam (4/10 seed); NPC aylanishi (tug'ilish/yangi avlod) yo'q.
- Xronika matnli. Vizual Sim Log Viewer keyingi qadam.
