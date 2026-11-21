'use strict';
/* Tests de l'analyse de la partition (sans navigateur) :  node tests/score.test.js
   Signal synthétique (tests/synth.js) : ce n'est pas un vrai enregistrement, il sert à repérer les régressions. */
const assert = require('assert');
const path = require('path');
const { makeLine, render } = require('./synth.js');
const { loadScore, score } = require('./harness.js');
const FILE = path.join(__dirname, '..', 'score.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  ÉCHEC', name, '\n       ', e.message); } };
const rawOf = r => Array.isArray(r) ? r : r.raw;
const analyse = async (x, total, instrument, extra = {}) => rawOf(await loadScore(FILE, x, 44100).analyzeSolo({ id: 'a' }, { start: 0, end: total, instrument, ...extra }, () => {}));
/* notes imposées : [[hauteur, début, fin], …] */
const make = (spec, bpm = 120) => ({ bpm, total: Math.max(...spec.map(s => s[2])) + 0.3, notes: spec.map(([m, t0, t1]) => ({ m, t0, t1 })) });

(async () => {
  console.log('Tessiture');
  const api = loadScore(FILE, new Float32Array(10), 44100);
  await t('plage de la flûte (do4–do7) et instrument inconnu signalé', () => {
    const f = api.rangeFor('Flûte'); assert.strictEqual(f.lo, 60); assert.strictEqual(f.hi, 96); assert.strictEqual(f.known, true);
    assert.strictEqual(api.rangeFor('Kazoo').known, false);
  });
  await t('notes graves (basse) rejetées avec la tessiture de la flûte', async () => {
    const low = makeLine({ bpm: 120, bars: 6, lo: 38, hi: 55, seed: 11 }), raw = await analyse(render({ line: low, accomp: false }), low.total, 'Flûte');
    assert.ok(raw.every(n => n.m >= 60 && n.m <= 96), 'une note hors plage a été gardée');
    assert.ok(raw.length < low.notes.length * 0.3, `${raw.length} notes sur ${low.notes.length}`);
  });

  console.log('Notes répétées et attaques (séparation aux creux d\'énergie)');
  await t('huit notes répétées à la même hauteur = huit notes', async () => {
    const l = make(Array.from({ length: 8 }, (_, i) => [79, 0.2 + i * 0.25, 0.2 + i * 0.25 + 0.21]));
    const raw = await analyse(render({ line: l, accomp: false }), l.total, 'Flûte');
    assert.ok(raw.filter(n => n.m === 79).length >= 7, `${raw.length} notes : ${raw.map(n => n.m + '@' + n.t0.toFixed(2)).join(' ')}`);
  });
  await t('une note tenue avec vibrato reste une seule note', async () => {
    const l = make([[79, 0.2, 1.6]]), raw = await analyse(render({ line: l, accomp: false }), l.total, 'Flûte');
    assert.strictEqual(raw.filter(n => n.m === 79).length, 1, raw.map(n => n.m + '@' + n.t0.toFixed(2)).join(' '));
  });
  await t('deux notes de hauteurs différentes : toujours deux notes', async () => {
    const l = make([[79, 0.2, 0.7], [81, 0.72, 1.2]]), raw = await analyse(render({ line: l, accomp: false }), l.total, 'Flûte');
    assert.strictEqual(raw.map(n => n.m).join(), '79,81');
  });
  const line = makeLine({ bpm: 150, bars: 12, lo: 67, hi: 90, seed: 7 });
  await t('solo swingué, flûte seule : toutes les attaques retrouvées', async () => {
    const s = score(await analyse(render({ line, accomp: false }), line.total, 'Flûte'), line.notes);
    assert.ok(s.ok + s.oct >= s.truth * 0.95, JSON.stringify(s)); assert.ok(s.extra <= 2, JSON.stringify(s));
  });
  await t('avec accompagnement : au moins 90 % des attaques retrouvées', async () => {
    const s = score(await analyse(render({ line, accomp: true, gain: 1 }), line.total, 'Flûte'), line.notes);
    assert.ok(s.ok + s.oct >= s.truth * 0.9, JSON.stringify(s)); assert.ok(s.extra <= 6, JSON.stringify(s));
  });

  console.log('Mélange de concert (nappe d\'orgue, batterie, salle, réverbération)');
  await t('concert : ≥ 80 % des attaques et ≥ 60 % des hauteurs retrouvées (2 morceaux)', async () => {
    let ok = 0, found = 0, truth = 0;
    for (const seed of [5, 13]) {
      const l = makeLine({ bpm: 100, bars: 6, lo: 70, hi: 87, seed }), s = score(await analyse(render({ line: l, accomp: true, gain: 1, live: 0.4 }), l.total, 'Flute'), l.notes);
      ok += s.ok; found += s.ok + s.oct + s.wrong; truth += s.truth;
    }
    assert.ok(found >= truth * 0.8 && ok >= truth * 0.6, `justes ${ok}/${truth}, attaques ${found}/${truth}`);
  });
  await t('sauts de plus d\'une octave dans un solo : conservés, pas « corrigés »', async () => {
    const seq = [72, 84, 74, 86, 72, 84, 76, 88], l = make(seq.map((m, i) => [m, 0.2 + i * 0.4, 0.2 + i * 0.4 + 0.33]));
    const raw = await analyse(render({ line: l, accomp: false }), l.total, 'Flûte');
    assert.strictEqual(raw.map(n => n.m).join(), seq.join());
  });
  await t('le diagnostic décrit les images sans hauteur', async () => {
    const l = make([[79, 0.2, 1.0]]), r = await loadScore(FILE, render({ line: l, accomp: false }), 44100).analyzeSolo({ id: 'a' }, { start: 0, end: l.total, instrument: 'Flûte' }, () => {});
    assert.ok(Array.isArray(r.diag.bands) && r.diag.bands.length === 5 && r.diag.track.length === r.diag.frames);
  });

  console.log('Musique latine (basse à harmoniques fortes, montuno, percussions) : la flûte joue plus haut');
  const latin = seed => { const l = makeLine({ bpm: 130, bars: 6, lo: 77, hi: 90, seed, swing: false }); return { l, x: render({ line: l, accomp: false, latin: 1 }) }; };
  await t('plage réglée à la main : réglage pris en compte, borné', () => {
    const r = api.soloRange({ instrument: 'Flûte', range: { lo: 75, hi: 96 } }); assert.strictEqual(r.lo, 75); assert.strictEqual(r.hi, 96); assert.strictEqual(r.manual, true);
    assert.strictEqual(api.soloRange({ instrument: 'Flûte', range: { lo: 80, hi: 70 } }).hi, 86);
    assert.strictEqual(api.soloRange({ instrument: 'Flûte' }).lo, 60);
  });
  await t('par défaut, la basse et le piano sont pris pour le soliste (le défaut décrit dans le diagnostic)', async () => {
    const { l, x } = latin(3), raw = await analyse(x, l.total, 'Flûte'), m = raw.map(n => n.m).sort((a, b) => a - b);
    assert.ok(m[m.length >> 1] < 74, `médiane ${m[m.length >> 1]}`);
  });
  await t('plage réglée à la main : ≥ 75 % des notes justes ; avec « voix aiguë » : ≥ 85 %', async () => {
    for (const seed of [3, 7]) {
      const { l, x } = latin(seed), a = score(await analyse(x, l.total, 'Flûte', { range: { lo: 75, hi: 96 } }), l.notes), b = score(await analyse(x, l.total, 'Flûte', { range: { lo: 75, hi: 96 }, top: true }), l.notes);
      assert.ok(a.ok >= a.truth * 0.75, `graine ${seed}, plage : ${JSON.stringify(a)}`); assert.ok(b.ok >= b.truth * 0.85, `graine ${seed}, plage + voix aiguë : ${JSON.stringify(b)}`);
    }
  });
  await t('« voix aiguë » ne dégrade pas un solo normal', async () => {
    const s = score(await analyse(render({ line, accomp: false }), line.total, 'Flûte', { top: true }), line.notes);
    assert.ok(s.ok + s.oct >= s.truth * 0.95, JSON.stringify(s));
  });

  if (fails) { console.log(`\n${fails} test(s) en échec`); process.exit(1); }
  console.log('\nTous les tests passent.');
})();
