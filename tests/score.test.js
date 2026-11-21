'use strict';
/* Tests de l'analyse de la partition (sans navigateur) :  node tests/score.test.js */
const assert = require('assert');
const path = require('path');
const { makeLine, render } = require('./synth.js');
const { loadScore, score } = require('./harness.js');
const FILE = path.join(__dirname, '..', 'score.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  ÉCHEC', name, '\n       ', e.message); } };

(async () => {
  const api = loadScore(FILE, new Float32Array(10), 44100);

  console.log('Tessiture');
  await t('instrument → plage', () => {
    const cases = [['Flûte', 'flute'], ['flute traversière', 'flute'], ['Sax alto', 'alto'], ['Saxophone alto', 'alto'], ['Saxophone ténor', 'tenor'], ['sax soprano', 'soprano'],
      ['Baryton', 'baryton'], ['Trompette', 'trompette'], ['Trumpet', 'trompette'], ['Piano', 'piano'], ['Saxophone', 'sax'], ['', 'general'], ['Guitare', 'general']];
    for (const [txt, key] of cases) assert.strictEqual(api.rangeKeyFor(txt), key, txt);
  });
  await t('bornes demandées (do4 = 60)', () => {
    const want = { flute: [60, 96], soprano: [54, 88], alto: [49, 80], tenor: [44, 75], baryton: [37, 68], trompette: [54, 84], piano: [48, 96] };
    for (const [k, [lo, hi]] of Object.entries(want)) { assert.strictEqual(api.RANGES[k].lo, lo, k + ' bas'); assert.strictEqual(api.RANGES[k].hi, hi, k + ' haut'); }
  });
  await t('réglage manuel prioritaire, borné', () => {
    const r = api.resolveRange({ instrument: 'Flûte', range: { key: 'manual', lo: 50, hi: 40 } });
    assert.strictEqual(r.key, 'manual'); assert.strictEqual(r.lo, 50); assert.strictEqual(r.hi, 55);
    assert.strictEqual(api.resolveRange({ instrument: 'Flûte', range: { key: 'tenor' } }).key, 'tenor');
    assert.strictEqual(api.resolveRange({ instrument: 'Sax alto' }).key, 'alto');
  });

  console.log('Détection des notes (signal synthétique : flûte swinguée + basse, piano, cymbale)');
  const line = makeLine({ bpm: 150, bars: 12, lo: 67, hi: 90, seed: 7 });
  const run = async (x, instrument, extra = {}) => loadScore(FILE, x, 44100).analyzeSolo({ id: 'a' }, { start: 0, end: line.total, instrument, ...extra }, () => {});
  await t('flûte seule : toutes les notes justes', async () => {
    const s = score(await run(render({ line, accomp: false }), 'Flûte'), line.notes);
    assert.ok(s.ok >= s.truth * 0.95, JSON.stringify(s)); assert.ok(s.extra <= 2, JSON.stringify(s));
  });
  await t('avec accompagnement : au moins 85 % de notes justes', async () => {
    const s = score(await run(render({ line, accomp: true, gain: 1 }), 'Flûte'), line.notes);
    assert.ok(s.ok >= s.truth * 0.85, JSON.stringify(s)); assert.ok(s.extra <= 6, JSON.stringify(s));
  });
  await t('notes graves (basse) rejetées avec la tessiture de la flûte, trouvées en plage générale', async () => {
    const low = makeLine({ bpm: 120, bars: 6, lo: 38, hi: 55, seed: 11 }), x = render({ line: low, accomp: false });
    const call = inst => loadScore(FILE, x, 44100).analyzeSolo({ id: 'a' }, { start: 0, end: low.total, instrument: inst }, () => {});
    const fl = await call('Flûte'), gen = await call('Guitare');
    assert.ok(fl.every(n => n.m >= 60 && n.m <= 96), 'une note hors plage a été gardée');
    assert.ok(fl.length < low.notes.length * 0.3, `flûte : ${fl.length} notes sur ${low.notes.length}`);
    assert.ok(score(gen, low.notes).ok >= low.notes.length * 0.7, 'plage générale : ' + JSON.stringify(score(gen, low.notes)));
  });
  await t('toutes les notes détectées sont dans la plage du solo', async () => {
    for (const inst of ['Flûte', 'Sax alto', 'Trompette']) {
      const r = api.resolveRange({ instrument: inst }), raw = await run(render({ line, accomp: true, gain: 2 }), inst);
      assert.ok(raw.every(n => n.m >= r.lo && n.m <= r.hi), inst);
    }
  });
  await t('hauteurs décalées (accord à 442 Hz) : notes justes', async () => {
    const x = render({ line, accomp: false }), y = new Float32Array(x.length);   // +0,3 demi-ton par rééchantillonnage
    const f = Math.pow(2, 0.3 / 12); for (let i = 0; i < y.length; i++) { const j = i * f, k = Math.floor(j), fr = j - k; y[i] = (x[k] || 0) * (1 - fr) + (x[k + 1] || 0) * fr; }
    const s = score(await run(y, 'Flûte'), line.notes.map(n => ({ ...n, t0: n.t0 / f })));
    assert.ok(s.ok >= s.truth * 0.9, JSON.stringify(s));
  });

  console.log('Rythme, swing, tempo');
  await t('positions swing (triolets → croches écrites)', () => {
    assert.strictEqual([0, 1, 2, 3, 4, 5, 6].map(api.swingPos).join(), '0,1,2,4,5,6,8');
    assert.strictEqual(api.beatPos(2, true), 2 / 3); assert.strictEqual(api.beatPos(2, false), 0.5); assert.strictEqual(api.beatPos(4, true), 1);
  });
  const quant = async (swing, feel) => {
    const l = makeLine({ bpm: 150, bars: 12, lo: 67, hi: 90, seed: 7, swing }), x = render({ line: l, accomp: false });
    const raw = await loadScore(FILE, x, 44100).analyzeSolo({ id: 'a' }, { start: 0, end: l.total, instrument: 'Flûte' }, () => {});
    const sc = { bpm: 150, raw, feel }; api.requantize(sc); return { sc, l };
  };
  await t('auto : reconnaît le swing', async () => { const { sc } = await quant(true, 'auto'); assert.strictEqual(sc.swing, true); });
  await t('auto : reconnaît le jeu droit', async () => { const { sc } = await quant(false, 'auto'); assert.strictEqual(sc.swing, false); });
  await t('bascule manuelle respectée', async () => {
    assert.strictEqual((await quant(true, 'straight')).sc.swing, false); assert.strictEqual((await quant(false, 'swing')).sc.swing, true);
  });
  await t('quantification swing : croches de contretemps bien placées', async () => {
    const { sc, l } = await quant(true, 'swing'), g = 60 / 150 / 3;
    let ok = 0, n = 0;
    const first = sc.notes[0], r0 = sc.raw[0];
    for (let i = 0; i < sc.notes.length; i++) {
      const tr = l.notes.find(x => Math.abs(x.t0 - sc.raw[i].t0) < 0.09); if (!tr) continue; n++;
      const want = api.swingPos(Math.round(tr.t0 / g)) - api.swingPos(Math.round(l.notes.find(x => Math.abs(x.t0 - r0.t0) < 0.09).t0 / g));
      if (sc.notes[i].p - first.p === want) ok++;
    }
    assert.ok(ok >= n * 0.9, `${ok}/${n}`);
  });
  await t('tempo estimé : 150 en swing comme en jeu droit (pas 112)', async () => {
    for (const swing of [true, false]) {
      const l = makeLine({ bpm: 150, bars: 12, lo: 67, hi: 90, seed: 7, swing }), x = render({ line: l, accomp: true, gain: 1 });
      const raw = await loadScore(FILE, x, 44100).analyzeSolo({ id: 'a' }, { start: 0, end: l.total, instrument: 'Flûte' }, () => {});
      const bpm = api.estimateBpm(raw); assert.ok(Math.abs(bpm - 150) <= 3, `${swing ? 'swing' : 'droit'} : ${bpm}`);
    }
  });
  await t('tempo tapé', () => {
    const jit = [0, 3, -4, 5, -2, 4, -5, 2], ts = jit.map((j, i) => i * 400 + j);
    assert.strictEqual(api.bpmFromTaps(ts), 150);
    assert.strictEqual(api.bpmFromTaps([0, 400, 800, 1600, 2000, 2400]), 150);        // un temps manqué
    assert.strictEqual(api.bpmFromTaps([0, 400]), null);
  });

  if (fails) { console.log(`\n${fails} test(s) en échec`); process.exit(1); }
  console.log('\nTous les tests passent.');
})();
