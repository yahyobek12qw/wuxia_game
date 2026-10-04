'use strict';
// Tovush: hech qanday fayl yo'q — hammasi WebAudio bilan sintez qilinadi.
// Effektlar (zarba, sehr, gong, guzheng chertishi) + generativ musiqa (sayohat: pentatonik guzheng, jang: taiko).
const Sfx = (() => {
  const KEY = 'wuxia.sound';
  let cfg = { mode: 2 };                       // 2 = hammasi, 1 = faqat effektlar, 0 = ovozsiz
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && [0, 1, 2].includes(s.mode)) cfg = s; } catch (e) { /* */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* */ } };

  let ac = null, master, sfxG, musG, verbIn, noiseBuf, musicMode = 'explore', lastPlay = {};
  const plucks = new Map();
  const PENTA = [0, 3, 5, 7, 10];             // D minor pentatonik: D F G A C
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const note = (deg, base = 62) => base + 12 * Math.floor(deg / 5) + PENTA[((deg % 5) + 5) % 5];

  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
    master = ac.createGain(); master.connect(comp);
    sfxG = ac.createGain(); sfxG.connect(master); musG = ac.createGain(); musG.connect(master);
    // Reverb: shovqindan yasalgan impuls (tog' vodiysi aks-sadosi)
    const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = ac.createConvolver(); conv.buffer = ir; const wet = ac.createGain(); wet.gain.value = 0.32; conv.connect(wet); wet.connect(master);
    verbIn = conv;
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    apply();
    setInterval(schedule, 100);
  }
  function apply() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(cfg.mode ? 0.75 : 0, t, 0.05);
    musG.gain.setTargetAtTime(cfg.mode === 2 && !document.hidden ? 0.34 : 0, t, 0.3);
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, init, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); apply(); });

  // ---------------- Qurilish bloklari ----------------
  function out(dest, verb) { return verb && verbIn ? [dest, verbIn] : [dest]; }
  function tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, vol = 0.2, a = 0.005, delay = 0, dest = sfxG, verb = false, lp = 0 }) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(g); for (const d of out(dest, verb)) g.connect(d);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise({ type = 'bandpass', f = 1000, f2 = null, q = 1, dur = 0.2, vol = 0.2, a = 0.005, delay = 0, dest = sfxG, verb = false }) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); for (const d of out(dest, verb)) g.connect(d);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // Karplus–Strong: tortilgan tor (guzheng / guqin)
  function pluckBuf(f) {
    const k = Math.round(f * 4) / 4; if (plucks.has(k)) return plucks.get(k);
    const sr = ac.sampleRate, n = Math.floor(sr * 2.2), N = Math.max(2, Math.round(sr / k)), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
    let prev = 0; for (let i = 0; i < N; i++) { const x = Math.random() * 2 - 1; d[i] = prev = prev * 0.45 + x * 0.55; }
    const damp = 0.4985 + Math.min(0.0012, 40 / k / 1000);
    for (let i = N; i < n; i++) d[i] = (d[i - N] + d[i - N + 1]) * damp;
    plucks.set(k, b); return b;
  }
  function pluck(midi, { vol = 0.25, delay = 0, dest = sfxG, verb = true } = {}) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter();
    s.buffer = pluckBuf(hz(midi)); fl.type = 'lowpass'; fl.frequency.value = 3200; g.gain.value = vol;
    s.connect(fl); fl.connect(g); for (const d of out(dest, verb)) g.connect(d); s.start(t);
  }
  function gong(f = 180, vol = 0.18, dur = 2.2, delay = 0, dest = sfxG) {
    for (const [m, v] of [[1, 1], [1.48, 0.5], [2.14, 0.35], [2.87, 0.22], [4.1, 0.12]]) tone({ f: f * m, f2: f * m * 0.985, dur: dur / (0.8 + m * 0.3), vol: vol * v, a: 0.004, delay, dest, verb: true });
    noise({ type: 'lowpass', f: 900, dur: 0.12, vol: vol * 0.6, delay, dest });
  }
  const drum = (vol = 0.5, delay = 0, f = 78, dest = sfxG) => { tone({ f, f2: f * 0.5, dur: 0.32, vol, a: 0.003, delay, dest }); noise({ type: 'lowpass', f: 300, dur: 0.08, vol: vol * 0.5, delay, dest }); };

  // ---------------- Effektlar ----------------
  const FX = {
    slash() { noise({ f: 900, f2: 3400, q: 1.4, dur: 0.15, vol: 0.32 }); tone({ type: 'triangle', f: 320, f2: 120, dur: 0.07, vol: 0.06 }); },
    ball() { tone({ f: 260, f2: 880, dur: 0.28, vol: 0.18, verb: true }); tone({ type: 'triangle', f: 520, f2: 1760, dur: 0.22, vol: 0.06 }); },
    wind() { noise({ type: 'highpass', f: 1800, f2: 6500, q: 0.8, dur: 0.38, vol: 0.26, a: 0.03 }); noise({ f: 700, f2: 2400, q: 2, dur: 0.3, vol: 0.12 }); },
    dash() { noise({ f: 420, f2: 1900, q: 1.2, dur: 0.2, vol: 0.28, a: 0.02 }); },
    shield() { for (const [f, d] of [[880, 0], [1320, 0.04], [1760, 0.08]]) tone({ f, dur: 0.9, vol: 0.08, delay: d, verb: true }); },
    nova() { tone({ f: 130, f2: 34, dur: 0.75, vol: 0.7 }); noise({ type: 'lowpass', f: 1400, f2: 200, dur: 0.6, vol: 0.4 }); gong(330, 0.08, 1.6); },
    herb() { [62, 65, 69, 74].forEach((m, i) => pluck(m + 12, { vol: 0.16, delay: i * 0.07 })); },
    hit() { tone({ f: 190, f2: 60, dur: 0.12, vol: 0.42 }); noise({ type: 'lowpass', f: 2600, dur: 0.05, vol: 0.22 }); },
    kill() { FX.hit(); gong(420, 0.07, 1.1, 0.03); },
    hurt() { tone({ f: 96, f2: 42, dur: 0.26, vol: 0.55 }); noise({ type: 'lowpass', f: 900, dur: 0.16, vol: 0.3 }); tone({ type: 'sawtooth', f: 160, f2: 90, dur: 0.12, vol: 0.05, lp: 700 }); },
    block() { tone({ f: 1250, f2: 1180, dur: 0.25, vol: 0.09, verb: true }); tone({ f: 1870, dur: 0.18, vol: 0.05 }); },
    dodge() { noise({ type: 'highpass', f: 3000, dur: 0.1, vol: 0.1 }); },
    arrow() { tone({ type: 'triangle', f: 900, f2: 380, dur: 0.1, vol: 0.08 }); noise({ type: 'highpass', f: 4000, dur: 0.08, vol: 0.06 }); },
    roar() { tone({ type: 'sawtooth', f: 85, f2: 48, dur: 1.1, vol: 0.28, a: 0.08, lp: 420 }); noise({ type: 'lowpass', f: 380, dur: 1, vol: 0.25, a: 0.1 }); },
    rumble() { noise({ type: 'lowpass', f: 160, dur: 0.9, vol: 0.35, a: 0.15 }); },
    encounter() { drum(0.6); drum(0.45, 0.18); gong(150, 0.12, 2, 0.36); },
    win() { [62, 65, 67, 69, 74].forEach((m, i) => pluck(m, { vol: 0.22, delay: i * 0.09 })); gong(220, 0.08, 2.4, 0.5); },
    lose() { [57, 55, 53, 50].forEach((m, i) => pluck(m, { vol: 0.24, delay: i * 0.28 })); },
    click() { tone({ f: 1500, f2: 900, dur: 0.045, vol: 0.05 }); },
    step() { noise({ type: 'lowpass', f: 520, dur: 0.06, vol: 0.05 }); },
    coin() { tone({ f: 2100, dur: 0.12, vol: 0.07 }); tone({ f: 2800, dur: 0.16, vol: 0.06, delay: 0.06 }); },
    good() { pluck(81, { vol: 0.14 }); pluck(86, { vol: 0.12, delay: 0.1 }); },
    bad() { drum(0.35, 0, 70); },
    alert() { drum(0.45); drum(0.4, 0.15); gong(160, 0.08, 1.6, 0.25); },
    explore() { noise({ f: 2600, q: 0.7, dur: 0.3, vol: 0.08, a: 0.05 }); noise({ f: 1800, q: 0.7, dur: 0.25, vol: 0.06, a: 0.05, delay: 0.15 }); },
    cultivate() { tone({ f: 293.7, dur: 1.6, vol: 0.06, a: 0.3, verb: true }); tone({ f: 440, dur: 1.4, vol: 0.04, a: 0.4, delay: 0.1, verb: true }); },
    teleport() { tone({ f: 200, f2: 1600, dur: 0.6, vol: 0.12, a: 0.05, verb: true }); for (let i = 0; i < 5; i++) tone({ f: 1800 + i * 330, dur: 0.3, vol: 0.03, delay: 0.25 + i * 0.05, verb: true }); },
    breakthrough() { gong(110, 0.22, 3.2); [62, 67, 69, 74, 79, 81, 86].forEach((m, i) => pluck(m, { vol: 0.2, delay: 0.4 + i * 0.08 })); },
  };
  function play(name) {
    if (!ac || !cfg.mode || ac.state !== 'running') return;
    const f = FX[name]; if (!f) return;
    const now = ac.currentTime; if (now - (lastPlay[name] ?? -1) < 0.045) return; lastPlay[name] = now;   // bir xil tovush ustma-ust yig'ilmasin
    try { f(); } catch (e) { /* */ }
  }

  // ---------------- Generativ musiqa ----------------
  let nextT = 0, deg = 5, beat = 0, drone = null;
  function setDrone(on) {
    if (on && !drone && ac) {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.frequency.value = hz(38); o2.frequency.value = hz(45) * 1.003; g.gain.value = 0.035; lfo.frequency.value = 0.07; lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain); o.connect(g); o2.connect(g); g.connect(musG); o.start(); o2.start(); lfo.start();
      drone = { stop() { for (const x of [o, o2, lfo]) x.stop(); g.disconnect(); } };
    } else if (!on && drone) { drone.stop(); drone = null; }
  }
  function schedule() {
    if (!ac || ac.state !== 'running' || cfg.mode !== 2) return;
    const now = ac.currentTime; if (nextT < now) nextT = now + 0.05;
    setDrone(musicMode === 'explore');
    while (nextT < now + 0.3) {
      const d = nextT - now;
      if (musicMode === 'combat') {
        const pat = [1, 0, 0.5, 0, 1, 0.4, 0, 0.6], v = pat[beat % 8];
        if (v) drum(0.32 * v, d, beat % 8 === 0 ? 70 : 92, musG);
        if (beat % 4 === 2 && Math.random() < 0.7) { deg = Math.max(0, Math.min(11, deg + Math.floor(Math.random() * 5) - 2)); pluck(note(deg, 50), { vol: 0.16, delay: d, dest: musG }); }
        if (beat % 16 === 0) pluck(note(0, 38), { vol: 0.22, delay: d, dest: musG });
        beat++; nextT += 60 / 116 / 2;
      } else {
        deg = Math.max(0, Math.min(11, deg + Math.floor(Math.random() * 5) - 2));
        pluck(note(deg, 50), { vol: 0.15 + Math.random() * 0.08, delay: d, dest: musG });
        if (Math.random() < 0.22) pluck(note(deg - 2, 50), { vol: 0.1, delay: d + 0.04, dest: musG });            // ikki tovushli akkord
        if (Math.random() < 0.18) pluck(note(deg + 1, 50), { vol: 0.09, delay: d + 0.18, dest: musG });           // bezak (glissando o'rniga)
        nextT += [0.6, 0.9, 1.2, 1.8, 2.6][Math.floor(Math.random() * 5)];
      }
    }
  }
  function setMode(m) { if (m === musicMode) return; musicMode = m; beat = 0; if (ac) nextT = ac.currentTime + (m === 'combat' ? 0.6 : 1.5); }

  const ICON = ['🔇', '🔉', '🔊'], LABEL = ['Ovozsiz', 'Faqat effektlar', 'Effektlar + musiqa'];
  function cycle() { cfg.mode = (cfg.mode + 2) % 3; save(); init(); apply(); if (!cfg.mode || cfg.mode === 1) setDrone(false); return cfg.mode; }
  return { play, setMode, cycle, get mode() { return cfg.mode; }, get state() { return ac ? ac.state : 'none'; }, icon: () => ICON[cfg.mode], label: () => LABEL[cfg.mode] };
})();
