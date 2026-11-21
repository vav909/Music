'use strict';
/* Charge score.js dans un contexte Node avec de faux objets navigateur, pour tester l'analyse sans navigateur. */
const vm = require('vm'), fs = require('fs');

function loadScore(file, samples, sr) {
  const ctx = vm.createContext({ console, setTimeout, performance, Float32Array, Promise, Math, Array, Object, Number, String, JSON, Map, Set, Date });
  vm.runInContext(`
    const $ = () => null;
    const esc = s => String(s ?? '');
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
    let curSolo = () => null; const S = {}; const toast = () => {}; const saveSoon = () => {}; const ensureBeep = () => {}; let beepCtx = null;
    const audio = { addEventListener() {}, paused: true };
    const document = { addEventListener() {}, body: { style: {} } };
    const idb = async () => ({ arrayBuffer: async () => new ArrayBuffer(0) });
    class AudioContext {
      constructor(o) { this.want = (o && o.sampleRate) || 44100; }
      async decodeAudioData() {
        const src = globalThis.__SAMPLES, from = globalThis.__SR, f = Math.round(from / this.want) || 1;
        const n = Math.floor(src.length / f), d = new Float32Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += src[i * f + k]; d[i] = s / f; }   // rééchantillonnage simple
        return { sampleRate: from / f, length: n, numberOfChannels: 1, getChannelData: () => d, duration: n / (from / f) };
      }
      close() {}
    }
    const window = { AudioContext };
  `, ctx);
  ctx.__SAMPLES = samples; ctx.__SR = sr;
  const src = fs.readFileSync(file, 'utf8');
  const names = ['analyzeSolo', 'detectNotes', 'estimateBpm', 'requantize', 'quantize', 'buildEvents', 'resolveRange', 'rangeKeyFor', 'RANGES', 'swingPos', 'bpmFromTaps', 'beatPos']
    .filter(n => new RegExp('(function|const|let)\\s+' + n + '\\b').test(src));
  vm.runInContext(src + `\n;globalThis.__api = { ${names.join(', ')} };`, ctx);
  return ctx.__api;
}

/* Compare des notes détectées à la vérité terrain. */
function score(raw, truth, tol = 0.09) {
  const used = new Set(); let ok = 0, oct = 0, wrong = 0;
  for (const t of truth) {
    let best = -1, bd = tol;
    raw.forEach((r, i) => { const d = Math.abs(r.t0 - t.t0); if (!used.has(i) && d <= bd) { bd = d; best = i; } });
    if (best < 0) continue; used.add(best);
    const dm = raw[best].m - t.m;
    if (dm === 0) ok++; else if (Math.abs(dm) % 12 === 0) oct++; else wrong++;
  }
  return { truth: truth.length, detected: raw.length, ok, oct, wrong, missed: truth.length - ok - oct - wrong, extra: raw.length - used.size };
}
module.exports = { loadScore, score };
