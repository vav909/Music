/* Jazzette — chapitre 5 : Les tonalités. Prototype sans dépendance. */
'use strict';

/* ================= Données ================= */
// a = armure : > 0 dièses, < 0 bémols, 0 aucune. rel = relative mineure (☾).
const TONS = [
  { id: 'do',  n: 'Do',  a: 0,  rel: 'La'  },
  { id: 'sol', n: 'Sol', a: 1,  rel: 'Mi'  },
  { id: 'fa',  n: 'Fa',  a: -1, rel: 'Ré'  },
  { id: 're',  n: 'Ré',  a: 2,  rel: 'Si'  },
  { id: 'sib', n: 'Si♭', a: -2, rel: 'Sol' },
  { id: 'la',  n: 'La',  a: 3,  rel: 'Fa♯' },
  { id: 'mib', n: 'Mi♭', a: -3, rel: 'Do'  },
  { id: 'mi',  n: 'Mi',  a: 4,  rel: 'Do♯' },
  { id: 'lab', n: 'La♭', a: -4, rel: 'Fa'  },
  { id: 'si',  n: 'Si',  a: 5,  rel: 'Sol♯'},
  { id: 'reb', n: 'Ré♭', a: -5, rel: 'Si♭' },
  { id: 'fas', n: 'Fa♯', a: 6,  rel: 'Ré♯' },
];
const BY = Object.fromEntries(TONS.map(t => [t.id, t]));
const ADD = [['do', 'sol', 'fa', 're'], ['sib', 'la'], ['mib', 'mi'], ['lab', 'si'], ['reb', 'fas']];
const knownAt = c => ADD.slice(0, c).flat();

const SH = ['fa♯', 'do♯', 'sol♯', 'ré♯', 'la♯', 'mi♯'];
const FL = ['si♭', 'mi♭', 'la♭', 'ré♭', 'sol♭', 'do♭'];
// Hauteur sur la portée en demi-espaces au-dessus de la ligne du bas (mi4 = 0).
const STEP_SH = [8, 5, 9, 6, 3, 7, 4];   // fa5 do5 sol5 ré5 la4 mi5 si4
const STEP_FL = [4, 7, 3, 6, 2, 5, 1];   // si4 mi5 la4 ré5 sol4 do5 fa4

const GAMES = [null,
  { nom: 'Armure',   fin: "Tu portes l'armure comme un chevalier !" },
  { nom: 'Tonalité', fin: "Tu lis les ♯ et les ♭ d'un coup d'œil !" },
  { nom: 'Cousines', fin: 'Les cousines se sont retrouvées !' },
  { nom: 'Mémo',     fin: 'Mémoire d’éléphant !' },
];
const MEMO_MAX_MISS = 6;   // paires tonalité/armure ratées tolérées au solo du Mémo (à tester)
const SOLID_WINS = 3;      // réussites du premier coup pour devenir solide (à tester)

const accWords = a => a > 0 ? SH.slice(0, a).join(' ') : a < 0 ? FL.slice(0, -a).join(' ') : 'rien';
const tName = (fam, mode) => mode === 'M' ? BY[fam].n : BY[fam].rel;
const fixMsg = (fam, mode) => `${tName(fam, mode)} ${mode === 'M' ? 'majeur' : 'mineur'} : ${accWords(BY[fam].a)}.`;

/* ================= Utilitaires ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function sample(items, k, w = () => 1) {          // tirage sans remise, pondéré
  items = [...items]; const out = [];
  while (out.length < k && items.length) {
    const ws = items.map(w); let r = Math.random() * ws.reduce((x, y) => x + y, 0), i = 0;
    while (i < items.length - 1 && (r -= ws[i]) > 0) i++;
    out.push(items.splice(i, 1)[0]);
  }
  return out;
}
let token = 0;   // change quand on quitte un palier : les attentes en cours s'arrêtent
const sleep = ms => { const t = token; return new Promise(r => setTimeout(() => { if (t === token) r(); }, ms)); };
const tapOne = el => new Promise(r => el.addEventListener('click', () => r(el), { once: true }));
const tapAny = els => new Promise(r => els.forEach(e => e.addEventListener('click', () => r(e), { once: true })));
function skippable(ms) {
  return new Promise(res => {
    const t = token, t0 = Date.now(), g = $('#game'); let done = false;
    const fin = () => { if (done) return; done = true; g.removeEventListener('click', onc); if (t === token) res(); };
    const onc = () => { if (Date.now() - t0 > 500) fin(); };
    g.addEventListener('click', onc); setTimeout(fin, ms);
  });
}

/* ================= Icônes (SVG en trait fin) ================= */
const A = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  sun: `<svg class="ic sun" ${A}><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>`,
  moon: `<svg class="ic moon" ${A}><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" fill="currentColor"/></svg>`,
  close: `<svg class="ic" ${A}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  tune: `<svg class="ic" ${A}><path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/></svg>`,
  lock: `<svg class="ic" ${A}><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  check: `<svg class="ic" ${A}><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bulb: `<svg class="ic" ${A}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>`,
  arrow: `<svg class="ic" ${A}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
};
const sym = t => t.replace(/☀/g, ICON.sun).replace(/☾/g, ICON.moon);

/* ================= Portée en SVG ================= */
const sharp = (x, y) => `<g class="gl"><path d="M${x - 2.6} ${y - 11}V${y + 13}M${x + 2.6} ${y - 13}V${y + 11}" stroke-width="1.3"/><path d="M${x - 5.8} ${y - 1.2}L${x + 5.8} ${y - 5}M${x - 5.8} ${y + 5.6}L${x + 5.8} ${y + 1.8}" stroke-width="2.6" stroke-linecap="butt"/></g>`;
const flat = (x, y) => `<g class="gl"><path d="M${x - 3} ${y - 17}V${y + 5}" stroke-width="1.5"/><path d="M${x - 3} ${y + 5}C${x + 2} ${y + 2.5} ${x + 7} ${y - 1.5} ${x + 4.2} ${y - 5}C${x + 2} ${y - 7.5} ${x - 3} ${y - 5} ${x - 3} ${y - 1}" stroke-width="1.7"/></g>`;
const CLEF = 'M9 56C8 61 17 62 18 54L14 14C12 -2 21 -4 20 -12C19 -4 26 4 22 12C17 20 5 22 5 32C5 42 17 44 22 38C27 31 20 24 14 27C10 29 11 35 16 34';
function staffSVG(a) {
  const top = 38, gap = 10, bottom = top + 4 * gap, yOf = s => bottom - s * gap / 2;
  let s = `<svg class="staff" viewBox="0 20 240 82" aria-hidden="true">`;
  for (let i = 0; i < 5; i++) s += `<line class="ln" x1="4" x2="236" y1="${top + i * gap}" y2="${top + i * gap}"/>`;
  s += `<g class="clef" transform="translate(12 ${top})"><path d="${CLEF}"/></g>`;
  const n = Math.abs(a), steps = a > 0 ? STEP_SH : STEP_FL;
  for (let i = 0; i < n; i++) { const x = 72 + i * 21, y = yOf(steps[i]); s += a > 0 ? sharp(x, y) : flat(x, y); }
  return s + '</svg>';
}

/* ================= État et sauvegarde ================= */
const KEY = 'jazzette-ch5-v1';
const fresh = () => ({ v: 1, done: 0, cards: {}, micro3: false, dayOffset: 0, sound: true });
function load() { try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.v === 1) return j; } catch (e) {} return fresh(); }
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const today = () => new Date(Date.now() + S.dayOffset * 864e5).toISOString().slice(0, 10);
const card = id => (S.cards[id] ||= { ok: 0, days: [], fragile: false, solid: false, consec: 0 });

function recordOk(id) {
  const c = card(id); c.ok++; c.fragile = false; c.consec = 0;
  const d = today(); if (!c.days.includes(d)) c.days.push(d);
  if (c.ok >= SOLID_WINS && c.days.length >= 2) c.solid = true;   // dont une réussite un autre jour
  save();
}
function recordErr(id) {   // renvoie true si 2 erreurs de suite sur cette tonalité
  const c = card(id); c.ok = 0; c.days = []; c.solid = false; c.fragile = true; c.consec = (c.consec || 0) + 1;
  const twice = c.consec >= 2; if (twice) c.consec = 0;
  save(); return twice;
}

/* ================= Son (optionnel) ================= */
let actx;
function chime() {
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), s = t + i * .09;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.06, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + .35);
      o.connect(g).connect(actx.destination); o.start(s); o.stop(s + .4);
    });
  } catch (e) {}
}

/* ================= Cartes ================= */
const tonEl = (fam, mode, btn = true) => {
  const t = btn ? 'button' : 'div';
  return h(`<${t} class="card ton ${mode}"><span class="nm">${tName(fam, mode)}</span>${ICON[mode === 'M' ? 'sun' : 'moon']}</${t}>`);
};
const armEl = (a, btn = true, mode = null) => {
  const t = btn ? 'button' : 'div';
  return h(`<${t} class="card arm">${staffSVG(a)}${mode ? `<span class="badge ${mode}">${ICON[mode === 'M' ? 'sun' : 'moon']}</span>` : ''}</${t}>`);
};

function link(a, b, shape = 'curve') {
  const g = $('#game').getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const X = v => (v - g.left).toFixed(1), Y = v => (v - g.top).toFixed(1);
  const ya = ra.top + ra.height / 2, yb = rb.top + rb.height / 2;
  let d;
  if (shape === 'curve') {
    const x = Math.min(g.right - 6, Math.max(ra.right, rb.right) + 14);
    d = `M${X(ra.right)},${Y(ya)}C${X(x)},${Y(ya)} ${X(x)},${Y(yb)} ${X(rb.right)},${Y(yb)}`;
  } else {   // 'edge' : du bord de la carte du haut au bord de la carte du bas (ou côte à côte)
    const [u, l] = ra.top <= rb.top ? [ra, rb] : [rb, ra];
    if (Math.abs(ya - yb) < 20) { const [lf, rt] = ra.left < rb.left ? [ra, rb] : [rb, ra]; d = `M${X(lf.right)},${Y(ya)}L${X(rt.left)},${Y(yb)}`; }
    else d = `M${X(u.left + u.width / 2)},${Y(u.bottom)}L${X(l.left + l.width / 2)},${Y(l.top)}`;
  }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); p.setAttribute('class', 'link'); p.setAttribute('pathLength', '1');
  $('#links').append(p); setTimeout(() => p.remove(), 1900);
}

/* ================= Questions ================= */
function buildQ(game, fam, K) {
  const f = BY[fam], others = K.filter(x => x !== fam);
  if (game === 1) {
    const decoys = sample(others, 2).map(x => ({ kind: 'arm', a: BY[x].a, right: false }));
    return { game, fam, mode: 'M', prompt: { kind: 'ton', fam, mode: 'M' },
      opts: shuffle([{ kind: 'arm', a: f.a, right: true }, ...decoys]) };
  }
  if (game === 2) {
    const md = S.micro3 ? pick(['M', 'm']) : 'M';   // les ☾ arrivent après la micro-leçon des cousines
    const decoys = sample(others, 2).map(x => ({ kind: 'ton', fam: x, mode: md, right: false }));
    const hint = md === 'M'
      ? (f.a > 0 ? 'La tonalité est la note juste au-dessus du dernier dièse.'
        : f.a < 0 ? (f.a === -1 ? 'Un seul bémol : c’est Fa.' : 'La tonalité est l’avant-dernier bémol.')
        : 'Aucune altération : c’est Do.')
      : 'La ☾ est la cousine d’une ☀ : cherche d’abord la ☀.';
    return { game, fam, mode: md, hint, prompt: { kind: 'arm', a: f.a, mode: md },
      opts: shuffle([{ kind: 'ton', fam, mode: md, right: true }, ...decoys]) };
  }
  return { game: 3, fam, mode: 'M', prompt: { kind: 'arm', a: f.a }, opts: shuffle([
    { kind: 'ton', fam, mode: 'M', right: true }, { kind: 'ton', fam, mode: 'm', right: true },
    { kind: 'ton', fam: pick(others), mode: 'M', right: false }, { kind: 'ton', fam: pick(others), mode: 'm', right: false }]) };
}

const setMsg = (t, kind = '') => { const m = $('#msg'); m.className = 'msg ' + kind; m.innerHTML = t ? `<span>${t}</span>` : ''; };

async function ask(q, phase, bonus = false) {
  const st = $('#stage'); st.innerHTML = ''; st.className = ''; $('#links').innerHTML = ''; setMsg('');
  const tuto = phase === 'tuto';
  const P = q.prompt.kind === 'ton' ? tonEl(q.prompt.fam, q.prompt.mode, false)
    : armEl(q.prompt.a, false, q.game === 2 ? q.prompt.mode : null);
  P.classList.add('prompt');
  const box = h(`<div class="${q.game === 3 ? 'grid2' : 'stack'}"></div>`);
  const O = q.opts.map((o, i) => {
    const e = o.kind === 'ton' ? tonEl(o.fam, o.mode) : armEl(o.a);
    e.dataset.right = o.right ? '1' : '0'; e.style.setProperty('--i', i);
    if (tuto) e.classList.add('pre');
    box.append(e); return e;
  });
  const wrap = h(`<div class="q g${q.game}"></div>`); wrap.append(P, box); st.append(wrap);
  const rights = O.filter(e => e.dataset.right === '1');

  /* ---- Tuto : aucune erreur possible, on touche la carte illuminée ---- */
  if (tuto) {
    await sleep(250); P.classList.add('lit'); await sleep(1000);
    O.forEach(e => e.classList.remove('pre')); await sleep(800);
    rights.forEach(e => e.classList.add('lit'));
    O.filter(e => !e.classList.contains('lit')).forEach(e => e.classList.add('dim'));
    for (const r of rights) {
      await tapOne(r); r.classList.remove('lit'); r.classList.add('good');
      link(P, r, q.game === 3 ? 'edge' : 'curve'); chime(); await sleep(450);
    }
    await sleep(700); P.classList.remove('lit'); return { ok: true };
  }

  /* ---- Solo / échauffement ---- */
  let hintBtn = null;
  if (q.game === 2) {
    hintBtn = h(`<button class="hintbtn">${ICON.bulb}<span>Indice</span></button>`);
    hintBtn.onclick = () => setMsg(sym(q.hint), 'hint');
    wrap.append(hintBtn);
  }
  let got = 0, wrong = null;
  for (;;) {
    const el = await tapAny(O.filter(e => !e.classList.contains('good')));
    if (el.dataset.right === '1') { el.classList.add('good'); if (++got === rights.length) break; }
    else { wrong = el; break; }
  }
  wrap.classList.add('lock'); if (hintBtn) hintBtn.remove();

  if (!wrong) {
    chime(); st.classList.add('flash'); recordOk(q.fam);
    await sleep(750); return { ok: true };
  }
  wrong.classList.add('bad');
  rights.forEach(r => { if (!r.classList.contains('good')) { r.classList.add('good'); link(P, r, q.game === 3 ? 'edge' : 'curve'); } });
  const text = q.game === 3 ? `${fixMsg(q.fam, 'M').replace(' majeur :', ' majeur et ' + BY[q.fam].rel + ' mineur :')}` : fixMsg(q.fam, q.mode);
  setMsg(text, 'err');
  if (phase === 'solo' && !bonus) run.errors++;
  const replay = recordErr(q.fam);
  await skippable(2800);
  return { ok: false, replay };
}

/* ================= Mémo ================= */
async function memo(phase, fams) {
  const st = $('#stage'); st.innerHTML = ''; st.className = ''; $('#links').innerHTML = ''; setMsg('');
  const defs = shuffle(fams.flatMap(f => {
    const mode = S.micro3 && Math.random() < .4 ? 'm' : 'M';
    return [{ kind: 'T', fam: f, mode }, { kind: 'A', fam: f, mode }];
  }));
  const grid = h('<div class="mgrid"></div>');
  const els = defs.map(c => {
    const front = c.kind === 'T'
      ? `<div class="face con ton ${c.mode}"><span class="nm">${tName(c.fam, c.mode)}</span>${ICON[c.mode === 'M' ? 'sun' : 'moon']}</div>`
      : `<div class="face con">${staffSVG(BY[c.fam].a)}</div>`;
    const e = h(`<button class="mc"><div class="in"><div class="face cov"></div>${front}</div></button>`);
    e._c = c; grid.append(e); return e;
  });
  st.append(grid);
  const mark = (i, s) => { run.dots[run.phase][i] = s; drawDots(); };

  if (phase === 'tuto') {
    grid.classList.add('guided');
    let i = 0;
    for (const f of fams) {
      const t = els.find(e => e._c.fam === f && e._c.kind === 'T'), a = els.find(e => e._c.fam === f && e._c.kind === 'A');
      for (const e of [t, a]) { e.classList.add('lit'); await tapOne(e); e.classList.remove('lit'); e.classList.add('up'); await sleep(650); }
      link(t, a, 'edge'); t.classList.add('good'); a.classList.add('good'); chime(); mark(i++, 'ok'); await sleep(1000);
    }
    return { ok: true };
  }

  return new Promise(resolve => {
    let first = null, locked = false, pairs = 0, miss = 0; const missed = new Set();
    els.forEach(e => e.addEventListener('click', async () => {
      if (locked || e.classList.contains('up')) return;
      e.classList.add('up');
      if (!first) { first = e; return; }
      const a = first, b = e; first = null; locked = true;
      const T = [a, b].find(x => x._c.kind === 'T'), Ar = [a, b].find(x => x._c.kind === 'A');
      await sleep(550);
      if (T && Ar && T._c.fam === Ar._c.fam) {
        a.classList.add('good'); b.classList.add('good'); chime();
        if (!missed.has(T._c.fam)) recordOk(T._c.fam);
        mark(pairs++, 'ok'); locked = false;
        if (pairs === fams.length) { await sleep(500); resolve({ ok: true }); }
        return;
      }
      if (T && Ar) {   // une tonalité face à la mauvaise armure : on corrige en une phrase
        miss++; missed.add(T._c.fam); a.classList.add('bad'); b.classList.add('bad');
        setMsg(fixMsg(T._c.fam, T._c.mode), 'err'); await sleep(1700); setMsg('');
      } else await sleep(650);
      a.classList.remove('up', 'bad'); b.classList.remove('up', 'bad'); locked = false;
      if (miss > MEMO_MAX_MISS) resolve({ lost: true });
    }));
  });
}

/* ================= Déroulé d'un palier ================= */
let run = null;
const stripHTML = (list, before) => list.map(f => {
  const c = S.cards[f] || {}, cls = c.solid ? 'solid' : c.fragile ? 'fragile' : '';
  return `<span class="chip ${cls}${before && c.solid && !before.has(f) ? ' pop' : ''}">${BY[f].n}</span>`;
}).join('');
const drawStrip = (K, before) => { $('#strip').innerHTML = stripHTML(K, before); };
function drawDots() {
  $('#dots').innerHTML = ['warm', 'tuto', 'solo'].filter(k => run.dots[k].length)
    .map(k => `<span class="grp ${k}${run.phase === k ? ' cur' : ''}">${run.dots[k].map(s => `<i class="${s}"></i>`).join('')}</span>`).join('');
}

async function runQ(q, phase, i, K) {
  const r = await ask(q, phase);
  run.dots[phase][i] = r.ok ? 'ok' : 'bad'; drawDots();
  if (r.replay) {   // 2 erreurs de suite : la même tonalité, aussitôt, dans un autre jeu
    const g2 = pick([1, 2, 3].filter(x => x !== q.game && (x !== 3 || S.micro3)));
    await ask(buildQ(g2, q.fam, K), 'solo', true);
  }
  return r;
}

function micro() {
  return new Promise(res => {
    openSheet(`<div class="micro">
      <div class="card arm">${staffSVG(0)}</div>
      <div class="grid2"><div class="card ton M"><span class="nm">Do</span>${ICON.sun}</div><div class="card ton m"><span class="nm">La</span>${ICON.moon}</div></div>
      <p class="big">${sym('Do ☀ et La ☾ ont la même armure. On dit qu’elles sont relatives.')}</p></div>
      <button class="primary" id="mOk">OK</button>`);
    $('#mOk').onclick = () => { closeSheet(); res(); };
  });
}

async function playPalier(n) {
  const my = ++token;
  const c = Math.ceil(n / 4), g = (n - 1) % 4 + 1, K = knownAt(c), fresh = ADD[c - 1], old = K.filter(f => !fresh.includes(f));
  const fragileW = f => 1 + (card(f).fragile ? 3 : 0);
  run = { n, c, g, phase: '', errors: 0, dots: { warm: c >= 2 ? ['', '', ''] : [], tuto: ['', '', '', ''], solo: ['', '', '', ''] } };
  const before = new Set(K.filter(f => card(f).solid));
  closeSheet(); show('game'); drawStrip(K); drawDots(); $('#stage').innerHTML = ''; setMsg('');

  /* 1. Échauffement (dès le cycle 2) : 3 questions d'anciens paliers, en solo */
  if (c >= 2) {
    run.phase = 'warm'; drawDots();
    const fams = sample(old, 3, fragileW);
    for (let i = 0; i < 3; i++) await runQ(buildQ(pick(S.micro3 ? [1, 2, 3] : [1, 2]), fams[i], old), 'warm', i, old);
  }
  if (g === 3 && !S.micro3) { await micro(); S.micro3 = true; save(); }

  /* 2. Tuto : 4 tours, aucune erreur possible */
  run.phase = 'tuto'; drawDots();
  const tutoFams = c === 1 ? ADD[0] : shuffle([...fresh, ...sample(old, 4 - fresh.length, fragileW)]);
  if (g === 4) await memo('tuto', tutoFams);
  else for (let i = 0; i < 4; i++) { await ask(buildQ(g, tutoFams[i], K), 'tuto'); run.dots.tuto[i] = 'ok'; drawDots(); }
  run.dots.tuto = ['ok', 'ok', 'ok', 'ok'];

  /* 3. Solo : 4 tours, 2 erreurs = palier rejoué */
  run.phase = 'solo'; run.errors = 0; drawDots();
  const soloFams = c === 1 ? shuffle(ADD[0]) : sample(K, 4, f => 1 + (fresh.includes(f) ? 3 : 0) + (card(f).fragile ? 3 : 0));
  let lost = null;
  if (g === 4) { const r = await memo('solo', soloFams); if (r.lost) lost = 'Trop d’hésitations. On la refait.'; }
  else for (let i = 0; i < 4; i++) {
    await runQ(buildQ(g, soloFams[i], K), 'solo', i, K);
    if (run.errors >= 2) { lost = 'Deux erreurs. On la refait.'; break; }
  }
  if (lost) { setMsg(lost, 'err'); await sleep(2300); return playPalier(n); }

  /* 4. Fin : la phrase du jeu, puis le palier suivant démarre directement */
  S.done = Math.max(S.done, n); save();
  drawStrip(K, before); $('#stage').classList.add('fin'); $('#links').innerHTML = '';
  setMsg(GAMES[g].fin, 'win'); chime();
  await sleep(3000);
  return n >= 20 ? showEnd() : playPalier(n + 1);
}

/* ================= Écrans ================= */
function show(id) { $$('.screen').forEach(s => s.classList.toggle('on', s.id === id)); window.scrollTo(0, 0); }
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="panel">${html}</div>`; s.hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }

function renderHome() {
  token++; closeSheet(); run = null;
  const next = Math.min(S.done + 1, 20), kc = Math.ceil(next / 4), known = knownAt(kc);
  const strip = TONS.map(t => {
    const c = S.cards[t.id] || {}, cls = c.solid ? 'solid' : c.fragile ? 'fragile' : '';
    return `<span class="chip ${known.includes(t.id) ? cls : 'off'}">${t.n}</span>`;
  }).join('');
  let path = '';
  for (let c = 1; c <= 5; c++) {
    let tiles = '';
    for (let i = 1; i <= 4; i++) {
      const n = (c - 1) * 4 + i, st = n <= S.done ? 'done' : n === S.done + 1 ? 'now' : 'locked';
      tiles += `<button class="tile ${st}" data-n="${n}" ${st === 'locked' ? 'disabled' : ''}><b>${n}</b><small>${GAMES[i].nom}</small>${st === 'done' ? ICON.check : st === 'locked' ? ICON.lock : ''}</button>`;
    }
    path += `<section><div class="cyc-h"><span>Cycle ${c}</span><span>${c === 1 ? '' : '+ ' + ADD[c - 1].map(f => BY[f].n).join(' ')}</span></div><div class="tiles">${tiles}</div></section>`;
  }
  const finished = S.done >= 20;
  $('#home').innerHTML = `
    <div class="top"><div><div class="kicker">Chapitre 5</div><h1>Les tonalités</h1></div><button class="ico" id="hdbg" aria-label="Menu debug">${ICON.tune}</button></div>
    <div class="strip">${strip}</div>
    <div class="path">${path}</div>
    <div class="cta"><button class="primary" id="go">${finished ? 'Récompense' : 'Palier ' + next}${ICON.arrow}</button></div>`;
  $('#hdbg').onclick = openDebug;
  $('#go').onclick = () => finished ? showEnd() : playPalier(next);
  $$('.tile:not(.locked)').forEach(t => t.onclick = () => playPalier(+t.dataset.n));
  show('home');
}

function showEnd() {
  token++; closeSheet();
  const order = ['do', 'sol', 're', 'la', 'mi', 'si', 'fas', 'reb', 'lab', 'mib', 'sib', 'fa'];
  let w = '<svg class="wheel" viewBox="-130 -130 260 260"><circle class="ring" r="98"/><circle class="ring" r="58"/>';
  order.forEach((f, i) => {
    const an = i / 12 * 2 * Math.PI - Math.PI / 2, c = Math.cos(an), s = Math.sin(an);
    w += `<g class="wd" style="--d:${i * 70}ms"><circle cx="${c * 98}" cy="${s * 98}" r="19" fill="#FFE9A8"/><text x="${c * 98}" y="${s * 98 + 4}">${BY[f].n}</text>
      <circle cx="${c * 58}" cy="${s * 58}" r="15" fill="#C9D8F5"/><text class="s" x="${c * 58}" y="${s * 58 + 3.5}">${BY[f].rel}</text></g>`;
  });
  w += '</svg>';
  $('#end').innerHTML = `${w}<h2>Chapitre 5 terminé.</h2><p>Prochain chapitre : le II-V-I.</p>
    <button class="primary ghost" id="back" style="max-width:300px;margin-top:10px">Retour</button>`;
  $('#back').onclick = renderHome;
  show('end');
}

/* ================= Menu debug ================= */
function openDebug() {
  const grid = Array.from({ length: 20 }, (_, i) => `<button class="dbtn${run && run.n === i + 1 ? ' cur' : ''}" data-go="${i + 1}">${i + 1}</button>`).join('');
  openSheet(`<h3>Debug</h3><p class="sm">Sauter à un palier (progression : ${S.done}/20)</p><div class="dgrid">${grid}</div>
    <div class="drow"><button class="dbtn" id="dDay">Jour suivant (+${S.dayOffset})</button><button class="dbtn" id="dSnd">Son : ${S.sound ? 'oui' : 'non'}</button></div>
    <div class="drow"><button class="dbtn" id="dSolid">Cartes solides</button><button class="dbtn" id="dMicro">Micro-leçon à revoir</button></div>
    <div class="drow"><button class="dbtn" id="dEnd">Fin du chapitre</button><button class="dbtn danger" id="dReset">Tout remettre à zéro</button></div>
    <button class="dbtn wide" id="dClose">Fermer</button>`);
  const refresh = () => { if (!run) renderHome(); openDebug(); };
  $$('[data-go]').forEach(b => b.onclick = () => { const n = +b.dataset.go; S.done = Math.max(S.done, n - 1); save(); playPalier(n); });
  $('#dDay').onclick = () => { S.dayOffset++; save(); refresh(); };
  $('#dSnd').onclick = () => { S.sound = !S.sound; save(); refresh(); };
  $('#dSolid').onclick = () => { TONS.forEach(t => { S.cards[t.id] = { ok: 3, days: ['2000-01-01', today()], fragile: false, solid: true, consec: 0 }; }); save(); refresh(); };
  $('#dMicro').onclick = () => { S.micro3 = false; save(); refresh(); };
  $('#dEnd').onclick = () => showEnd();
  $('#dClose').onclick = closeSheet;
  let armed = false;
  $('#dReset').onclick = e => {
    if (!armed) { armed = true; e.target.textContent = 'Toucher encore pour confirmer'; return; }
    S = fresh(); save(); renderHome();
  };
}

/* ================= Démarrage ================= */
$('#quit').innerHTML = ICON.close; $('#gdbg').innerHTML = ICON.tune;
$('#quit').onclick = renderHome; $('#gdbg').onclick = openDebug;
renderHome();
