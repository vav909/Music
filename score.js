'use strict';
/* Partition du solo sélectionné : analyse de la hauteur (YIN), quantification, affichage SVG,
   correction note par note, export MIDI / MusicXML. Aucune dépendance, fonctionne hors ligne. */

const SH = { sel: null, busy: false, bars: 2 };
const ALLOWED = [16, 12, 8, 6, 4, 3, 2, 1];             // durées autorisées, en doubles-croches
const SP = 9, LINE_H = 140, CLEF_W = 36, TS_W = 16;      // interligne, hauteur d'une ligne, largeurs fixes
const INK = '#14171c', BLUE = '#1f6feb', MUTED = '#6b7686';
const STEP_SHARP = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const STEP_FLAT = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const sc$ = () => { const s = curSolo(); return s && s.score; };

function spell(m, flats) {
  const t = (flats ? STEP_FLAT : STEP_SHARP)[m % 12], oct = Math.floor(m / 12) - 1;
  return { dn: oct * 7 + t[0], acc: t[1], step: t[0], oct };
}

/* ---------- 0. Tessiture des instruments (hauteurs réelles, numéros MIDI ; 60 = do4) ---------- */
const RANGES = [
  [/piccolo/, 'piccolo', 74, 108], [/fl[uû]te\s*alto|alto\s*fl/, 'flûte alto', 55, 91], [/fl[uû]t|flute/, 'flûte', 60, 96],
  [/soprano|sopranino/, 'sax soprano', 56, 89], [/bariton|baryton|bari\b/, 'sax baryton', 36, 70],
  [/t[eé]nor/, 'sax ténor', 44, 77], [/\balto\b|sax/, 'sax alto', 49, 82],
  [/trompet|trumpet|bugle|cornet/, 'trompette', 52, 84], [/trombone/, 'trombone', 40, 72],
  [/clarinette|clarinet/, 'clarinette', 50, 94], [/hautbois|oboe/, 'hautbois', 58, 93], [/basson|bassoon/, 'basson', 34, 75],
  [/\bcor\b|horn/, 'cor', 41, 77], [/violon|violin/, 'violon', 55, 100], [/vibra|marimba|xylo/, 'vibraphone', 53, 89],
  [/guitar/, 'guitare', 40, 88], [/piano|clavier|rhodes|keys|orgue|organ/, 'piano', 36, 96], [/voix|chant|vocal|voice/, 'voix', 48, 84],
  [/basse|bass/, 'basse', 28, 67],
];
function rangeFor(instr) {
  const t = String(instr || '').toLowerCase();
  const r = RANGES.find(x => x[0].test(t));
  return r ? { label: r[1], lo: r[2], hi: r[3], known: true } : { label: instr ? instr : 'instrument inconnu', lo: 48, hi: 96, known: false };
}
const NOTE_FR = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
const noteFr = m => NOTE_FR[m % 12] + (Math.floor(m / 12) - 1);

/* ---------- 1. Analyse : hauteur toutes les ~20 ms (YIN) puis découpage en notes ---------- */
async function analyzeSolo(song, solo, onProgress) {
  const blob = await idb('audio', 'readonly', s => s.get(song.id));
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx; try { ctx = new AC({ sampleRate: 22050 }); } catch { ctx = new AC(); }
  let buf;
  try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch {} }
  const sr = buf.sampleRate, i0 = Math.floor(solo.start * sr), i1 = Math.min(buf.length, Math.ceil(solo.end * sr));
  const n = i1 - i0, x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i0 + i] / buf.numberOfChannels; }

  const rg = rangeFor(solo.instrument), fOf = m => 440 * Math.pow(2, (m - 69) / 12);
  // dans un mélange (basse, piano, batterie), les graves masquent le soliste : on les coupe (filtre passe-haut 4e ordre)
  // juste sous la plus basse note de l'instrument, puis on ne cherche que des hauteurs DANS la tessiture
  const hp = fc => { const w = 2 * Math.PI * fc / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7071), a0 = 1 + al;
    const b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, a1 = -2 * cs / a0, a2 = (1 - al) / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const v = x[i], y = b0 * v + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; } };
  if (rg.known) { hp(fOf(rg.lo) * 0.9); hp(fOf(rg.lo) * 0.9); }
  const tauMax = Math.floor(sr / fOf(rg.lo - 1)), tauMin = Math.max(2, Math.floor(sr / fOf(rg.hi + 3)));
  const W = Math.max(1024, Math.ceil(tauMax * 1.5)), hop = Math.round(sr * 0.02);
  const nF = Math.max(0, Math.floor((n - W - tauMax) / hop));
  const rms = new Float32Array(nF);
  for (let f = 0; f < nF; f++) { let s = 0; const o = f * hop; for (let j = 0; j < W; j += 2) s += x[o + j] * x[o + j]; rms[f] = Math.sqrt(s / (W / 2)); }
  const ref = [...rms].sort((a, b) => a - b)[Math.floor(nF * 0.9)] || 0, gate = ref * 0.12;

  const d = new Float32Array(tauMax + 1), c = new Float32Array(tauMax + 1), midis = new Array(nF).fill(null);
  let loud = 0, folded = 0, outside = 0;   // folded : conservé à 0 (ancien réglage), outside : détections hors tessiture ignorées
  for (let f = 0; f < nF; f++) {
    if (f % 30 === 0) { onProgress && onProgress(f / nF); await new Promise(r => setTimeout(r, 0)); }
    if (rms[f] < gate) continue;
    loud++;
    const o = f * hop;
    for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let j = 0; j < W; j++) { const v = x[o + j] - x[o + j + tau]; s += v * v; } d[tau] = s; }
    let run = 0; c[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; c[tau] = run ? d[tau] * tau / run : 1; }
    // premier creux sous 0,2 ; à défaut (mélange dense), le creux le plus net s'il passe sous 0,35
    let pick = -1, best = 1, bt = -1;
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (c[tau] < best && c[tau] <= c[tau - 1] && c[tau] <= c[tau + 1]) { best = c[tau]; bt = tau; }
      if (c[tau] < 0.2) { while (tau + 1 < tauMax && c[tau + 1] < c[tau]) tau++; pick = tau; break; }
    }
    if (pick < 0 && best < 0.35) pick = bt;
    if (pick >= 0) {
      const tau = pick, a = c[tau - 1], b = c[tau], g = c[tau + 1], den = a - 2 * b + g;
      const t2 = den ? tau + (a - g) / (2 * den) : tau;
      const m = Math.round(69 + 12 * Math.log2(sr / t2 / 440));
      if (m < rg.lo || m > rg.hi) outside++; else midis[f] = m;
    }
  }
  const voiced = midis.filter(v => v !== null).length;
  // lissage : un trou ou un parasite isolé de 1 à 2 images disparaît
  for (let i = 1; i < nF - 1; i++) { if (midis[i] !== midis[i - 1] && midis[i - 1] === midis[i + 1]) midis[i] = midis[i - 1]; }
  for (let i = 1; i < nF - 2; i++) { if (midis[i] === null && midis[i + 1] === null && midis[i - 1] !== null && midis[i - 1] === midis[i + 2]) midis[i] = midis[i + 1] = midis[i - 1]; }
  // un saut de hauteur qui dure moins de 3 images (60 ms) est un parasite : on le remplace par la note qui précède
  for (let i = 1; i < nF - 3; i++) {
    const m = midis[i];
    if (m !== null && midis[i - 1] !== null && Math.abs(m - midis[i - 1]) >= 3 && midis[i + 1] !== m && midis[i + 2] !== m && midis[i + 1] !== null) midis[i] = midis[i - 1];
  }
  const tOf = f => (f * hop + W / 2) / sr, step = hop / sr, raw = [];
  let cur = null;
  const close = f => { if (cur) { cur.t1 = tOf(f - 1) + step / 2; if (cur.t1 - cur.t0 >= 0.08) raw.push(cur); cur = null; } };
  for (let f = 0; f < nF; f++) {
    const m = midis[f];
    if (m === null) close(f);
    else if (cur && cur.m === m) { /* même note */ }
    else { close(f); cur = { t0: tOf(f) - step / 2, t1: 0, m }; }
  }
  close(nF);
  // fusionne deux morceaux de même hauteur séparés par moins de 40 ms
  const merged = [];
  for (const nt of raw) { const l = merged[merged.length - 1]; if (l && l.m === nt.m && nt.t0 - l.t1 < 0.04) l.t1 = nt.t1; else merged.push({ ...nt }); }
  // erreurs d'octave : une note à plus de 9 demi-tons de ses voisines, mais proche d'elles une octave plus loin, est ramenée
  let octFix = 0, isolated = 0;
  const med = arr => { const a = arr.filter(v => v !== undefined).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
  for (let i = 0; i < merged.length; i++) {
    const nb = []; for (let k = -3; k <= 3; k++) if (k && merged[i + k] && Math.abs(merged[i + k].t0 - merged[i].t0) < 1.5) nb.push(merged[i + k].m);
    const r = nb.length >= 2 ? med(nb) : null; if (r === null) continue;
    const m = merged[i].m, df = m - r;
    if (Math.abs(df) >= 9) {
      const alt = m - 12 * Math.sign(df);
      if (alt >= rg.lo && alt <= rg.hi && Math.abs(alt - r) < Math.abs(df)) { merged[i].m = alt; octFix++; }
    }
  }
  // notes isolées : plus d'une octave et demie d'écart avec les deux voisines et très courtes = bruit
  const kept = merged.filter((nt, i) => {
    const p = merged[i - 1], q = merged[i + 1], short = nt.t1 - nt.t0 < 0.15;
    const far = v => v && Math.abs(v.m - nt.m) > 14 && Math.abs(v.t0 - nt.t0) < 1;
    const bad = short && ((p && q && far(p) && far(q)) || (!p && far(q)) || (!q && far(p)));
    if (bad) isolated++; return !bad;
  });
  const out = kept.map(r => ({ t0: Math.max(0, +r.t0.toFixed(3)), t1: +r.t1.toFixed(3), m: r.m }));
  const diag = { sr, frames: nF, loud, voiced, gate: +gate.toFixed(5), instrument: solo.instrument || '', range: [rg.lo, rg.hi], rangeKnown: rg.known,
    folded, outside, octFix, isolated, notes: out.length, lo: out.length ? Math.min(...out.map(o => o.m)) : null, hi: out.length ? Math.max(...out.map(o => o.m)) : null };
  return { raw: out, diag };
}

/* ---------- 2. Tempo et quantification (grille de doubles-croches) ---------- */
function phaseFor(raw, bpm, swing) {
  const P = swing ? 60 / bpm : 15 / bpm; let re = 0, im = 0;   // P = une noire (swing) ou une double-croche
  for (const n of raw) { const a = 2 * Math.PI * n.t0 / P; re += Math.cos(a); im += Math.sin(a); }
  let lead = (Math.atan2(im, re) / (2 * Math.PI)) * P;
  const first = raw.length ? raw[0].t0 : 0;
  while (lead > first + 0.03) lead -= P;
  while (lead < first - P + 0.03) lead += P;
  return lead;
}
function estimateBpm(raw) {
  if (raw.length < 6) return 100;
  let best = 0; const res = [];
  for (let bpm = 90; bpm <= 200; bpm += 0.5) {
    const P = 15 / bpm; let re = 0, im = 0;
    for (const n of raw) { const a = 2 * Math.PI * n.t0 / P; re += Math.cos(a); im += Math.sin(a); }
    const r = Math.hypot(re, im) / raw.length; res.push([bpm, r]); if (r > best) best = r;
  }
  const hit = res.find(([, r]) => r >= best * 0.93);
  return Math.round(hit[0]);
}
function quantize(raw, bpm, lead, swing) {
  const beat = 60 / bpm, g = beat / 4, notes = []; let end = 0;
  // swing : les croches sont écrites droites ; la 2e croche de chaque temps tombe au 2/3 du temps
  const at = t => { const b = (t - lead) / beat, k = Math.floor(b), f = b - k; return 2 * (2 * k + (f < 0.33 ? 0 : f < 0.83 ? 1 : 2)); };
  for (const n of raw) {
    let p = (swing ? at(n.t0) : Math.round((n.t0 - lead) / g)) + 0; const e = swing ? at(n.t1) : Math.round((n.t1 - lead) / g);
    if (p < end) p = end;
    const l = Math.max(swing ? 2 : 1, e - p); notes.push({ p, l, m: n.m }); end = p + l;
  }
  return notes;
}
function requantize(sc) { sc.lead = phaseFor(sc.raw, sc.bpm, sc.swing); sc.notes = quantize(sc.raw, sc.bpm, sc.lead, sc.swing); sc.edited = false; }

/* ---------- 3. Événements : coupe aux barres de mesure et aux durées écrivables ---------- */
function buildEvents(notes) {
  const ev = []; let cur = 0;
  const push = (p, l, m, ni) => {
    while (l > 0) {
      const toBar = 16 - (p % 16), a = ALLOWED.find(v => v <= l && v <= toBar);
      ev.push({ p, l: a, m, ni, tie: false });
      p += a; l -= a;
      if (l > 0 && m !== null) ev[ev.length - 1].tie = true;
    }
  };
  notes.forEach((nt, i) => { if (nt.p > cur) push(cur, nt.p - cur, null, -1); push(nt.p, nt.l, nt.m, i); cur = nt.p + nt.l; });
  const end = Math.max(16, Math.ceil(cur / 16) * 16);
  if (end > cur) push(cur, end - cur, null, -1);
  return ev;
}

/* ---------- 4. Dessin de la partition (SVG) ---------- */
const clefPath = (x, top) => {
  const g = top + 3 * SP;   // ligne de sol
  return `<path d="M${x + 12} ${top + 4 * SP + 9} C${x + 12} ${top + 4 * SP + 15} ${x + 4} ${top + 4 * SP + 14} ${x + 5} ${top + 4 * SP + 9}
    M${x + 13} ${top - 11} C${x + 20} ${top - 6} ${x + 19} ${top + 1} ${x + 11} ${top + 2 * SP}
    C${x + 3} ${top + 3.4 * SP} ${x + 1} ${g + 5} ${x + 8} ${g + 6.5} C${x + 17} ${g + 8} ${x + 19} ${g - 6} ${x + 10} ${g - 6.5}
    C${x + 3} ${g - 6.5} ${x + 3} ${g + 1} ${x + 9} ${g + 1.5}
    M${x + 13} ${top - 11} L${x + 12} ${top + 4 * SP + 9}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`;
};
function restSVG(l, x, top) {
  const yc = top + 2 * SP, dot = [12, 6, 3].includes(l) ? `<circle cx="${x + 8}" cy="${yc - 3}" r="1.5" fill="${INK}"/>` : '';
  const base = { 16: 16, 12: 8, 8: 8, 6: 4, 4: 4, 3: 2, 2: 2, 1: 1 }[l];
  let g = '';
  if (base === 16) g = `<rect x="${x - 6}" y="${top + SP}" width="12" height="${SP * 0.5}" fill="${INK}"/>`;
  else if (base === 8) g = `<rect x="${x - 6}" y="${yc - SP * 0.5}" width="12" height="${SP * 0.5}" fill="${INK}"/>`;
  else if (base === 4) g = `<path d="M${x - 2} ${yc - 9} L${x + 3} ${yc - 3} L${x - 2} ${yc + 2} L${x + 2} ${yc + 8}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
  else { g = `<circle cx="${x - 2.5}" cy="${yc - 4}" r="2" fill="${INK}"/><path d="M${x + 3} ${yc - 6} L${x - 1.5} ${yc + 8}" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
    if (base === 1) g += `<circle cx="${x - 4.5}" cy="${yc + 1}" r="2" fill="${INK}"/>`; }
  return g + dot;
}

function renderScore(sc, W) {
  const flats = !!sc.flats, ev = buildEvents(sc.notes);
  const nM = Math.max(1, Math.ceil((ev[ev.length - 1].p + ev[ev.length - 1].l) / 16));
  let b = SH.bars;
  let unit = (W - 12 - CLEF_W - TS_W - b * 16) / (16 * b);
  if (unit < 5) { b = 1; unit = (W - 12 - CLEF_W - TS_W - 16) / 16; }
  const measW = 16 * unit + 16, nLines = Math.ceil(nM / b), out = [];
  const lineOf = k => Math.floor(k / b), topOf = li => li * LINE_H + 62;
  const mx0 = k => 6 + CLEF_W + TS_W + (k - lineOf(k) * b) * measW;
  // positions
  ev.forEach(e => {
    const k = Math.floor(e.p / 16), li = lineOf(k), top = topOf(li);
    e.k = k; e.top = top; e.x = mx0(k) + 8 + (e.p % 16) * unit + unit * 0.5;
    if (e.m !== null) { const s = spell(e.m, flats); e.sp = s; e.y = top + 4 * SP - (s.dn - 30) * SP / 2; }
  });
  // portées, clés, barres
  for (let li = 0; li < nLines; li++) {
    const top = topOf(li), kEnd = Math.min(nM, (li + 1) * b), xEnd = mx0(kEnd - 1) + measW;
    for (let i = 0; i < 5; i++) out.push(`<line x1="6" x2="${xEnd}" y1="${top + i * SP}" y2="${top + i * SP}" stroke="${INK}" stroke-width="1"/>`);
    out.push(`<line x1="6" x2="6" y1="${top}" y2="${top + 4 * SP}" stroke="${INK}" stroke-width="1.4"/>`);
    out.push(clefPath(10, top));
    if (li === 0) out.push(`<text x="${6 + CLEF_W + 1}" y="${top + 2 * SP - 1}" font-size="17" font-weight="700" font-family="system-ui,sans-serif" fill="${INK}">4</text><text x="${6 + CLEF_W + 1}" y="${top + 4 * SP - 1}" font-size="17" font-weight="700" font-family="system-ui,sans-serif" fill="${INK}">4</text>`);
    for (let k = li * b; k < kEnd; k++) {
      out.push(`<line x1="${mx0(k) + measW}" x2="${mx0(k) + measW}" y1="${top}" y2="${top + 4 * SP}" stroke="${INK}" stroke-width="${k === nM - 1 ? 2.4 : 1}"/>`);
      out.push(`<text x="${mx0(k) + 3}" y="${top - 18}" font-size="10" fill="${MUTED}" font-family="system-ui,sans-serif">${k + 1}</text>`);
    }
  }
  // groupes de croches à ligature
  const groups = []; let gcur = null;
  ev.forEach((e, i) => {
    const ok = e.m !== null && e.l <= 2;
    if (ok && gcur && ev[i - 1].m !== null && e.k === gcur.k && Math.floor(e.p / 4) === gcur.beat && e.p === ev[i - 1].p + ev[i - 1].l) gcur.items.push(i);
    else { if (gcur && gcur.items.length > 1) groups.push(gcur); gcur = ok ? { k: e.k, beat: Math.floor(e.p / 4), items: [i] } : null; }
  });
  if (gcur && gcur.items.length > 1) groups.push(gcur);
  const grouped = new Map(); groups.forEach(g => g.items.forEach(i => grouped.set(i, g)));
  groups.forEach(g => {
    const its = g.items.map(i => ev[i]), avg = its.reduce((s, e) => s + e.sp.dn, 0) / its.length;
    g.up = avg < 34;
    const tips = its.map(e => e.y + (g.up ? -3.5 * SP : 3.5 * SP));
    g.beamY = g.up ? Math.min(...tips) : Math.max(...tips);
  });
  // notes, silences
  const accState = new Map();
  ev.forEach((e, i) => {
    if (!accState.has(e.k)) accState.set(e.k, new Map());
    if (e.m === null) { out.push(restSVG(e.l, e.x, e.top)); return; }
    const sel = e.ni === SH.sel, col = sel ? BLUE : INK, s = e.sp, st = accState.get(e.k);
    const filled = e.l < 8, grp = grouped.get(i), up = grp ? grp.up : s.dn < 34;
    let g = `<g data-act="note" data-ni="${e.ni}" style="cursor:pointer"><circle class="hit" cx="${e.x}" cy="${e.y}" r="15" fill="${sel ? 'rgba(31,111,235,.12)' : 'transparent'}"/>`;
    // lignes supplémentaires
    for (let dn = 40; dn <= s.dn; dn += 2) { const yy = e.top + 4 * SP - (dn - 30) * SP / 2; g += `<line x1="${e.x - 9}" x2="${e.x + 9}" y1="${yy}" y2="${yy}" stroke="${INK}" stroke-width="1.2"/>`; }
    for (let dn = 28; dn >= s.dn; dn -= 2) { const yy = e.top + 4 * SP - (dn - 30) * SP / 2; g += `<line x1="${e.x - 9}" x2="${e.x + 9}" y1="${yy}" y2="${yy}" stroke="${INK}" stroke-width="1.2"/>`; }
    // altération
    const prev = st.get(s.dn) || 0;
    if (s.acc !== prev) { g += `<text x="${e.x - 15}" y="${e.y + 5}" font-size="17" fill="${col}" font-family="system-ui,sans-serif">${s.acc === 1 ? '♯' : s.acc === -1 ? '♭' : '♮'}</text>`; st.set(s.dn, s.acc); }
    // tête
    g += filled ? `<ellipse cx="${e.x}" cy="${e.y}" rx="5" ry="3.8" transform="rotate(-20 ${e.x} ${e.y})" fill="${col}"/>`
      : `<ellipse cx="${e.x}" cy="${e.y}" rx="5.2" ry="3.8" transform="rotate(-20 ${e.x} ${e.y})" fill="#fff" stroke="${col}" stroke-width="1.5"/>`;
    if ([12, 6, 3].includes(e.l)) g += `<circle cx="${e.x + 9}" cy="${e.y + (s.dn % 2 === 0 ? -SP / 2 : 0)}" r="1.6" fill="${col}"/>`;
    // hampe
    if (e.l < 16) {
      const sx = up ? e.x + 4.6 : e.x - 4.6;
      const tip = grp ? grp.beamY : e.y + (up ? -3.5 * SP : 3.5 * SP);
      g += `<line x1="${sx}" x2="${sx}" y1="${e.y}" y2="${tip}" stroke="${col}" stroke-width="1.3"/>`;
      if (!grp && e.l <= 2) {
        const dir = up ? 1 : -1, n = e.l === 1 ? 2 : 1;
        for (let f = 0; f < n; f++) { const y0 = tip + (up ? 1 : -1) * f * 4.5; g += `<path d="M${sx} ${y0} q ${8} ${dir * 5} ${4} ${dir * 13}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/>`; }
      }
    }
    out.push(g + '</g>');
    // liaison vers la note suivante
    if (e.tie) {
      const nx = ev[i + 1], sameLine = nx && lineOf(nx.k) === lineOf(e.k);
      const x1 = e.x + 3, x2 = sameLine ? nx.x - 3 : mx0(e.k) + measW - 2, dy = up ? 7 : -7;
      out.push(`<path d="M${x1} ${e.y + dy} Q${(x1 + x2) / 2} ${e.y + dy + (up ? 8 : -8)} ${x2} ${e.y + dy}" fill="none" stroke="${col}" stroke-width="1.3"/>`);
    }
  });
  // ligatures
  groups.forEach(g => {
    const its = g.items.map(i => ev[i]), sx = e => g.up ? e.x + 4.6 : e.x - 4.6, off = g.up ? 1.6 : -1.6;
    out.push(`<line x1="${sx(its[0])}" x2="${sx(its[its.length - 1])}" y1="${g.beamY + off}" y2="${g.beamY + off}" stroke="${INK}" stroke-width="3.4"/>`);
    its.forEach((e, j) => {
      if (e.l !== 1) return;
      const y2 = g.beamY + (g.up ? 6.2 : -6.2), nxt = its[j + 1], prv = its[j - 1];
      if (nxt && nxt.l === 1) out.push(`<line x1="${sx(e)}" x2="${sx(nxt)}" y1="${y2}" y2="${y2}" stroke="${INK}" stroke-width="3"/>`);
      else if (!(prv && prv.l === 1)) { const d = nxt ? 6 : -6; out.push(`<line x1="${sx(e)}" x2="${sx(e) + d}" y1="${y2}" y2="${y2}" stroke="${INK}" stroke-width="3"/>`); }
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${nLines * LINE_H}" viewBox="0 0 ${W} ${nLines * LINE_H}" role="img" aria-label="Partition du solo">${out.join('')}</svg>`;
}

/* ---------- 5. Fenêtre « Partition » ---------- */
function playTone(m) {
  try {
    ensureBeep();
    const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t = beepCtx.currentTime;
    o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(beepCtx.destination); o.start(t); o.stop(t + 0.5);
  } catch {}
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function sheetHTML(solo) {
  const sc = solo.score;
  const title = esc(solo.name) + (solo.instrument ? ' · ' + esc(solo.instrument) : '');
  return `<div class="sheet-top"><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">←</button><b>${title}</b>
      <button id="sheetPlay" data-act="sheet-play">▶ Solo</button></div>
    <div class="sheet-ctl">
      <span class="lbl">Tempo</span><button data-act="bpm" data-d="-1">−</button><b id="bpmLbl">${sc ? Math.round(sc.bpm) : '…'}</b><button data-act="bpm" data-d="1">+</button>
      <button data-act="bpm-mul" data-f="0.5">÷2</button><button data-act="bpm-mul" data-f="2">×2</button>
      <button data-act="acc">${sc && sc.flats ? '♭' : '♯'}</button><button data-act="zoom-score" aria-label="Mesures par ligne">${SH.bars} mes.</button>
    </div>
    <div class="sheet-ctl"><button data-act="tap">Taper le tempo</button><button data-act="swing">Rythme : ${sc && sc.swing ? 'swing' : 'droit'}</button></div>
    <p class="hint" id="rangeInfo">${rangeInfo(solo)}</p>
    <div class="sheet-ctl"><button data-act="score-play" id="spBtn">${PL.on && !PL.mix ? '⏹ Arrêter' : '▶ Écouter la partition'}</button><button data-act="score-play" data-mix="1" id="spMix">${PL.on && PL.mix ? '⏹ Arrêter' : '▶ Avec le solo'}</button></div>
    <div id="scoreWrap">${sc ? '' : '<p class="hint" id="scMsg">Analyse du solo…</p>'}</div>
    <div id="noteBar"></div>
    <div class="sheet-exp"><button data-act="reanalyze">Réanalyser</button><button data-act="exp-midi">MIDI</button><button data-act="exp-xml">MusicXML</button></div>
    <div class="sheet-exp"><button data-act="diag">Envoyer un diagnostic</button></div>
    <p class="hint">Brouillon automatique : touche une note pour l’écouter et la corriger. Le tempo se règle à l’oreille (÷2 / ×2 si le rythme est doublé ou divisé).</p>`;
}
function rangeInfo(solo) {
  const r = rangeFor(solo.instrument);
  const d = solo.score && solo.score.diag;
  let t = r.known ? `Tessiture utilisée : ${noteFr(r.lo)} – ${noteFr(r.hi)} (${esc(r.label)}). Change l’instrument du solo pour la modifier.`
    : 'Instrument non reconnu : tessiture large (do3 – do7). Indique l’instrument du soliste (flûte, sax, trompette, piano…) pour de meilleurs résultats.';
  if (d && d.loud) {
    const vr = Math.round(100 * d.voiced / d.loud), oo = Math.round(100 * d.outside / d.loud);
    if (vr < 40) t += ` Attention : le soliste n’est reconnu que dans ${vr} % du passage (accompagnement trop présent) : la partition sera très incomplète.`;
    if (oo >= 25) t += ` ${oo} % des sons détectés étaient hors tessiture et ont été ignorés : vérifie l’instrument du soliste.`;
  }
  return t;
}
function drawSheet() {
  const sc = sc$(), wrap = $('#scoreWrap'); if (!sc || !wrap) return;
  wrap.innerHTML = renderScore(sc, wrap.clientWidth || 360);
  const bar = $('#noteBar'), n = SH.sel !== null && sc.notes[SH.sel];
  if (n) {
    const sp = spell(n.m, sc.flats), name = LETTERS[sp.step] + (sp.acc === 1 ? '♯' : sp.acc === -1 ? '♭' : '') + sp.oct;
    bar.innerHTML = `<div class="nb-title">${name} · ${n.l} double-croche${n.l > 1 ? 's' : ''}</div><div class="nb-row">
      <button data-act="n-pitch" data-d="1">♯ +½</button><button data-act="n-pitch" data-d="-1">♭ −½</button><button data-act="n-pitch" data-d="12">8ve ↑</button><button data-act="n-pitch" data-d="-12">8ve ↓</button></div>
      <div class="nb-row"><button data-act="n-len" data-d="-1">Plus court</button><button data-act="n-len" data-d="1">Plus long</button><button data-act="n-move" data-d="-1">← Décaler</button><button data-act="n-move" data-d="1">Décaler →</button></div>
      <div class="nb-row"><button data-act="n-dup">＋ Note après</button><button class="danger" data-act="n-del">Supprimer la note</button></div>`;
  } else bar.innerHTML = '';
}
/* ---------- Écoute de la partition écrite (sons de flûte synthétiques), seule ou avec le solo d'origine ---------- */
const PL = { on: false, osc: [], timer: null, mix: false };
function updateScorePlay() {
  const a = $('#spBtn'), m = $('#spMix'); if (!a || !m) return;
  a.textContent = PL.on && !PL.mix ? '⏹ Arrêter' : '▶ Écouter la partition';
  m.textContent = PL.on && PL.mix ? '⏹ Arrêter' : '▶ Avec le solo';
}
function stopScore() {
  const was = PL.on; PL.on = false;
  PL.osc.forEach(o => { try { o.stop(); } catch {} }); PL.osc = []; clearInterval(PL.timer);
  document.querySelectorAll('#scoreWrap .playing').forEach(g => g.classList.remove('playing'));
  if (was && PL.mix) audio.pause();
  updateScorePlay();
}
function playScore(mix) {
  const sc = sc$(), solo = curSolo(); if (!sc || !solo) return;
  if (PL.on) { const again = PL.mix !== mix; stopScore(); if (!again) return; }
  if (!sc.notes.length) { toast('La partition est vide'); return; }
  audio.pause(); ensureBeep(); if (!beepCtx) { toast('Son indisponible'); return; }
  const rate = audio.playbackRate || 1, g = 60 / sc.bpm / 4, ctx = beepCtx;
  const evs = sc.notes.map((n, i) => ({ i, t: Math.max(0, sc.lead + n.p * g), d: Math.max(0.08, n.l * g * 0.93), m: n.m }));
  const when = ctx.currentTime + 0.2; PL.on = true; PL.mix = !!mix;
  if (mix) { audio.currentTime = solo.start; audio.play().catch(() => {}); }
  const vol = mix ? 0.12 : 0.3;
  for (const e of evs) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain(), a = when + e.t / rate, z = a + e.d / rate;
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (e.m - 69) / 12); o2.frequency.value = o.frequency.value * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2).connect(gn);
    gn.gain.setValueAtTime(0.0001, a); gn.gain.linearRampToValueAtTime(vol, a + 0.03); gn.gain.setValueAtTime(vol, Math.max(a + 0.03, z - 0.05)); gn.gain.linearRampToValueAtTime(0.0001, z);
    o.connect(gn).connect(ctx.destination); o.start(a); o2.start(a); o.stop(z + 0.02); o2.stop(z + 0.02); PL.osc.push(o, o2);
  }
  const end = Math.max(...evs.map(e => e.t + e.d)), solo1 = solo.end - solo.start;
  let cur = -1;
  PL.timer = setInterval(() => {
    const el = (ctx.currentTime - when) * rate;
    if (el > Math.max(end, mix ? solo1 : 0) + 0.3) { stopScore(); return; }
    const now = evs.find(e => el >= e.t && el < e.t + e.d), idx = now ? now.i : -1;
    if (idx !== cur) {
      document.querySelectorAll('#scoreWrap .playing').forEach(x => x.classList.remove('playing'));
      const el2 = idx >= 0 && document.querySelector(`#scoreWrap g[data-ni="${idx}"]`); if (el2) el2.classList.add('playing');
      cur = idx;
    }
  }, 40);
  updateScorePlay();
}
function updateSheetPlay() { const b = $('#sheetPlay'); if (b) b.textContent = audio.paused ? '▶ Solo' : '⏸ Solo'; }
audio.addEventListener('play', updateSheetPlay); audio.addEventListener('pause', updateSheetPlay);

async function runAnalysis() {
  const solo = curSolo(), song = S.song; if (!solo || SH.busy) return;
  SH.busy = true; SH.sel = null;
  const wrap = $('#scoreWrap'); if (wrap) wrap.innerHTML = '<p class="hint" id="scMsg">Analyse du solo… 0 %</p>';
  try {
    const { raw, diag } = await analyzeSolo(song, solo, p => { const m = $('#scMsg'); if (m) m.textContent = `Analyse du solo… ${Math.round(p * 100)} %`; });
    if (!raw.length) { toast('Aucune note détectée dans ce solo'); }
    const old = solo.score, bpm = old && old.tapped ? old.bpm : estimateBpm(raw);
    solo.score = { bpm, lead: 0, raw, notes: [], edited: false, flats: old ? old.flats : false, swing: old ? !!old.swing : false, tapped: old ? !!old.tapped : false, diag };
    requantize(solo.score); saveSoon();
  } catch (e) { console.error(e); toast('Analyse impossible pour ce fichier'); }
  SH.busy = false;
  if (!$('#sheet').hidden) { $('#sheet').innerHTML = sheetHTML(solo); drawSheet(); updateSheetPlay(); }
}
function openSheet() {
  const solo = curSolo(); if (!solo) return;
  stopScore(); SH.sel = null; const sh = $('#sheet'); sh.hidden = false; document.body.style.overflow = 'hidden';
  sh.innerHTML = sheetHTML(solo); updateSheetPlay();
  if (solo.score && solo.score.diag) drawSheet(); else if (solo.score && solo.score.edited) drawSheet(); else runAnalysis();
}
function closeSheet() { stopScore(); $('#sheet').hidden = true; document.body.style.overflow = ''; audio.pause(); }

function edit(fn) {
  const sc = sc$(); if (!sc || SH.sel === null) return;
  const nt = sc.notes[SH.sel]; if (!nt) return;
  if (fn(sc, nt, sc.notes[SH.sel - 1], sc.notes[SH.sel + 1]) !== false) { sc.edited = true; saveSoon(); }
  drawSheet();
}
const TAP = { t: [], ok: false };
function tapTempo() {
  const sc = sc$(); if (!sc) return;
  const now = performance.now();
  if (TAP.t.length && now - TAP.t[TAP.t.length - 1] > 2000) { TAP.t = []; TAP.ok = false; }
  TAP.t.push(now); TAP.t = TAP.t.slice(-9);
  if (TAP.t.length < 4) { toast('Tape en rythme sur les noires (' + TAP.t.length + '/4)…'); return; }
  if (sc.edited && !TAP.ok) { if (!confirm('Changer le tempo refait la partition et efface tes corrections. Continuer ?')) { TAP.t = []; return; } TAP.ok = true; }
  const iv = []; for (let i = 1; i < TAP.t.length; i++) iv.push(TAP.t[i] - TAP.t[i - 1]);
  iv.sort((a, b) => a - b); const m = iv[Math.floor(iv.length / 2)];
  sc.bpm = clampN(Math.round(60000 / m), 30, 300); sc.tapped = true; requantize(sc); SH.sel = null; saveSoon();
  const l = $('#bpmLbl'); if (l) l.textContent = sc.bpm; drawSheet();
}
function changeBpm(next) {
  const sc = sc$(); if (!sc) return;
  next = clampN(next, 30, 300);
  if (sc.edited && !confirm('Changer le tempo refait la partition et efface tes corrections. Continuer ?')) return;
  sc.bpm = next; sc.tapped = true; requantize(sc); SH.sel = null; saveSoon(); $('#bpmLbl').textContent = Math.round(sc.bpm); drawSheet();
}

/* ---------- 6. Export ---------- */
function saveBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileBase = () => (S.song.title + '-' + (curSolo().name || 'solo')).replace(/[^\wÀ-ſ-]+/g, '_');
function exportMidi() {
  const sc = sc$(), bytes = [], PPQ = 480, U = PPQ / 4;
  const vlq = v => { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o; };
  const us = Math.round(60e6 / sc.bpm), tr = [0, 0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xc0, 73];
  let tick = 0;
  for (const nt of sc.notes) {
    tr.push(...vlq(Math.max(0, nt.p * U - tick)), 0x90, nt.m, 90);
    tr.push(...vlq(Math.round(nt.l * U * 0.97)), 0x80, nt.m, 0);
    tick = nt.p * U + Math.round(nt.l * U * 0.97);
  }
  tr.push(0, 0xff, 0x2f, 0);
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  bytes.push(0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 255, 0x4d, 0x54, 0x72, 0x6b, ...u32(tr.length), ...tr);
  saveBlob(fileBase() + '.mid', new Blob([new Uint8Array(bytes)], { type: 'audio/midi' }));
  toast('Fichier MIDI prêt');
}
function exportXml() {
  const sc = sc$(), ev = buildEvents(sc.notes), T = { 16: ['whole', 0], 12: ['half', 1], 8: ['half', 0], 6: ['quarter', 1], 4: ['quarter', 0], 3: ['eighth', 1], 2: ['eighth', 0], 1: ['16th', 0] };
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>${esc(curSolo().name)}</part-name></score-part></part-list><part id="P1">`;
  let k = -1, prevTie = false;
  ev.forEach(e => {
    const mi = Math.floor(e.p / 16);
    if (mi !== k) {
      if (k >= 0) xml += '</measure>';
      k = mi; xml += `<measure number="${mi + 1}">`;
      if (mi === 0) xml += `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(sc.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(sc.bpm)}"/></direction>`;
    }
    const [type, dot] = T[e.l];
    if (e.m === null) { xml += `<note><rest/><duration>${e.l}</duration><type>${type}</type>${dot ? '<dot/>' : ''}</note>`; prevTie = false; return; }
    const s = spell(e.m, sc.flats), ties = (prevTie ? '<tie type="stop"/>' : '') + (e.tie ? '<tie type="start"/>' : '');
    const tied = (prevTie ? '<tied type="stop"/>' : '') + (e.tie ? '<tied type="start"/>' : '');
    xml += `<note><pitch><step>${LETTERS[s.step]}</step>${s.acc ? `<alter>${s.acc}</alter>` : ''}<octave>${s.oct}</octave></pitch><duration>${e.l}</duration>${ties}<type>${type}</type>${dot ? '<dot/>' : ''}${tied ? `<notations>${tied}</notations>` : ''}</note>`;
    prevTie = e.tie;
  });
  xml += '</measure></part></score-partwise>';
  saveBlob(fileBase() + '.musicxml', new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
  toast('Fichier MusicXML prêt (MuseScore, Finale…)');
}

/* ---------- 7. Commandes ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, sc = sc$();
  switch (d.act) {
    case 'sheet-open': openSheet(); break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-play': { stopScore(); const s = curSolo(); if (audio.paused) { if (s) audio.currentTime = s.start; audio.play().catch(() => {}); } else audio.pause(); break; }
    case 'note': SH.sel = +d.ni; if (sc) playTone(sc.notes[SH.sel].m); drawSheet(); break;
    case 'bpm': changeBpm(sc.bpm + +d.d); break;
    case 'tap': tapTempo(); break;
    case 'score-play': playScore(!!d.mix); break;
    case 'swing': if (sc) { if (sc.edited && !confirm('Changer le rythme refait la partition et efface tes corrections. Continuer ?')) break; sc.swing = !sc.swing; requantize(sc); SH.sel = null; saveSoon(); $('#sheet').innerHTML = sheetHTML(curSolo()); drawSheet(); updateSheetPlay(); } break;
    case 'bpm-mul': changeBpm(sc.bpm * +d.f); break;
    case 'acc': if (sc) { sc.flats = !sc.flats; saveSoon(); $('#sheet').innerHTML = sheetHTML(curSolo()); drawSheet(); updateSheetPlay(); } break;
    case 'zoom-score': SH.bars = SH.bars === 1 ? 2 : SH.bars === 2 ? 3 : 1; $('#sheet').innerHTML = sheetHTML(curSolo()); drawSheet(); updateSheetPlay(); break;
    case 'reanalyze': if (!sc || !sc.edited || confirm('Réanalyser efface tes corrections. Continuer ?')) runAnalysis(); break;
    case 'exp-midi': if (sc) exportMidi(); break;
    case 'exp-xml': if (sc) exportXml(); break;
    case 'n-pitch': edit((s, n) => { n.m = clampN(n.m + +d.d, 36, 100); playTone(n.m); }); break;
    case 'n-len': edit((s, n, pv, nx) => {
      const u = s.swing ? 2 : 1, l = Math.max(u, n.l + +d.d * u);
      if (nx && n.p + l > nx.p) { toast('Pas de place : la note suivante est trop proche'); return false; }
      n.l = l; }); break;
    case 'n-move': edit((s, n, pv, nx) => {
      const p = n.p + +d.d * (s.swing ? 2 : 1);
      if (p < 0 || (pv && p < pv.p + pv.l) || (nx && p + n.l > nx.p)) { toast('Pas de place pour décaler'); return false; }
      n.p = p; }); break;
    case 'n-dup': edit((s, n, pv, nx) => {
      const p = n.p + n.l, l = nx ? Math.min(n.l, nx.p - p) : n.l;
      if (l < 1) { toast('Pas de place après cette note'); return false; }
      s.notes.splice(SH.sel + 1, 0, { p, l, m: n.m }); SH.sel++; }); break;
    case 'n-del': edit(s => { s.notes.splice(SH.sel, 1); SH.sel = null; }); break;
  }
});
