'use strict';
/* Compare l'analyse d'une version précédente (par défaut la branche main) à la version actuelle, sur le même signal.
   node tests/compare.js [révision-git]      — signal synthétique : voir synth.js. Pour un vrai solo, passer par l'app. */
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { makeLine, render } = require('./synth.js');
const { loadScore, score } = require('./harness.js');
const rev = process.argv[2] || 'main', old = path.join(os.tmpdir(), 'score.avant.js');
const dir = process.env.SOLO_DIR || '';
fs.writeFileSync(old, execSync(`git show ${rev}:${dir ? dir + '/' : ''}score.js`, { cwd: path.join(__dirname, '..') }));
const neu = path.join(__dirname, '..', dir, 'score.js');
(async () => {
  const cases = [['flûte seule', false, 1], ['accompagnement léger', true, 1], ['accompagnement fort ×2', true, 2], ['accompagnement très fort ×3', true, 3]];
  for (const swing of [true, false]) for (const [name, accomp, gain] of cases) {
    const line = makeLine({ bpm: 150, bars: 12, lo: 67, hi: 90, seed: 7, swing }), x = render({ line, accomp, gain });
    for (const [lab, f] of [['avant', old], ['après', neu]]) {
      const api = loadScore(f, x, 44100), t = Date.now();
      let raw = await api.analyzeSolo({ id: 'a' }, { start: 0, end: line.total, instrument: 'Flûte' }, () => {});
      if (!Array.isArray(raw)) raw = raw.raw;          // selon la version : tableau de notes ou { raw, diag }
      const s = score(raw, line.notes);
      console.log(`${swing ? 'swing' : 'droit'} · ${name}`.padEnd(40), lab.padEnd(6), `justes ${String(s.ok).padStart(2)}/${s.truth}  octave ${s.oct}  fausses ${s.wrong}  manquantes ${String(s.missed).padStart(2)}  en trop ${String(s.extra).padStart(2)}  ${String(Date.now() - t).padStart(4)} ms`);
    }
  }
})();
