'use strict';
// Real-time jang: tepadan ko'rinish, siyoh uslubi. play.html'dagi global yordamchilarni (ctx, human, bamboo, tree, ...) ishlatadi.
const Combat = (() => {
  const sfx = (n) => { if (typeof Sfx !== 'undefined') Sfx.play(n); };
  const AW = 1500, AH = 950, MARGIN = 50;
  const SK = [
    { id: 'slash', name: 'Qilich', key: '1', cd: 0.5, e: 0, f: 0, need: 0, info: 'Yaqin zarba' },
    { id: 'ball', name: "Qi to'pi", key: '2', cd: 0.9, e: 12, f: 0, need: 1, info: "Qi to'pini uloqtiradi" },
    { id: 'dash', name: 'Sakrash', key: '3', cd: 1.5, e: 0, f: 12, need: 1, info: 'Qisqa sakrash, zarbadan saqlanadi (Probel)' },
    { id: 'wind', name: "Shamol tig'i", key: '4', cd: 2.2, e: 20, f: 0, need: 2, info: "Uch shamol tig'i, hammasini teshib o'tadi" },
    { id: 'shield', name: 'Himoya', key: '5', cd: 8, e: 16, f: 0, need: 2, info: 'Zarbalarni yutadigan qalqon' },
    { id: 'nova', name: 'Qi portlashi', key: '6', cd: 6.5, e: 34, f: 15, need: 3, info: "Atrofdagilarni uloqtiradi" },
    { id: 'herb', name: "Shifo o'ti", key: '7', cd: 1.5, e: 0, f: 0, need: 0, info: "Vitality'ning 35% ini tiklaydi" },
  ];
  const R = { wolf: 15, boar: 22, tiger: 25, bandit: 16, archer: 15, duelist: 16, vine: 14, treant: 54 };
  let st = null, dom = null, bgCache = null;
  // Ko'nikma darajasi: 1..5 — zarar +18%, sarf -5%, sovish -6% har darajada
  const lvOf = (id) => Math.min(5, Math.max(1, (st?.p.sk?.[id]) ?? 1));
  const costs = (s) => { const l = lvOf(s.id) - 1; return { e: Math.round(s.e * (1 - 0.05 * l)), f: Math.round(s.f * (1 - 0.05 * l)), cd: s.cd * (1 - 0.06 * l), m: 1 + 0.18 * l }; };
  const rnd = Math.random;

  // ---------------- CSS va DOM ----------------
  function ensureDom() {
    if (dom) return;
    const css = document.createElement('style');
    css.textContent = `
      body.in-combat #hot, body.in-combat #near, body.in-combat #right, body.in-combat #tl, body.in-combat #tr, body.in-combat #zoom, body.in-combat #char { display: none !important; }
      body.in-combat #log { display: none; }
      #cbt { position: fixed; inset: 0; pointer-events: none; z-index: 8; display: none; }
      body.in-combat #cbt { display: block; }
      #cbt > * { pointer-events: auto; }
      #ctitle { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); padding: 5px 16px; background: rgba(15,20,20,.82); border: 1px solid #5a6a65; border-radius: 8px; font-weight: 600; pointer-events: none !important; }
      #boss { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); width: min(520px, 70vw); text-align: center; display: none; pointer-events: none !important; }
      #boss .nm { text-shadow: 0 1px 3px #000; margin-bottom: 3px; font-weight: 600; } #boss .bb { height: 12px; background: #1a1210; border: 1px solid #7a6a5f; border-radius: 3px; overflow: hidden; } #boss .bb i { display: block; height: 100%; background: linear-gradient(#d65b4f, #8a2e26); }
      #hotbar { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); display: flex; gap: 6px; }
      .slot { position: relative; width: 58px; height: 58px; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #3b4744, #161d1c); border: 2px solid #8fa39c; overflow: hidden; text-align: center; font-size: 10px; color: #e8efe9; cursor: pointer; box-shadow: 0 2px 8px #000a; }
      .slot .k { position: absolute; top: 2px; left: 0; right: 0; font-weight: 700; color: #ffd479; font-size: 11px; }
      .slot .n { position: absolute; top: 20px; left: 2px; right: 2px; line-height: 1.1; font-weight: 600; }
      .slot .c { position: absolute; bottom: 3px; left: 0; right: 0; color: #9ad0ff; font-size: 10px; }
      .slot .cd { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.72); height: 0; }
      .slot.off { opacity: .45; filter: grayscale(.8); }
      .slot.lock .n { color: #888; }
      #runbtn { position: absolute; left: 14px; bottom: 14px; width: 64px; height: 64px; border-radius: 50%; border: 3px solid #d7c9a3; background: radial-gradient(circle at 50% 30%, #6b5b3a, #2b2418); color: #fff3cf; font-weight: 700; cursor: pointer; box-shadow: 0 2px 10px #000a; }
      #clog { position: absolute; right: 14px; bottom: 14px; width: 250px; text-align: right; font-size: 12px; text-shadow: 0 1px 2px #000; pointer-events: none !important; }
      #clog div { color: #ffd479; }
      #cmsg { position: absolute; inset: 0; display: none; place-items: center; background: rgba(0,0,0,.45); }
      #cmsg .box { background: #1b2423; border: 1px solid #5a6a65; border-radius: 14px; padding: 22px 34px; text-align: center; min-width: 300px; }
      #cmsg h2 { margin: 0 0 6px; font-size: 28px; } #cmsg p { margin: 0 0 14px; color: #c8d3ce; } #cmsg .row { display: flex; gap: 10px; justify-content: center; }
      #cmsg button { font: inherit; color: #fff; padding: 8px 18px; border-radius: 8px; border: 1px solid #6d7f79; background: #2b3735; cursor: pointer; } #cmsg button:hover { background: #3a4a47; } #cmsg button.red { border-color: #8f3b37; color: #ffb4ae; }
      #chint { position: absolute; left: 50%; bottom: 112px; transform: translateX(-50%); font-size: 12px; color: #d6ded9; text-shadow: 0 1px 3px #000; pointer-events: none !important; white-space: nowrap; }`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'cbt';
    d.innerHTML = `<div id="ctitle"></div><div id="boss"><div class="nm"></div><div class="bb"><i></i></div></div><div id="hotbar"></div><div id="chint">WASD — yurish · sichqoncha — nishon/zarba · 1–7 ko'nikmalar · Probel — sakrash</div>
      <button id="runbtn" title="Jangdan qochish">Qochish</button><div id="clog"></div><div id="cmsg"><div class="box"><h2></h2><p></p><div class="row"></div></div></div>`;
    document.body.appendChild(d);
    const hb = d.querySelector('#hotbar');
    for (const s of SK) {
      const el = document.createElement('div'); el.className = 'slot'; el.dataset.id = s.id; el.title = `${s.name}: ${s.info}`;
      el.innerHTML = `<div class="k">${s.key}</div><div class="n">${s.name}</div><div class="c">${s.e ? s.e + ' E' : ''}${s.f ? ' ' + s.f + ' F' : ''}</div><div class="cd"></div>`;
      el.onclick = () => st && cast(s.id); hb.appendChild(el);
    }
    d.querySelector('#runbtn').onclick = () => { if (st && !st.ended && !st.runT) { st.runT = 1.4; addNum(st.p.x, st.p.y - 50, 'Qochilmoqda…', '#ffe28a'); } };
    dom = { root: d, title: d.querySelector('#ctitle'), boss: d.querySelector('#boss'), bossNm: d.querySelector('#boss .nm'), bossBar: d.querySelector('#boss .bb i'), hb, slots: [...hb.children], log: d.querySelector('#clog'), msg: d.querySelector('#cmsg'), msgBox: d.querySelector('#cmsg .box') };
  }

  // ---------------- Fon ----------------
  function buildBg(spec) {
    const c = document.createElement('canvas'); c.width = AW; c.height = AH; const g = c.getContext('2d'), r = rngF(spec.id * 7919 + 13);
    const t = spec.terrain, base = t === 2 ? ['#cfd2cc', '#b9bdb7'] : t === 1 ? ['#c9d3c6', '#b3c2b2'] : ['#d8d9c9', '#c3c7b3'];
    const gr = g.createRadialGradient(AW / 2, AH / 2, 100, AW / 2, AH / 2, AW * 0.7); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.fillRect(0, 0, AW, AH);
    for (let k = 0; k < 90; k++) { g.globalAlpha = 0.05 + r() * 0.07; g.fillStyle = r() < 0.5 ? '#7b8a7b' : '#e8e6d6'; g.beginPath(); g.ellipse(r() * AW, r() * AH, 40 + r() * 120, 14 + r() * 40, r() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (let k = 0; k < 260; k++) { const x = r() * AW, y = r() * AH; for (let b = -1; b <= 1; b++) curve(g, x + b * 2, y, x + b * 3, y - 5, x + b * 5, y - 7 - r() * 5, r() < 0.5 ? '#7d9a76' : '#9bb083', 1.3, 0.75); }
    // chekka bezaklari (to'qnashuvsiz)
    const decor = [];
    for (let k = 0; k < 120; k++) {
      const edge = r(); let x, y;
      if (edge < 0.3) { x = r() * AW; y = r() * 130; } else if (edge < 0.6) { x = r() * AW; y = AH - r() * 110; } else if (edge < 0.8) { x = r() * 110; y = r() * AH; } else { x = AW - r() * 110; y = r() * AH; }
      decor.push({ x, y, k: r() });
    }
    decor.sort((a, b) => a.y - b.y);
    for (const d of decor) {
      g.save(); g.translate(d.x, d.y); g.scale(1.5, 1.5);
      if (t === 2) { if (d.k < 0.5) mountain(g, 0, 0, 34, r, d.k < 0.2); else tree(g, 0, 0, 36, r); }
      else if (t === 1) { if (d.k < 0.45) { bamboo(g, 0, 0, 56, r); bamboo(g, 8, 4, 44, r); } else if (d.k < 0.8) tree(g, 0, 0, 52, r); else willow(g, 0, 0, 54, r); }
      else { if (d.k < 0.5) grass(g, r, 1); else if (d.k < 0.8) tree(g, 0, 0, 46, r); else bamboo(g, 0, 0, 44, r); }
      g.restore();
    }
    return c;
  }

  // ---------------- Boshlash / tugatish ----------------
  function start(spec, onEnd) {
    ensureDom();
    const P = spec.player, realm = P.realm;
    st = {
      spec, onEnd, t: 0, ended: null, endT: 0, kills: 0, herbsUsed: 0, runT: 0, nid: 1,
      p: { x: AW * 0.28, y: AH * 0.5, r: 16, hp: P.vit, hpMax: P.vitMax, energy: P.energy, eMax: P.energyMax, focus: P.focus, fMax: P.focusMax, face: 0, atk: P.atk, realm, herbs: P.herbs,
        sk: P.skills ?? {}, def: Math.min(0.6, realm * 0.03 + (P.def ?? 0)), spd: 215, inv: 0, hurt: 0, dash: null, shield: 0, shieldT: 0, slashT: 0, trail: [], hp0: P.vit },
      en: [], pr: [], fx: [], nums: [], cds: {}, keys: new Set(), mouse: { x: 0, y: 0, sx: W * 0.7, sy: H / 2, down: false }, cam: { x: 0, y: 0 }, bg: buildBg({ ...spec, id: spec.id, terrain: spec.terrain }),
    };
    const n = spec.enemies.length;
    spec.enemies.forEach((e, i) => {
      const ang = (i / n - 0.5) * 1.6, boss = e.type === 'treant';
      st.en.push({ id: st.nid++, type: e.type, name: e.name, x: boss ? AW * 0.78 : AW * 0.74 + Math.cos(ang) * 60, y: boss ? AH * 0.5 : AH * 0.5 + Math.sin(ang) * 220 + (rnd() - 0.5) * 60, r: R[e.type] ?? 16,
        hp: e.hp, hpMax: e.hp, dmg: e.dmg, spd: e.spd, state: 'chase', timer: 0, cd: 0.8 + rnd(), flash: 0, kx: 0, ky: 0, face: Math.PI, boss, phase: 1, slamCd: 5, sumCd: 8, hit: false, w: 0, vine: false });
    });
    dom.title.textContent = spec.title + (P.power ? ' · 🔴 Kuch dorisi' : ''); dom.msg.style.display = 'none';
    const boss = st.en.find((e) => e.boss); dom.boss.style.display = boss ? 'block' : 'none'; if (boss) dom.bossNm.textContent = boss.name;
    dom.log.innerHTML = '';
    dom.slots.forEach((el, i) => el.classList.toggle('lock', realm < SK[i].need));
    document.body.classList.add('in-combat');
    Combat.active = true;
    if (typeof Sfx !== 'undefined') { Sfx.setMode('combat'); sfx('encounter'); }
  }

  function finish(result, spare) {
    const p = st.p, cb = st.onEnd, out = { result, hp: Math.max(0, Math.round(p.hp)), energy: Math.round(p.energy), focus: Math.round(p.focus), herbsUsed: st.herbsUsed, spare: !!spare };
    st = null; Combat.active = false; if (typeof Sfx !== 'undefined') Sfx.setMode('explore'); document.body.classList.remove('in-combat'); dom.msg.style.display = 'none';
    cb(out);
  }
  function showEnd(title, text, buttons) {
    dom.msgBox.querySelector('h2').textContent = title; dom.msgBox.querySelector('p').textContent = text;
    const row = dom.msgBox.querySelector('.row'); row.innerHTML = '';
    for (const b of buttons) { const el = document.createElement('button'); el.textContent = b.t; if (b.red) el.className = 'red'; el.onclick = b.f; row.appendChild(el); }
    dom.msg.style.display = 'grid';
  }

  // ---------------- Yordamchilar ----------------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return Math.abs(d); };
  function addNum(x, y, text, col = '#ff6b63') { st.nums.push({ x, y, text, col, t: 0 }); }
  function logLine(t) { const d = document.createElement('div'); d.textContent = t; dom.log.appendChild(d); while (dom.log.children.length > 5) dom.log.firstChild.remove(); setTimeout(() => d.remove(), 6000); }
  function splat(x, y, col = 'rgba(110,20,20,.38)') { const g = st.bg.getContext('2d'); for (let k = 0; k < 6; k++) { g.fillStyle = col; g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 18, 3 + rnd() * 7, 2 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); } }

  function hurtEnemy(e, dmg, kx, ky) {
    if (e.hp <= 0) return;
    dmg = Math.round(dmg); e.hp -= dmg; e.flash = 0.12; if (!e.boss) { e.kx += kx; e.ky += ky; }
    addNum(e.x + (rnd() - 0.5) * 20, e.y - e.r - 10, '-' + dmg, '#ffffff'); splat(e.x, e.y + 8); sfx(e.hp <= 0 ? 'kill' : 'hit');
    if (e.hp <= 0) {
      e.hp = 0; st.kills++; splat(e.x, e.y + 6, 'rgba(90,15,15,.5)'); st.fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r + 40, t: 0, max: 0.5, col: '#ffffff' });
      logLine(`${e.name} mag'lub etildi`);
      if (e.boss) for (const o of st.en) if (o.vine) o.hp = 0;
    }
  }
  function hurtPlayer(dmg, from) {
    const p = st.p; if (st.ended) return;
    if (p.inv > 0) { addNum(p.x, p.y - 44, 'Chetlab o\'tdi', '#8fe0ff'); sfx('dodge'); return; }
    dmg = dmg * (1 - p.def);
    if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; addNum(p.x, p.y - 44, 'Zararsizlantirildi -' + Math.round(ab), '#8fe0ff'); sfx('block'); if (p.shield <= 0) p.shieldT = 0; }
    if (dmg <= 0) return;
    dmg = Math.max(1, Math.round(dmg)); p.hp -= dmg; p.hurt = 0.25; sfx('hurt'); st.runT = 0; addNum(p.x + (rnd() - 0.5) * 14, p.y - 40, '-' + dmg, '#ff5a52'); splat(p.x, p.y + 8, 'rgba(120,20,20,.3)');
    if (from) { const a = ang(from, p); p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14; }
  }

  // ---------------- Ko'nikmalar ----------------
  function cast(id) {
    if (!st || st.ended) return false;
    const s = SK.find((k) => k.id === id), p = st.p;
    const cs = s && costs(s);
    if (!s || p.realm < s.need || (st.cds[id] ?? 0) > 0 || p.energy < cs.e || p.focus < cs.f) return false;
    if (id === 'herb' && (p.herbs <= 0 || p.hp >= p.hpMax)) return false;
    p.energy -= cs.e; p.focus -= cs.f; st.cds[id] = cs.cd; sfx(id);
    const A = p.atk * cs.m, face = p.face;
    if (id === 'slash') {
      p.slashT = 0.2; st.fx.push({ k: 'arc', x: p.x, y: p.y, a: face, t: 0, max: 0.2, col: '#ffffff' });
      for (const e of st.en) if (e.hp > 0 && dist(p, e) < 86 + e.r && angDiff(ang(p, e), face) < 1.0) hurtEnemy(e, A * (0.9 + rnd() * 0.35), Math.cos(face) * 90, Math.sin(face) * 90);
    } else if (id === 'ball') st.pr.push({ x: p.x + Math.cos(face) * 20, y: p.y + Math.sin(face) * 20, vx: Math.cos(face) * 560, vy: Math.sin(face) * 560, dmg: A * 1.9, life: 1.3, r: 11, pierce: 0, k: 'ball', own: 'p', hit: new Set() });
    else if (id === 'wind') for (const o of [-0.2, 0, 0.2]) st.pr.push({ x: p.x, y: p.y, vx: Math.cos(face + o) * 760, vy: Math.sin(face + o) * 760, dmg: A * 1.15, life: 0.55, r: 9, pierce: 99, k: 'wind', own: 'p', hit: new Set(), a: face + o });
    else if (id === 'dash') {
      let dx = (st.keys.has('d') ? 1 : 0) - (st.keys.has('a') ? 1 : 0), dy = (st.keys.has('s') ? 1 : 0) - (st.keys.has('w') ? 1 : 0);
      if (!dx && !dy) { dx = Math.cos(face); dy = Math.sin(face); } const l = Math.hypot(dx, dy); p.dash = { t: 0.17, vx: dx / l * 1000, vy: dy / l * 1000 }; p.inv = 0.32;
    } else if (id === 'shield') { p.shield = Math.round((22 + 9 * p.realm) * cs.m); p.shieldT = 4.5; st.fx.push({ k: 'ring', x: p.x, y: p.y, r: 46, t: 0, max: 0.4, col: '#8fe0ff', follow: true }); }
    else if (id === 'nova') {
      st.fx.push({ k: 'ring', x: p.x, y: p.y, r: 150, t: 0, max: 0.45, col: '#ffe28a', fill: true });
      for (const e of st.en) if (e.hp > 0 && dist(p, e) < 150 + e.r) { const a = ang(p, e); hurtEnemy(e, A * 2.6, Math.cos(a) * 240, Math.sin(a) * 240); }
    } else if (id === 'herb') { p.herbs--; st.herbsUsed++; const h = Math.round(p.hpMax * (0.35 + 0.05 * (lvOf('herb') - 1))); p.hp = Math.min(p.hpMax, p.hp + h); addNum(p.x, p.y - 44, '+' + h, '#7fe0a0'); st.fx.push({ k: 'ring', x: p.x, y: p.y, r: 40, t: 0, max: 0.5, col: '#7fe0a0', follow: true }); }
    return true;
  }

  // ---------------- Dushman AI ----------------
  function meleeSwing(e, range, windup, dmg, cd) {
    e.state = 'wind'; e.timer = windup; e.w = windup; e.range = range; e.sdmg = dmg; e.cdMax = cd; e.face = ang(e, st.p);
  }
  function updateEnemy(e, dt) {
    const p = st.p; e.cd -= dt; e.flash = Math.max(0, e.flash - dt);
    e.x += e.kx * dt; e.y += e.ky * dt; const k = Math.pow(0.0008, dt); e.kx *= k; e.ky *= k;
    e.x = Math.max(MARGIN, Math.min(AW - MARGIN, e.x)); e.y = Math.max(MARGIN, Math.min(AH - MARGIN, e.y));
    const d = dist(e, p), a = ang(e, p), sp = e.spd;
    const move = (ang2, s) => { e.x += Math.cos(ang2) * s * dt; e.y += Math.sin(ang2) * s * dt; };
    if (e.state !== 'charge' && e.state !== 'pounce' && e.state !== 'wind') e.face = a;
    switch (e.type) {
      case 'wolf': case 'vine': case 'bandit': case 'duelist': {
        const range = e.type === 'wolf' ? 40 : e.type === 'vine' ? 42 : 52, windup = e.type === 'wolf' ? 0.22 : e.type === 'duelist' ? 0.32 : 0.4, cd = e.type === 'wolf' ? 0.9 : 1.3;
        if (e.state === 'chase') {
          const side = e.type === 'wolf' ? Math.sin(st.t * 3 + e.id) * 0.6 : 0;
          if (d > range - 6) move(a + side, sp * (e.type === 'vine' ? 0.75 : 1));
          if (d < range + 6 && e.cd <= 0) meleeSwing(e, range + 18, windup, e.dmg, cd);
          if (e.type === 'duelist' && e.cd < -2.2 && d > 100) { e.state = 'pounce'; e.timer = 0.22; e.face = a; e.hit = false; e.cd = 0.4; e.dashSp = 620; }
        } else if (e.state === 'wind') { e.timer -= dt; if (e.timer <= 0) { if (dist(e, p) < e.range + p.r) hurtPlayer(e.sdmg, e); st.fx.push({ k: 'arc', x: e.x, y: e.y, a: e.face, t: 0, max: 0.18, col: '#ff8a80' }); e.state = 'chase'; e.cd = e.cdMax; } }
        else if (e.state === 'pounce') { e.timer -= dt; move(e.face, e.dashSp); if (!e.hit && dist(e, p) < e.r + p.r + 6) { e.hit = true; hurtPlayer(e.dmg * 1.1, e); } if (e.timer <= 0) { e.state = 'chase'; e.cd = 0.5; } }
        break;
      }
      case 'boar':
        if (e.state === 'chase') { if (d > 70) move(a, sp * 0.9); if (d < 340 && e.cd <= 0) { e.state = 'aim'; e.timer = 0.75; e.w = 0.75; e.face = a; } }
        else if (e.state === 'aim') { e.timer -= dt; e.face = a; if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.55; e.hit = false; } }
        else if (e.state === 'charge') { e.timer -= dt; move(e.face, 560); if (!e.hit && dist(e, p) < e.r + p.r + 4) { e.hit = true; hurtPlayer(e.dmg * 1.3, e); } if (e.x <= MARGIN || e.x >= AW - MARGIN || e.y <= MARGIN || e.y >= AH - MARGIN) e.timer = 0; if (e.timer <= 0) { e.state = 'stun'; e.timer = 0.9; } }
        else if (e.state === 'stun') { e.timer -= dt; if (e.timer <= 0) { e.state = 'chase'; e.cd = 1.4; } }
        break;
      case 'tiger':
        if (e.state === 'chase') {
          if (d > 50) move(a, sp);
          if (d > 120 && d < 260 && e.cd <= 0) { e.state = 'aim'; e.timer = 0.4; e.w = 0.4; e.face = a; }
          else if (d < 56 && e.cd <= 0) meleeSwing(e, 70, 0.3, e.dmg, 1.0);
        } else if (e.state === 'aim') { e.timer -= dt; e.face = a; if (e.timer <= 0) { e.state = 'pounce'; e.timer = 0.42; e.hit = false; e.dashSp = 560; } }
        else if (e.state === 'pounce') { e.timer -= dt; move(e.face, e.dashSp); if (!e.hit && dist(e, p) < e.r + p.r + 4) { e.hit = true; hurtPlayer(e.dmg * 1.25, e); } if (e.timer <= 0) { e.state = 'chase'; e.cd = 1.6; } }
        else if (e.state === 'wind') { e.timer -= dt; if (e.timer <= 0) { if (dist(e, p) < e.range + p.r) hurtPlayer(e.sdmg, e); st.fx.push({ k: 'arc', x: e.x, y: e.y, a: e.face, t: 0, max: 0.2, col: '#ffb27a' }); e.state = 'chase'; e.cd = e.cdMax; } }
        break;
      case 'archer':
        if (e.state === 'chase') {
          if (d < 230) move(a + Math.PI, sp); else if (d > 340) move(a, sp); else move(a + Math.PI / 2 * Math.sign(Math.sin(e.id + st.t * 0.5)), sp * 0.5);
          if (e.cd <= 0 && d < 520) { e.state = 'wind'; e.timer = 0.45; e.w = 0.45; e.face = a; }
        } else if (e.state === 'wind') { e.timer -= dt; e.face = ang(e, p); if (e.timer <= 0) { sfx('arrow'); st.pr.push({ x: e.x, y: e.y, vx: Math.cos(e.face) * 430, vy: Math.sin(e.face) * 430, dmg: e.dmg, life: 1.6, r: 7, pierce: 0, k: 'arrow', own: 'e', a: e.face, hit: new Set() }); e.state = 'chase'; e.cd = 1.7; } }
        break;
      case 'treant': {
        const rage = e.hp < e.hpMax * 0.5; if (rage && e.phase === 1) { e.phase = 2; addNum(e.x, e.y - 90, 'G\'azab!', '#ff9a52'); sfx('roar'); logLine('Daraxt ruhi g\'azablandi!'); }
        e.slamCd -= dt; e.sumCd -= dt;
        if (e.state === 'chase') {
          if (d > 130) move(a, sp * (rage ? 1.5 : 1)); else if (e.cd <= 0) { e.state = 'wind'; e.timer = 0.9; e.w = 0.9; e.range = 150; e.sdmg = e.dmg * 1.1; e.face = a; }
          if (e.slamCd <= 0) { e.slamCd = rage ? 4.5 : 7; const n = rage ? 4 : 3; for (let i = 0; i < n; i++) { const o = i === 0 ? 0 : 130; const th = rnd() * 6.28; st.fx.push({ k: 'tele', x: p.x + Math.cos(th) * o, y: p.y + Math.sin(th) * o, r: 78, t: 0, max: 1.15, dmg: e.dmg * 1.2 }); } logLine('Ildizlar yer ostidan chiqmoqda!'); sfx('rumble'); }
          if (e.sumCd <= 0) { e.sumCd = rage ? 11 : 15; const alive = st.en.filter((o) => o.vine && o.hp > 0).length; for (let i = 0; i < 2 && alive + i < 5; i++) { const th = rnd() * 6.28; st.en.push({ id: st.nid++, type: 'vine', name: 'Chirmovuq askar', x: e.x + Math.cos(th) * 90, y: e.y + Math.sin(th) * 90, r: R.vine, hp: 26 + st.p.realm * 6, hpMax: 26 + st.p.realm * 6, dmg: Math.round(e.dmg * 0.4), spd: 105, state: 'chase', timer: 0, cd: 1, flash: 0, kx: 0, ky: 0, face: 0, boss: false, vine: true, phase: 1, slamCd: 0, sumCd: 0, hit: false, w: 0 }); } logLine('Chirmovuq askarlar paydo bo\'ldi!'); }
        } else if (e.state === 'wind') { e.timer -= dt; if (e.timer <= 0) { if (dist(e, p) < e.range + p.r) hurtPlayer(e.sdmg, e); st.fx.push({ k: 'ring', x: e.x, y: e.y, r: e.range, t: 0, max: 0.3, col: '#ffb27a' }); e.state = 'chase'; e.cd = rage ? 1.2 : 2; } }
        break;
      }
    }
    // dushmanlar bir-birini itaradi
    for (const o of st.en) if (o !== e && o.hp > 0) { const dd = dist(e, o), m = e.r + o.r; if (dd < m && dd > 0.01) { const a2 = ang(o, e), push = (m - dd) * 0.5; e.x += Math.cos(a2) * push; e.y += Math.sin(a2) * push; } }
  }

  // ---------------- Yangilash ----------------
  function update(dt) {
    const p = st.p; st.t += dt;
    for (const k in st.cds) st.cds[k] = Math.max(0, st.cds[k] - dt);
    p.inv = Math.max(0, p.inv - dt); p.hurt = Math.max(0, p.hurt - dt); p.slashT = Math.max(0, p.slashT - dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
    p.energy = Math.min(p.eMax, p.energy + 3.2 * dt); p.focus = Math.min(p.fMax, p.focus + 5 * dt);
    p.face = Math.atan2(st.mouse.y - p.y, st.mouse.x - p.x);
    if (!st.ended) {
      let dx = (st.keys.has('d') ? 1 : 0) - (st.keys.has('a') ? 1 : 0), dy = (st.keys.has('s') ? 1 : 0) - (st.keys.has('w') ? 1 : 0);
      if (p.dash) { p.x += p.dash.vx * dt; p.y += p.dash.vy * dt; p.dash.t -= dt; p.trail.push({ x: p.x, y: p.y, t: 0 }); if (p.dash.t <= 0) p.dash = null; }
      else if (dx || dy) { const l = Math.hypot(dx, dy); p.x += dx / l * p.spd * dt; p.y += dy / l * p.spd * dt; if (st.runT) { st.runT = 0; } }
      p.x = Math.max(MARGIN, Math.min(AW - MARGIN, p.x)); p.y = Math.max(MARGIN, Math.min(AH - MARGIN, p.y));
      if (st.mouse.down) cast('slash');
      if (st.runT > 0) { st.runT -= dt; if (st.runT <= 0) { st.runT = 0; st.ended = 'flee'; st.endT = 0.3; } }
      for (const e of st.en) if (e.hp > 0) updateEnemy(e, dt);
    }
    // o'qlar
    for (let i = st.pr.length - 1; i >= 0; i--) {
      const q = st.pr[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
      if (q.life <= 0 || q.x < 0 || q.y < 0 || q.x > AW || q.y > AH) { st.pr.splice(i, 1); continue; }
      if (q.own === 'p') { for (const e of st.en) if (e.hp > 0 && !q.hit.has(e.id) && dist(q, e) < q.r + e.r) { q.hit.add(e.id); hurtEnemy(e, q.dmg, q.vx * 0.12, q.vy * 0.12); if (q.pierce <= 0) { q.life = 0; st.fx.push({ k: 'ring', x: q.x, y: q.y, r: 34, t: 0, max: 0.25, col: '#9ad0ff' }); break; } q.pierce--; } }
      else if (dist(q, p) < q.r + p.r - 4) { hurtPlayer(q.dmg, null); q.life = 0; }
    }
    // effektlar
    for (let i = st.fx.length - 1; i >= 0; i--) {
      const f = st.fx[i]; f.t += dt; if (f.follow) { f.x = p.x; f.y = p.y; }
      if (f.t >= f.max) { if (f.k === 'tele' && !st.ended) { if (dist(f, p) < f.r + p.r - 6) hurtPlayer(f.dmg, null); st.fx.push({ k: 'ring', x: f.x, y: f.y, r: f.r, t: 0, max: 0.3, col: '#7fb06a', fill: true }); splat(f.x, f.y, 'rgba(60,80,40,.4)'); } st.fx.splice(i, 1); }
    }
    for (let i = st.nums.length - 1; i >= 0; i--) { const n = st.nums[i]; n.t += dt; n.y -= 34 * dt; if (n.t > 1) st.nums.splice(i, 1); }
    for (let i = p.trail.length - 1; i >= 0; i--) { p.trail[i].t += dt; if (p.trail[i].t > 0.25) p.trail.splice(i, 1); }
    st.en = st.en.filter((e) => e.hp > 0 || (e.dead = (e.dead ?? 0) + dt) < 0.35);
    // tugash sharti
    if (!st.ended) {
      if (p.hp <= 0) { p.hp = 0; st.ended = 'lose'; st.endT = 1.1; sfx('lose'); }
      else if (!st.en.some((e) => e.hp > 0)) { st.ended = 'win'; st.endT = 0.9; sfx('win'); }
    } else {
      st.endT -= dt;
      if (st.endT <= 0 && !st.shown) {
        st.shown = true;
        if (st.ended === 'flee') finish('flee');
        else if (st.ended === 'lose' && st.spec.kind === 'tournament') showEnd('Yutqazdingiz', 'Raqib kuchliroq chiqdi. Bu sharafli bellashuv edi — hech kim halok bo\'lmadi.', [{ t: 'Davom etish', f: () => finish('lose') }]);
        else if (st.ended === 'lose') showEnd("Mag'lub bo'ldingiz", 'Hushingizdan ketdingiz. Dushman sizni tark etdi, lekin jarohat og\'ir.', [{ t: 'Davom etish', f: () => finish('lose') }]);
        else if (st.spec.kind === 'npc') showEnd("G'alaba!", `${st.spec.enemies[0].name} yerga yiqildi. Uni nima qilasiz?`, [{ t: 'Ayash', f: () => finish('win', true) }, { t: "O'ldirish", red: true, f: () => finish('win', false) }]);
        else showEnd("G'alaba!", `${st.kills} dushman mag'lub etildi.`, [{ t: 'Davom etish', f: () => finish('win') }]);
      }
    }
  }

  // ---------------- Chizish ----------------
  function drawEnemy(e, now) {
    const c = ctx, x = e.x, y = e.y, f = e.face, flip = Math.cos(f) < 0 ? -1 : 1, dead = e.hp <= 0;
    if (dead) c.globalAlpha = Math.max(0, 1 - (e.dead ?? 0) / 0.35);
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x, y + e.r * 0.7, e.r * 1.1, e.r * 0.4, 0, 0, 7); c.fill();
    const tint = e.flash > 0;
    if (e.type === 'wolf' || e.type === 'boar' || e.type === 'tiger') {
      c.save(); c.translate(x, y); c.scale(flip, 1);
      const big = e.type === 'wolf' ? 1 : e.type === 'boar' ? 1.5 : 1.7, body = tint ? '#fff' : e.type === 'wolf' ? '#6b7078' : e.type === 'boar' ? '#5b4636' : '#d98b2b';
      const bob = Math.sin(now / 90 + e.id) * 1.5;
      c.fillStyle = body; c.strokeStyle = '#1b1f20'; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(0, bob - 4 * big, 17 * big, 9 * big, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.arc(15 * big, bob - 8 * big, 7 * big, 0, 7); c.fill(); c.stroke();
      c.fillStyle = tint ? '#fff' : '#2b2b2b'; c.beginPath(); c.moveTo(13 * big, bob - 14 * big); c.lineTo(16 * big, bob - 20 * big); c.lineTo(19 * big, bob - 13 * big); c.fill();
      c.strokeStyle = body; c.lineWidth = 3; c.beginPath(); c.moveTo(-16 * big, bob - 6 * big); c.quadraticCurveTo(-26 * big, bob - 14 * big, -24 * big, bob - 2 * big); c.stroke();
      c.strokeStyle = '#1b1f20'; c.lineWidth = 2; for (const lx of [-9, -2, 6, 12]) { const sw = Math.sin(now / 70 + lx) * 3; c.beginPath(); c.moveTo(lx * big, bob + 2 * big); c.lineTo(lx * big + sw, 8 * big); c.stroke(); }
      if (e.type === 'tiger') { c.strokeStyle = '#1b1210'; c.lineWidth = 2; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * 6 * big, bob - 12 * big); c.lineTo(k * 6 * big + 2, bob + 1 * big); c.stroke(); } }
      if (e.type === 'boar') { c.strokeStyle = '#f4efe0'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(20 * big, bob - 5 * big); c.quadraticCurveTo(26 * big, bob - 7 * big, 25 * big, bob - 13 * big); c.stroke(); }
      c.fillStyle = '#ffdc7a'; c.fillRect(17 * big, bob - 10 * big, 2.5, 2.5);
      c.restore();
    } else if (e.type === 'treant') {
      c.save(); c.translate(x, y + e.r * 0.5); const s = e.r / 54, sh = Math.sin(now / 500) * 2;
      c.scale(s, s);
      const wood = tint ? '#b58b70' : e.phase === 2 ? '#5b3a2c' : '#4a3a2e';
      c.fillStyle = wood; c.strokeStyle = '#1a1511'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-60, 8); c.quadraticCurveTo(-72, -60, -40, -110); c.lineTo(40, -110); c.quadraticCurveTo(72, -60, 60, 8); c.closePath(); c.fill(); c.stroke();
      for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(-44 + k * 11, 4); c.quadraticCurveTo(-48 + k * 11 + sh, -50, -38 + k * 11, -100); c.strokeStyle = 'rgba(20,14,10,.55)'; c.lineWidth = 1.6; c.stroke(); }
      for (const d of [-1, 1]) { c.strokeStyle = wood; c.lineWidth = 12; c.beginPath(); c.moveTo(d * 52, -80); c.quadraticCurveTo(d * 100, -120 + sh * 2, d * 120, -70); c.stroke(); c.strokeStyle = '#1a1511'; c.lineWidth = 2; c.stroke(); }
      for (let k = 0; k < 7; k++) { c.globalAlpha = 0.85 * (dead ? 0 : 1) + (dead ? Math.max(0, 1 - (e.dead ?? 0) / 0.35) * 0.85 : 0); c.fillStyle = k % 2 ? '#3f7269' : '#2f5d56'; c.beginPath(); c.arc(-70 + k * 24, -118 - (k % 3) * 14 + sh, 34, 0, 7); c.fill(); }
      c.globalAlpha = dead ? Math.max(0, 1 - (e.dead ?? 0) / 0.35) : 1;
      const eye = e.phase === 2 ? '#ff6a3a' : '#ffd24a'; c.fillStyle = '#0d0a08'; c.beginPath(); c.ellipse(-20, -70, 11, 7, -0.25, 0, 7); c.ellipse(20, -70, 11, 7, 0.25, 0, 7); c.fill(); c.fillStyle = eye; c.beginPath(); c.ellipse(-20, -70, 5, 3, -0.25, 0, 7); c.ellipse(20, -70, 5, 3, 0.25, 0, 7); c.fill();
      c.fillStyle = '#0d0a08'; c.beginPath(); c.ellipse(0, -36, 18, 11, 0, 0, 7); c.fill();
      c.restore();
    } else if (e.type === 'vine') {
      c.save(); c.translate(x, y); c.strokeStyle = tint ? '#fff' : '#4f8f3f'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(-6 + Math.sin(now / 150 + e.id) * 4, -10, 0, -26); c.stroke();
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(d * 14, -20, d * 18 + Math.sin(now / 120) * 3, -10); c.stroke(); }
      c.fillStyle = tint ? '#fff' : '#79b86a'; c.beginPath(); c.arc(0, -28, 6, 0, 7); c.fill(); c.fillStyle = '#ffdc7a'; c.fillRect(-3, -30, 2, 2); c.fillRect(1, -30, 2, 2); c.restore();
    } else {
      const robe = tint ? '#fff' : e.type === 'archer' ? '#5a4b2e' : e.type === 'duelist' ? '#51606b' : '#7a2f2b';
      human(x, y + e.r * 0.5, 56, robe, { sword: e.type !== 'archer', sash: '#c4453f', hat: e.type === 'archer' });
      if (e.type === 'archer') { c.strokeStyle = '#4a3320'; c.lineWidth = 2.5; c.beginPath(); c.arc(x + Math.cos(e.face) * 16, y - 18 + Math.sin(e.face) * 16, 14, e.face - 1.2, e.face + 1.2); c.stroke(); }
    }
    c.globalAlpha = 1;
    // telegraph (zarba oldidan ogohlantirish)
    if (!dead && (e.state === 'wind' || e.state === 'aim') && e.w > 0) {
      const prog = 1 - Math.max(0, e.timer) / e.w; c.save(); c.translate(x, y);
      if (e.state === 'aim') { c.strokeStyle = `rgba(220,60,50,${0.25 + 0.5 * prog})`; c.lineWidth = e.r * 1.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(e.face) * 330, Math.sin(e.face) * 330); c.stroke(); }
      else if (e.type === 'archer') { c.strokeStyle = `rgba(220,60,50,${0.2 + 0.5 * prog})`; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(e.face) * 260, Math.sin(e.face) * 260); c.stroke(); }
      else { c.fillStyle = `rgba(220,60,50,${0.12 + 0.3 * prog})`; c.beginPath(); if (e.type === 'treant') c.arc(0, 0, e.range, 0, 7); else { c.moveTo(0, 0); c.arc(0, 0, e.range, e.face - 0.9, e.face + 0.9); } c.fill(); }
      c.restore();
    }
    if (!dead) {
      const bw = Math.max(30, e.r * 2), by = y - e.r - (e.type === 'treant' ? 150 : e.type === 'wolf' || e.type === 'vine' ? 26 : 44);
      if (!e.boss) { c.fillStyle = 'rgba(10,10,10,.7)'; c.fillRect(x - bw / 2, by, bw, 4); c.fillStyle = '#d65b4f'; c.fillRect(x - bw / 2, by, bw * e.hp / e.hpMax, 4); }
    }
  }

  function frame(now, dt) {
    dt = Math.min(dt, 0.05); update(dt); if (!st) return;
    const p = st.p, z = Math.max(0.55, Math.min(1.35, H / 720));
    // kamera
    const hw = W / 2 / z, hh = H / 2 / z, cam = st.cam;
    cam.x = hw * 2 >= AW ? AW / 2 : Math.max(hw, Math.min(AW - hw, p.x)); cam.y = hh * 2 >= AH ? AH / 2 : Math.max(hh, Math.min(AH - hh, p.y));
    st.mouse.x = (st.mouse.sx - W / 2) / z + cam.x; st.mouse.y = (st.mouse.sy - H / 2) / z + cam.y;
    const c = ctx; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.fillStyle = '#2a302d'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-cam.x, -cam.y);
    c.drawImage(st.bg, 0, 0);
    // telegraflar (yer ostida)
    for (const f of st.fx) if (f.k === 'tele') { const pr = f.t / f.max; c.fillStyle = `rgba(200,50,40,${0.12 + 0.3 * pr})`; c.strokeStyle = `rgba(200,50,40,${0.5 + 0.4 * pr})`; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(f.x, f.y, f.r * pr, 0, 7); c.stroke(); }
    // dash izlari
    for (const tr of p.trail) { c.globalAlpha = 0.35 * (1 - tr.t / 0.25); human(tr.x, tr.y + 8, 52, '#20262b', { sword: true }); } c.globalAlpha = 1;
    // obyektlar y bo'yicha
    const list = [...st.en.map((e) => ({ y: e.y, f: () => drawEnemy(e, now) })), { y: p.y, f: () => drawPlayer(now) }]; list.sort((a, b) => a.y - b.y); for (const o of list) o.f();
    // snaryadlar
    for (const q of st.pr) {
      if (q.k === 'ball') { c.fillStyle = 'rgba(120,200,255,.35)'; c.beginPath(); c.arc(q.x, q.y, q.r * 1.8, 0, 7); c.fill(); c.fillStyle = '#e6f6ff'; c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.fill(); }
      else if (q.k === 'wind') { c.strokeStyle = 'rgba(120,230,150,.85)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(q.x - Math.cos(q.a) * 70, q.y - Math.sin(q.a) * 70); c.lineTo(q.x, q.y); c.stroke(); c.strokeStyle = 'rgba(230,255,235,.9)'; c.lineWidth = 1.2; c.stroke(); }
      else { c.strokeStyle = '#3a2a1a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(q.x - Math.cos(q.a) * 16, q.y - Math.sin(q.a) * 16); c.lineTo(q.x, q.y); c.stroke(); c.fillStyle = '#c4453f'; c.beginPath(); c.arc(q.x, q.y, 2.6, 0, 7); c.fill(); }
    }
    // effektlar
    for (const f of st.fx) {
      const pr = f.t / f.max;
      if (f.k === 'arc') { c.strokeStyle = f.col; c.globalAlpha = 1 - pr; c.lineWidth = 9 * (1 - pr) + 2; c.lineCap = 'round'; c.beginPath(); c.arc(f.x, f.y, 52 + 26 * pr, f.a - 0.95 + pr * 0.4, f.a + 0.95 - pr * 0.1); c.stroke(); c.globalAlpha = 1; }
      else if (f.k === 'ring') { c.globalAlpha = 1 - pr; if (f.fill) { c.fillStyle = f.col; c.globalAlpha = 0.28 * (1 - pr); c.beginPath(); c.arc(f.x, f.y, f.r * (0.3 + 0.7 * pr), 0, 7); c.fill(); c.globalAlpha = 1 - pr; } c.strokeStyle = f.col; c.lineWidth = 4 * (1 - pr) + 1; c.beginPath(); c.arc(f.x, f.y, f.r * (0.3 + 0.7 * pr), 0, 7); c.stroke(); c.globalAlpha = 1; }
    }
    // sonlar
    c.textAlign = 'center'; for (const n of st.nums) { c.globalAlpha = Math.min(1, 2 - n.t * 2); c.font = `700 ${n.text.length > 6 ? 13 : 17}px "Segoe UI", sans-serif`; c.lineWidth = 4; c.strokeStyle = 'rgba(10,10,10,.85)'; c.strokeText(n.text, n.x, n.y); c.fillStyle = n.col; c.fillText(n.text, n.x, n.y); } c.globalAlpha = 1;
    // nishon belgisi
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(st.mouse.x, st.mouse.y, 9, 0, 7); c.moveTo(st.mouse.x - 14, st.mouse.y); c.lineTo(st.mouse.x - 5, st.mouse.y); c.moveTo(st.mouse.x + 5, st.mouse.y); c.lineTo(st.mouse.x + 14, st.mouse.y); c.stroke();
    c.restore();
    // vinyeta va past qora
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (p.hp < p.hpMax * 0.3) { c.fillStyle = `rgba(160,0,0,${0.12 + 0.08 * Math.sin(now / 200)})`; c.fillRect(0, 0, W, H); }
    hud();
  }

  function drawPlayer(now) {
    const p = st.p, c = ctx, flip = Math.cos(p.face) < 0;
    if (p.shield > 0) { c.strokeStyle = `rgba(143,224,255,${0.5 + 0.3 * Math.sin(now / 120)})`; c.fillStyle = 'rgba(143,224,255,.12)'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - 12, 34, 0, 7); c.fill(); c.stroke(); }
    if (p.hurt > 0 && Math.floor(now / 50) % 2) c.globalAlpha = 0.5;
    human(p.x, p.y + 10, 58, '#20262b', { sash: '#e3b341', sword: true, hat: true });
    c.globalAlpha = 1;
    if (st.runT > 0) { const pr = 1 - st.runT / 1.4; c.strokeStyle = '#ffe28a'; c.lineWidth = 4; c.beginPath(); c.arc(p.x, p.y - 20, 30, -Math.PI / 2, -Math.PI / 2 + pr * 6.283); c.stroke(); }
    void flip;
  }

  function hud() {
    const p = st.p;
    $('#bv').style.width = Math.max(0, p.hp / p.hpMax) * 100 + '%'; $('#tv').textContent = `${Math.round(p.hp)}/${p.hpMax}`;
    $('#be').style.width = p.energy / p.eMax * 100 + '%'; $('#te').textContent = `${Math.round(p.energy)}/${p.eMax}`;
    $('#bf').style.width = p.focus / p.fMax * 100 + '%'; $('#tf').textContent = `${Math.round(p.focus)}/${p.fMax}`;
    const boss = st.en.find((e) => e.boss); if (boss) { dom.bossBar.style.width = Math.max(0, boss.hp / boss.hpMax) * 100 + '%'; dom.bossNm.textContent = `${boss.name} ${Math.max(0, Math.round(boss.hp))}/${boss.hpMax}`; }
    SK.forEach((s, i) => {
      const el = dom.slots[i], cd = st.cds[s.id] ?? 0, cs = costs(s), locked = p.realm < s.need, off = locked || p.energy < cs.e || p.focus < cs.f || (s.id === 'herb' && p.herbs <= 0);
      el.classList.toggle('off', off && !locked); el.classList.toggle('lock', locked); el.querySelector('.cd').style.height = (cd > 0 ? cd / cs.cd * 100 : 0) + '%';
      el.querySelector('.c').textContent = `${cs.e ? cs.e + ' E' : ''}${cs.f ? ' ' + cs.f + ' F' : ''}`; el.querySelector('.k').textContent = `${s.key}${lvOf(s.id) > 1 ? ' · ' + lvOf(s.id) : ''}`;
      if (s.id === 'herb') el.querySelector('.c').textContent = p.herbs + ' dona';
      if (locked) el.querySelector('.c').textContent = `${s.need}-bosqich`;
    });
  }

  // ---------------- Kirish ----------------
  const KEYMAP = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
  addEventListener('keydown', (e) => {
    if (!st || e.ctrlKey || e.metaKey) return; let k = e.key.toLowerCase(); k = KEYMAP[k] ?? k;
    if ('wasd'.includes(k) && k.length === 1) { st.keys.add(k); e.preventDefault(); return; }
    if (k === ' ') { e.preventDefault(); cast('dash'); return; }
    const i = '1234567'.indexOf(k); if (i >= 0 && k.length === 1) { cast(SK[i].id); return; }
    if (k === 'q') cast('herb'); if (k === 'x') document.getElementById('runbtn').click();
  });
  addEventListener('keyup', (e) => { if (!st) return; let k = e.key.toLowerCase(); k = KEYMAP[k] ?? k; st.keys.delete(k); });
  addEventListener('blur', () => { if (st) { st.keys.clear(); st.mouse.down = false; } });
  canvas.addEventListener('mousemove', (e) => { if (st) { st.mouse.sx = e.clientX; st.mouse.sy = e.clientY; } });
  canvas.addEventListener('mousedown', (e) => { if (st && e.button === 0) { st.mouse.down = true; st.mouse.sx = e.clientX; st.mouse.sy = e.clientY; } });
  addEventListener('mouseup', () => { if (st) st.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => { if (st) { e.preventDefault(); cast('ball'); } });

  return { active: false, start, frame, SK, get state() { return st; } };
})();
