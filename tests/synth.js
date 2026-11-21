'use strict';
/* Signal de test : un solo de flûte swingué avec accompagnement (basse, piano, cymbale), notes connues.
   Ce n'est PAS un vrai enregistrement : il sert à comparer des versions de l'analyse entre elles. */

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

/* Ligne mélodique de croches swinguées (2:1) avec quelques noires et des respirations. */
function makeLine({ bpm = 150, bars = 12, lo = 67, hi = 90, seed = 7, swing = true }) {
  const r = rng(seed), beat = 60 / bpm, notes = [];
  const scale = [0, 2, 3, 5, 7, 9, 10];          // ré dorien, en demi-tons depuis la tonique
  let m = 74, t = 0; const total = bars * 4 * beat;
  while (t < total - beat) {
    let inBeat = (t / beat) % 1; if (inBeat > 0.9999) inBeat = 0; const onBeat = inBeat < 1e-6;
    let dur;
    if (onBeat) dur = r() < 0.18 ? beat : (swing ? beat * 2 / 3 : beat / 2);
    else dur = swing ? beat / 3 : beat / 2;
    if (!onBeat && Math.abs(inBeat - (swing ? 2 / 3 : 0.5)) > 1e-6) dur = beat * (1 - inBeat);
    // pas mélodique par degrés, avec un saut d'octave rare
    const step = [-3, -2, -1, -1, 1, 1, 2, 3][Math.floor(r() * 8)];
    let nm = m + step * (r() < 0.5 ? 1 : 2); if (r() < 0.04) nm += r() < 0.5 ? 12 : -12;
    // reste dans la gamme et dans la tessiture
    while (!scale.includes((((nm - 62) % 12) + 12) % 12)) nm += 1;
    nm = Math.max(lo, Math.min(hi, nm)); m = nm;
    const rest = r() < 0.07 && !onBeat;
    if (!rest) notes.push({ t0: t, t1: t + dur * 0.93, m });
    t += dur;
  }
  return { notes, total, bpm };
}

/* Mixe tout dans un tableau Float32 mono. */
function render({ line, sr = 44100, accomp = true, gain = 1, seed = 3 }) {
  const n = Math.ceil((line.total + 0.5) * sr), x = new Float32Array(n), r = rng(seed), beat = 60 / line.bpm;
  const add = (t0, t1, f, amp, harm, att, rel, vib) => {
    const i0 = Math.floor(t0 * sr), i1 = Math.min(n, Math.floor(t1 * sr));
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sr, d = (i1 - i0) / sr;
      const env = Math.min(1, t / att) * Math.min(1, (d - t) / rel);
      const ff = f * (1 + (vib ? 0.004 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.2) : 0));
      ph += 2 * Math.PI * ff / sr;
      let v = 0; for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(ph * (h + 1));
      x[i] += amp * env * v;
    }
  };
  for (const nt of line.notes) add(nt.t0, nt.t1, hz(nt.m + 0.1), 0.42, [1, 0.35, 0.12, 0.05], 0.03, 0.04, nt.t1 - nt.t0 > 0.25);
  // souffle de la flûte
  for (const nt of line.notes) { const i0 = Math.floor(nt.t0 * sr), i1 = Math.floor(nt.t1 * sr); for (let i = i0; i < i1 && i < n; i++) x[i] += 0.012 * (r() * 2 - 1); }
  if (accomp) {
    const bars = Math.ceil(line.total / (4 * beat)), roots = [38, 43, 36, 41];       // basse qui marche, grave
    for (let b = 0; b < bars * 4; b++) { const root = roots[Math.floor(b / 4) % 4] + [0, 2, 4, 5][b % 4]; add(b * beat, (b + 1) * beat * 0.95, hz(root), 0.28 * gain, [1, 0.55, 0.3, 0.12], 0.01, 0.05, false); }
    for (let b = 0; b < bars * 4; b += 2) {                                          // accords de piano sur les temps 2 et 4
      const root = roots[Math.floor(b / 4) % 4] + 24;
      for (const iv of [0, 4, 7, 10]) add((b + 1) * beat, (b + 1) * beat + 0.35, hz(root + iv), 0.07 * gain, [1, 0.4, 0.2], 0.005, 0.3, false);
    }
    for (let b = 0; b < bars * 4; b++) for (const off of [0, 2 / 3]) {                // cymbale ride
      const i0 = Math.floor((b + off) * beat * sr); for (let k = 0; k < 2200 && i0 + k < n; k++) x[i0 + k] += gain * (off ? 0.02 : 0.03) * (r() * 2 - 1) * Math.exp(-k / 700);
    }
  }
  let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(x[i]));
  for (let i = 0; i < n; i++) x[i] = x[i] / mx * 0.8;
  return x;
}

function writeWav(path, x, sr) {
  const fs = require('fs'), b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(path, b);
}

module.exports = { makeLine, render, writeWav, hz };
