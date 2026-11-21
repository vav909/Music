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

/* ---------- 0. Tessiture des instruments (hauteurs sonores, numéros MIDI : do4 = 60) ---------- */
const NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteLabel = m => NAMES_SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const RANGES = {
  flute: { label: 'Flûte', span: 'C4–C7', lo: 60, hi: 96, prog: 73 },
  soprano: { label: 'Sax soprano', span: 'G♭3–E6', lo: 54, hi: 88, prog: 64 },
  alto: { label: 'Sax alto', span: 'D♭3–A♭5', lo: 49, hi: 80, prog: 65 },
  tenor: { label: 'Sax ténor', span: 'A♭2–E♭5', lo: 44, hi: 75, prog: 66 },
  baryton: { label: 'Sax baryton', span: 'D♭2–A♭4', lo: 37, hi: 68, prog: 67 },
  sax: { label: 'Saxophone (tous)', span: 'D♭2–E6', lo: 37, hi: 88, prog: 65 },
  trompette: { label: 'Trompette', span: 'F♯3–C6', lo: 54, hi: 84, prog: 56 },
  piano: { label: 'Piano (mélodie)', span: 'C3–C7', lo: 48, hi: 96, prog: 0 },
  general: { label: 'Générale', span: 'C2–E7', lo: 36, hi: 100, prog: 73 },
};
function rangeKeyFor(instr) {
  const t = norm(instr);
  if (!t) return 'general';
  if (/flut/.test(t)) return 'flute';
  if (/sopran/.test(t)) return 'soprano';
  if (/alto/.test(t)) return 'alto';
  if (/tenor/.test(t)) return 'tenor';
  if (/bar[iy]ton|baritone|bari/.test(t)) return 'baryton';
  if (/sax/.test(t)) return 'sax';
  if (/trompet|trumpet/.test(t)) return 'trompette';
  if (/piano|rhodes|clavier|keys/.test(t)) return 'piano';
  return 'general';
}
/* Plage utilisée pour un solo : réglage manuel, instrument choisi, ou déduite du champ « instrument ». */
function resolveRange(solo) {
  const r = solo && solo.range;
  if (r && r.key === 'manual') {
    const lo = clampN(Math.round(r.lo), 21, 107), hi = clampN(Math.round(r.hi), lo + 5, 108);
    return { key: 'manual', label: 'Manuelle', span: noteLabel(lo) + '–' + noteLabel(hi), lo, hi, prog: 73 };
  }
  const key = r && RANGES[r.key] ? r.key : rangeKeyFor(solo && solo.instrument);
  return { key, ...RANGES[key], auto: !(r && RANGES[r.key]) };
}

/* ---------- 1. Analyse : hauteur toutes les ~20 ms (YIN, limité à la tessiture) puis découpage en notes ---------- */
const ANA = { minDur: 0.07, mergeGap: 0.06, thr: 0.15, thrFallback: 0.25, hopS: 0.02, dip: 0.5 };   // dip : un creux d'énergie sous 50 % sépare deux attaques

function medianFilter(pf, k) {
  const out = new Array(pf.length).fill(null), buf = [];
  for (let i = 0; i < pf.length; i++) {
    if (pf[i] === null) continue;
    buf.length = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(pf.length - 1, i + k); j++) if (pf[j] !== null) buf.push(pf[j]);
    buf.sort((a, b) => a - b);
    out[i] = buf.length >= 3 ? buf[buf.length >> 1] : pf[i];
  }
  return out;
}
/* Écart moyen à la hauteur « juste » (enregistrement accordé à 442 Hz, bande un peu rapide…), en demi-tons. */
function estimateTuning(pf) {
  let re = 0, im = 0, c = 0;
  for (const p of pf) if (p !== null) { const a = 2 * Math.PI * (p - Math.round(p)); re += Math.cos(a); im += Math.sin(a); c++; }
  if (c < 20 || Math.hypot(re, im) / c < 0.35) return 0;
  const t = Math.atan2(im, re) / (2 * Math.PI);
  return Math.abs(t) <= 0.35 ? t : 0;
}
/* Erreurs d'octave : une note courte à une octave de ses voisines, qui se ressemblent, est ramenée dans leur voisinage. */
function fixOctaves(notes, range) {
  const near = (a, b) => b.t0 - a.t1 < 0.25;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i], a = notes[i - 1] && near(notes[i - 1], n) ? notes[i - 1] : null, b = notes[i + 1] && near(n, notes[i + 1]) ? notes[i + 1] : null;
    let ref = null;
    if (a && b && Math.abs(a.m - b.m) <= 7) ref = (a.m + b.m) / 2;
    else if ((a || b) && n.t1 - n.t0 < 0.12 && !(a && b)) ref = (a || b).m;
    if (ref === null || Math.abs(n.m - ref) < 9) continue;
    for (const c of [n.m - 12, n.m + 12]) {
      if (c >= range.lo && c <= range.hi && Math.abs(c - ref) < Math.abs(n.m - ref) - 4) { n.m = c; break; }
    }
  }
  return notes;
}

/* Cœur de l'analyse : x = signal mono (Float32Array) à la fréquence sr. Renvoie [{t0, t1, m}]. */
async function detectNotes(x, sr, range, onProgress) {
  const n = x.length;
  const tauMin = Math.max(2, Math.floor(sr / hz(range.hi + 1))), tauMax = Math.min(Math.ceil(sr / hz(range.lo - 1)), Math.floor(n / 4));
  const W = Math.max(1024, Math.ceil(tauMax * 2.5)), hop = Math.round(sr * ANA.hopS);
  const nF = Math.max(0, Math.floor((n - W - tauMax) / hop));
  if (nF < 3 || tauMax <= tauMin + 2) return [];
  const rms = new Float32Array(nF);
  for (let f = 0; f < nF; f++) { let s = 0; const o = f * hop; for (let j = 0; j < W; j += 2) s += x[o + j] * x[o + j]; rms[f] = Math.sqrt(s / (W / 2)); }
  const ref = [...rms].sort((a, b) => a - b)[Math.floor(nF * 0.9)] || 0, gate = ref * 0.12;

  const d = new Float32Array(tauMax + 2), c = new Float32Array(tauMax + 2), pf = new Array(nF).fill(null);
  for (let f = 0; f < nF; f++) {
    if (f % 30 === 0) { onProgress && onProgress(f / nF); await new Promise(r => setTimeout(r, 0)); }
    if (rms[f] < gate) continue;
    const o = f * hop;
    for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let j = 0; j < W; j++) { const v = x[o + j] - x[o + j + tau]; s += v * v; } d[tau] = s; }
    let run = 0; c[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; c[tau] = run ? d[tau] * tau / run : 1; }
    let found = -1;
    for (let tau = tauMin; tau < tauMax; tau++) {            // premier creux sous le seuil, dans la tessiture seulement
      if (c[tau] < ANA.thr) { while (tau + 1 < tauMax && c[tau + 1] < c[tau]) tau++; found = tau; break; }
    }
    if (found < 0) {                                         // sinon le meilleur creux, s'il est assez net
      let best = tauMin; for (let tau = tauMin; tau < tauMax; tau++) if (c[tau] < c[best]) best = tau;
      if (c[best] < ANA.thrFallback && best > tauMin && best < tauMax - 1) found = best;
    }
    if (found < 0 || found >= tauMax) continue;
    const a = c[found - 1], b = c[found], g = c[found + 1], den = a - 2 * b + g;
    const t2 = den ? found + (a - g) / (2 * den) : found;
    const p = 69 + 12 * Math.log2(sr / t2 / 440);
    if (p >= range.lo - 0.7 && p <= range.hi + 0.7) pf[f] = p;   // hors tessiture : rejeté
  }
  // lissage par médiane (supprime les images isolées), puis accord de l'enregistrement
  const pm = medianFilter(pf, 2), tune = estimateTuning(pm);
  // découpage en notes : hystérésis de 0,7 demi-ton (vibrato), trous de 1 à 2 images tolérés
  const tOf = f => (f * hop + W / 2) / sr, step = hop / sr, notes = [];
  let cur = null, gap = 0;
  // creux d'énergie à l'intérieur d'une note : deux attaques de même hauteur (articulation) → deux notes
  const splitAtDips = (a, b) => {
    if (b - a < 7) return [[a, b]];
    const L = new Float32Array(b - a + 1), R = new Float32Array(b - a + 1);
    for (let k = a, m = 0; k <= b; k++) { m = Math.max(m, rms[k]); L[k - a] = m; }
    for (let k = b, m = 0; k >= a; k--) { m = Math.max(m, rms[k]); R[k - a] = m; }
    let best = -1, bestV = 1;
    for (let k = a + 3; k <= b - 3; k++) {
      if (rms[k] > rms[k - 1] || rms[k] > rms[k + 1]) continue;
      const v = rms[k] / Math.min(L[k - a], R[k - a]);
      if (v < ANA.dip && v < bestV) { best = k; bestV = v; }
    }
    return best < 0 ? [[a, b]] : [...splitAtDips(a, best - 1), ...splitAtDips(best + 1, b)];
  };
  const close = () => {
    if (!cur) return;
    for (const [a, b] of splitAtDips(cur.first, cur.last)) {
      const t0 = tOf(a) - step / 2, t1 = tOf(b) + step / 2;
      if (t1 - t0 >= ANA.minDur) notes.push({ t0, t1, m: cur.m, a, b });
    }
    cur = null;
  };
  for (let f = 0; f < nF; f++) {
    if (pm[f] === null) { if (cur && ++gap > 2) close(); continue; }
    const p = pm[f] - tune;
    if (cur && Math.abs(p - cur.m) < 0.7) { cur.last = f; gap = 0; }
    else { close(); cur = { first: f, last: f, m: Math.round(p) }; gap = 0; }
  }
  close();
  fixOctaves(notes, range);
  const inRange = notes.filter(nt => nt.m >= range.lo && nt.m <= range.hi);
  // fusion des notes répétées trop proches (trou de détection sans vrai creux d'énergie), puis durée minimale
  const dipBetween = (A, B) => {
    const lo = Math.max(A.a, A.b - 5), hi = Math.min(B.b, B.a + 5);
    let pl = 0, pr = 0, mn = Infinity;
    for (let k = lo; k <= A.b; k++) pl = Math.max(pl, rms[k]);
    for (let k = B.a; k <= hi; k++) pr = Math.max(pr, rms[k]);
    for (let k = Math.max(0, A.b - 1); k <= Math.min(nF - 1, B.a + 1); k++) mn = Math.min(mn, rms[k]);
    return mn < ANA.dip * Math.min(pl, pr);
  };
  const merged = [];
  for (const nt of inRange) {
    const l = merged[merged.length - 1];
    if (l && l.m === nt.m && nt.t0 - l.t1 < ANA.mergeGap && !dipBetween(l, nt)) { l.t1 = nt.t1; l.b = nt.b; } else merged.push({ ...nt });
  }
  return merged.filter(r => r.t1 - r.t0 >= ANA.minDur).map(r => ({ t0: Math.max(0, +r.t0.toFixed(3)), t1: +r.t1.toFixed(3), m: r.m }));
}

async function analyzeSolo(song, solo, onProgress) {
  const range = resolveRange(solo);
  const blob = await idb('audio', 'readonly', s => s.get(song.id));
  const AC = window.AudioContext || window.webkitAudioContext;
  const want = range.hi >= 92 ? 44100 : 22050;     // les aigus de la flûte demandent une meilleure résolution
  let ctx; try { ctx = new AC({ sampleRate: want }); } catch { ctx = new AC(); }
  let buf;
  try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch {} }
  const sr = buf.sampleRate, i0 = Math.floor(solo.start * sr), i1 = Math.min(buf.length, Math.ceil(solo.end * sr));
  const n = i1 - i0, x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i0 + i] / buf.numberOfChannels; }
  return detectNotes(x, sr, range, onProgress);
}

/* ---------- 2. Tempo et quantification : doubles-croches (droit) ou croches swinguées (triolets) ---------- */
function phaseFor(raw, bpm, P = 15 / bpm) {       // P = durée d'un pas de la grille (par défaut une double-croche)
  let re = 0, im = 0;
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
  let bpm = hit[0];
  // Même grille, deux lectures : des doubles-croches à 112,5 ou des triolets à 150. On garde celle dont les attaques se regroupent
  // le mieux par temps (3 positions par temps en swing, 4 en jeu droit).
  const P = 15 / bpm, lead = phaseFor(raw, bpm), h3 = [0, 0, 0], h4 = [0, 0, 0, 0];
  for (const n of raw) { const k = Math.round((n.t0 - lead) / P); h3[((k % 3) + 3) % 3]++; h4[((k % 4) + 4) % 4]++; }
  const conc = h => (h.reduce((a, v) => a + v * v, 0) / (raw.length * raw.length) - 1 / h.length) / (1 - 1 / h.length);
  if (conc(h3) > conc(h4) + 0.06 && bpm * 4 / 3 <= 300) bpm = bpm * 4 / 3;
  return Math.round(bpm);
}
/* Triolets → positions écrites : 0, 1/3, 2/3 de temps deviennent 0, 1, 2 doubles-croches (la croche de contretemps swinguée s'écrit
   comme une croche droite, usage du jazz). Un temps vaut toujours 4 doubles-croches. */
const swingPos = k => Math.floor(k / 3) * 4 + ((k % 3) + 3) % 3;
const gridErr = (raw, lead, P) => raw.reduce((s, n) => { const u = (n.t0 - lead) / P; return s + Math.abs(u - Math.round(u)); }, 0) / Math.max(1, raw.length) * P;
function quantize(raw, bpm, lead, swing) {
  const g = (swing ? 20 : 15) / bpm, pos = swing ? swingPos : k => k, notes = []; let end = 0;
  for (const n of raw) {
    let p = pos(Math.round((n.t0 - lead) / g)); const e = pos(Math.round((n.t1 - lead) / g));
    if (p < end) p = end;
    const l = Math.max(1, e - p); notes.push({ p, l, m: n.m }); end = p + l;
  }
  return notes;
}
/* Tempo tapé : intervalles entre appuis (ms) → battements par minute, en ignorant les appuis ratés. */
function bpmFromTaps(ts) {
  if (ts.length < 3) return null;
  const iv = []; for (let i = 1; i < ts.length; i++) iv.push(ts[i] - ts[i - 1]);
  const med = [...iv].sort((a, b) => a - b)[iv.length >> 1], good = iv.filter(v => Math.abs(v - med) < med * 0.25);
  if (good.length < 2) return null;
  return Math.round(60000 / (good.reduce((a, b) => a + b, 0) / good.length) * 2) / 2;
}
/* Position d'une note écrite (en doubles-croches) en temps réels : en swing, la 2e croche tombe aux 2/3 du temps. */
const SW_FRAC = [0, 1 / 3, 2 / 3, 5 / 6];
const beatPos = (p, swing) => swing ? Math.floor(p / 4) + SW_FRAC[p % 4] : p / 4;
const fmtBpm = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
const FEEL_NEXT = { auto: 'straight', straight: 'swing', swing: 'auto' };
const feelLabel = sc => { const f = sc.feel || 'auto'; return f === 'auto' ? `Auto (${sc.swing ? 'swing' : 'droit'})` : f === 'swing' ? 'Swing' : 'Droit'; };

/* sc.feel : 'auto' | 'straight' | 'swing'. En auto, on garde la grille qui colle le mieux aux attaques. */
function requantize(sc) {
  const want = sc.feel || 'auto';
  const lead16 = phaseFor(sc.raw, sc.bpm, 15 / sc.bpm), leadT = phaseFor(sc.raw, sc.bpm, 20 / sc.bpm);
  let swing = want === 'swing';
  if (want === 'auto' && sc.raw.length >= 8) swing = gridErr(sc.raw, leadT, 20 / sc.bpm) < gridErr(sc.raw, lead16, 15 / sc.bpm) * 0.85;
  sc.swing = swing; sc.lead = swing ? leadT : lead16;
  sc.notes = quantize(sc.raw, sc.bpm, sc.lead, swing); sc.edited = false;
}

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
    if (li === 0) out.push(`<text x="${6 + CLEF_W + TS_W}" y="${top - 44}" font-size="12" font-family="system-ui,sans-serif" fill="${INK}">♩ = ${fmtBpm(sc.bpm)}${sc.swing ? '   Swing' : ''}</text>`);
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
    let g = `<g data-act="note" data-ni="${e.ni}" style="cursor:pointer"><circle cx="${e.x}" cy="${e.y}" r="15" fill="${sel ? 'rgba(31,111,235,.12)' : 'transparent'}"/>`;
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

function rangeControls(solo) {
  const key = solo.range && solo.range.key ? solo.range.key : 'auto', auto = resolveRange({ instrument: solo.instrument }), cur = resolveRange(solo);
  const opt = (v, t) => `<option value="${v}"${v === key ? ' selected' : ''}>${esc(t)}</option>`;
  let h = `<span class="lbl">Tessiture</span><select id="rangeSel" aria-label="Tessiture de l'instrument">${opt('auto', `Auto : ${auto.label} (${auto.span})`)}` +
    Object.entries(RANGES).map(([k, r]) => opt(k, `${r.label} (${r.span})`)).join('') + opt('manual', 'Manuelle…') + `</select>`;
  if (key === 'manual') {
    const notes = sel => { let o = ''; for (let m = 21; m <= 108; m++) o += `<option value="${m}"${m === sel ? ' selected' : ''}>${noteLabel(m)}</option>`; return o; };
    h += `<select id="rangeLo" aria-label="Note la plus grave">${notes(cur.lo)}</select><span class="lbl">à</span><select id="rangeHi" aria-label="Note la plus aiguë">${notes(cur.hi)}</select>`;
  }
  return h;
}
function sheetHTML(solo) {
  const sc = solo.score;
  const title = esc(solo.name) + (solo.instrument ? ' · ' + esc(solo.instrument) : '');
  return `<div class="sheet-top"><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">←</button><b>${title}</b>
      <button id="sheetPlay" data-act="sheet-play">▶ Solo</button></div>
    <div class="sheet-ctl">
      <span class="lbl">Tempo</span><button data-act="bpm" data-d="-1">−</button>
      <input id="bpmIn" class="bpm-in" type="number" inputmode="decimal" min="30" max="300" step="0.5" value="${sc ? fmtBpm(sc.bpm) : ''}" aria-label="Tempo en battements par minute"><button data-act="bpm" data-d="1">+</button>
      <button data-act="bpm-mul" data-f="0.5">÷2</button><button data-act="bpm-mul" data-f="2">×2</button>
    </div>
    <div class="sheet-ctl">
      <button id="tapBtn" class="wide" data-act="tap">Taper le tempo</button>
      <button class="wide" data-act="feel">Rythme : ${sc ? feelLabel(sc) : '…'}</button>
    </div>
    <div class="sheet-ctl">${rangeControls(solo)}
      <button data-act="acc" aria-label="Dièses ou bémols">${sc && sc.flats ? '♭' : '♯'}</button><button data-act="zoom-score" aria-label="Mesures par ligne">${SH.bars} mes.</button></div>
    <div id="scoreWrap">${sc ? '' : '<p class="hint" id="scMsg">Analyse du solo…</p>'}</div>
    <div id="noteBar"></div>
    <div class="sheet-exp"><button data-act="reanalyze">Réanalyser</button><button data-act="exp-midi">MIDI</button><button data-act="exp-xml">MusicXML</button></div>
    <p class="hint">Brouillon automatique${sc && sc.range ? ` (notes cherchées entre ${noteLabel(sc.range.lo)} et ${noteLabel(sc.range.hi)})` : ''} : touche une note pour l’écouter et la corriger.
      Le tempo se règle en le tapant au rythme du morceau, ou en le saisissant (÷2 / ×2 si le rythme est doublé ou divisé). « Rythme » : droit = doubles-croches, swing = croches swinguées (écrites droites, comme en jazz).</p>`;
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
function updateSheetPlay() { const b = $('#sheetPlay'); if (b) b.textContent = audio.paused ? '▶ Solo' : '⏸ Solo'; }
audio.addEventListener('play', updateSheetPlay); audio.addEventListener('pause', updateSheetPlay);

async function runAnalysis() {
  const solo = curSolo(), song = S.song; if (!solo || SH.busy) return;
  SH.busy = true; SH.sel = null;
  const wrap = $('#scoreWrap'); if (wrap) wrap.innerHTML = '<p class="hint" id="scMsg">Analyse du solo… 0 %</p>';
  try {
    const raw = await analyzeSolo(song, solo, p => { const m = $('#scMsg'); if (m) m.textContent = `Analyse du solo… ${Math.round(p * 100)} %`; });
    const range = resolveRange(solo), old = solo.score;
    if (!raw.length) toast(`Aucune note détectée entre ${noteLabel(range.lo)} et ${noteLabel(range.hi)} : vérifie l’instrument ou la tessiture`);
    const keep = old && old.bpmSet;                      // un tempo tapé ou saisi à la main est conservé à la réanalyse
    solo.score = { bpm: keep ? old.bpm : estimateBpm(raw), bpmSet: !!keep, lead: 0, raw, notes: [], edited: false,
      flats: old ? old.flats : false, feel: old && old.feel || 'auto', range: { key: range.key, lo: range.lo, hi: range.hi } };
    requantize(solo.score); saveSoon();
  } catch (e) { console.error(e); toast('Analyse impossible pour ce fichier'); }
  SH.busy = false;
  if (!$('#sheet').hidden) redrawSheet();
}
function redrawSheet() { const solo = curSolo(); if (!solo) return; $('#sheet').innerHTML = sheetHTML(solo); drawSheet(); updateSheetPlay(); }
function openSheet() {
  const solo = curSolo(); if (!solo) return;
  SH.sel = null; const sh = $('#sheet'); sh.hidden = false; document.body.style.overflow = 'hidden';
  sh.innerHTML = sheetHTML(solo); updateSheetPlay();
  if (solo.score) drawSheet(); else runAnalysis();
}
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; audio.pause(); }

function edit(fn) {
  const sc = sc$(); if (!sc || SH.sel === null) return;
  const nt = sc.notes[SH.sel]; if (!nt) return;
  if (fn(sc, nt, sc.notes[SH.sel - 1], sc.notes[SH.sel + 1]) !== false) { sc.edited = true; saveSoon(); }
  drawSheet();
}
const sureRedo = (sc, what) => !sc.edited || confirm(`${what} refait la partition et efface tes corrections. Continuer ?`);
function changeBpm(next, fromTap) {
  const sc = sc$(); if (!sc) return;
  next = clampN(next, 30, 300);
  if (!(fromTap && TAP.ok) && !sureRedo(sc, 'Changer le tempo')) { const i = $('#bpmIn'); if (i) i.value = fmtBpm(sc.bpm); return; }
  if (fromTap) TAP.ok = true;
  sc.bpm = next; sc.bpmSet = true; requantize(sc); SH.sel = null; saveSoon();
  const i = $('#bpmIn'); if (i && document.activeElement !== i) i.value = fmtBpm(sc.bpm);
  drawSheet();
  const f = $('[data-act=feel]'); if (f) f.textContent = 'Rythme : ' + feelLabel(sc);
}
/* Tempo tapé : appuyer en rythme sur le bouton ; la valeur se met à jour dès le 3e appui, une pause de 2,5 s recommence. */
const TAP = { t: [], ok: false };
function tapTempo() {
  const sc = sc$(); if (!sc) return;
  const now = performance.now();
  if (TAP.t.length && now - TAP.t[TAP.t.length - 1] > 2500) { TAP.t = []; TAP.ok = false; }
  TAP.t.push(now); if (TAP.t.length > 12) TAP.t.shift();
  const bpm = bpmFromTaps(TAP.t), btn = $('#tapBtn');
  if (btn) btn.textContent = bpm ? `Taper… ${fmtBpm(bpm)}` : `Taper… (${TAP.t.length})`;
  if (bpm && bpm >= 30 && bpm <= 300) changeBpm(bpm, true);
}
/* Tessiture : tout changement relance l'analyse (la plage borne la recherche de la hauteur). */
function setRange(patch) {
  const solo = curSolo(), sc = sc$(); if (!solo) return;
  if (sc && !sureRedo(sc, 'Changer la tessiture')) { redrawSheet(); return; }
  const cur = resolveRange(solo);
  const next = { ...(solo.range || {}), ...patch };
  if (next.key === 'manual') { next.lo = next.lo ?? cur.lo; next.hi = next.hi ?? cur.hi; if (next.hi < next.lo + 5) { toast('La plage doit couvrir au moins une quarte'); redrawSheet(); return; } }
  solo.range = next.key === 'auto' ? undefined : next;
  saveSoon(); runAnalysis();
}

/* ---------- 6. Export ---------- */
function saveBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileBase = () => (S.song.title + '-' + (curSolo().name || 'solo')).replace(/[^\wÀ-ſ-]+/g, '_');
function exportMidi() {
  const sc = sc$(), bytes = [], PPQ = 480, at = p => Math.round(beatPos(p, sc.swing) * PPQ);   // en swing, le fichier MIDI swingue aussi
  const vlq = v => { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o; };
  const us = Math.round(60e6 / sc.bpm), tr = [0, 0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xc0, resolveRange(curSolo()).prog];
  let tick = 0;
  for (const nt of sc.notes) {
    const on = at(nt.p), len = Math.max(1, Math.round((at(nt.p + nt.l) - on) * 0.97));
    tr.push(...vlq(Math.max(0, on - tick)), 0x90, nt.m, 90);
    tr.push(...vlq(len), 0x80, nt.m, 0);
    tick = on + len;
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
      if (mi === 0) xml += `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(sc.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(sc.bpm)}"/></direction>${sc.swing ? '<direction placement="above"><direction-type><words font-style="italic">Swing</words></direction-type></direction>' : ''}`;
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
    case 'sheet-play': { const s = curSolo(); if (audio.paused) { if (s) audio.currentTime = s.start; audio.play().catch(() => {}); } else audio.pause(); break; }
    case 'note': SH.sel = +d.ni; if (sc) playTone(sc.notes[SH.sel].m); drawSheet(); break;
    case 'bpm': changeBpm(sc.bpm + +d.d); break;
    case 'tap': tapTempo(); break;
    case 'feel': if (sc && sureRedo(sc, 'Changer le rythme')) { sc.feel = FEEL_NEXT[sc.feel || 'auto']; requantize(sc); SH.sel = null; saveSoon(); redrawSheet(); } break;
    case 'bpm-mul': changeBpm(sc.bpm * +d.f); break;
    case 'acc': if (sc) { sc.flats = !sc.flats; saveSoon(); redrawSheet(); } break;
    case 'zoom-score': SH.bars = SH.bars === 1 ? 2 : SH.bars === 2 ? 3 : 1; redrawSheet(); break;
    case 'reanalyze': if (!sc || !sc.edited || confirm('Réanalyser efface tes corrections. Continuer ?')) runAnalysis(); break;
    case 'exp-midi': if (sc) exportMidi(); break;
    case 'exp-xml': if (sc) exportXml(); break;
    case 'n-pitch': edit((s, n) => { n.m = clampN(n.m + +d.d, 21, 108); playTone(n.m); }); break;
    case 'n-len': edit((s, n, pv, nx) => {
      const l = Math.max(1, n.l + +d.d);
      if (nx && n.p + l > nx.p) { toast('Pas de place : la note suivante est trop proche'); return false; }
      n.l = l; }); break;
    case 'n-move': edit((s, n, pv, nx) => {
      const p = n.p + +d.d;
      if (p < 0 || (pv && p < pv.p + pv.l) || (nx && p + n.l > nx.p)) { toast('Pas de place pour décaler'); return false; }
      n.p = p; }); break;
    case 'n-dup': edit((s, n, pv, nx) => {
      const p = n.p + n.l, l = nx ? Math.min(n.l, nx.p - p) : n.l;
      if (l < 1) { toast('Pas de place après cette note'); return false; }
      s.notes.splice(SH.sel + 1, 0, { p, l, m: n.m }); SH.sel++; }); break;
    case 'n-del': edit(s => { s.notes.splice(SH.sel, 1); SH.sel = null; }); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target, sc = sc$(); if (!t.id || !curSolo()) return;
  if (t.id === 'bpmIn') { const v = parseFloat(String(t.value).replace(',', '.')); if (isFinite(v) && sc) changeBpm(v); else if (sc) t.value = fmtBpm(sc.bpm); }
  else if (t.id === 'rangeSel') setRange({ key: t.value });
  else if (t.id === 'rangeLo') setRange({ key: 'manual', lo: +t.value });
  else if (t.id === 'rangeHi') setRange({ key: 'manual', hi: +t.value });
});
