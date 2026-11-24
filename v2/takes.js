'use strict';
/* « Mes prises » : enregistrer sa prise par-dessus un solo, puis la réécouter superposée au solo d'origine, à l'oreille.
   Aucune analyse de la prise (sauf l'essai de calage automatique, qui ne fait que proposer un décalage).
   Stockage : base IndexedDB séparée « solo-looper-takes » (la base « solo-looper » partagée avec la v1 n'est pas touchée).
   Aucune dépendance. Les prises ne sont jamais exportées avec les repères (audio personnel). */

const TK = { db: null, list: [], rec: null, cur: null, ctx: null, el: null, g: null, timer: 0, urls: [], micLabel: '', lastMime: '' };
const TK_LS = { mic: 'sl-mic', off: 'sl-tk-offset' };
const tkGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const tkSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const TKI = {
  mic: '<svg class="ic" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>',
  rec: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="currentColor"/></svg>',
  stop: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
};

/* ---------- Stockage ---------- */
function tkOpen() {
  if (TK.db) return Promise.resolve(TK.db);
  return new Promise((res, rej) => {
    const r = indexedDB.open('solo-looper-takes', 1);
    r.onupgradeneeded = () => { const st = r.result.createObjectStore('takes', { keyPath: 'id' }); st.createIndex('soloId', 'soloId'); st.createIndex('songId', 'songId'); };
    r.onsuccess = () => { TK.db = r.result; res(TK.db); };
    r.onerror = () => rej(r.error);
  });
}
async function tkTx(mode, fn) {
  const db = await tkOpen();
  return new Promise((res, rej) => { const tx = db.transaction('takes', mode), req = fn(tx.objectStore('takes')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); });
}
const tkForSolo = id => tkTx('readonly', st => st.index('soloId').getAll(id));
const tkPut = t => tkTx('readwrite', st => st.put(t));
const tkDelete = id => tkTx('readwrite', st => st.delete(id));
async function tkDeleteBy(index, id) { const all = await tkTx('readonly', st => st.index(index).getAllKeys(id)); for (const k of all || []) await tkDelete(k); }

/* ---------- Affichage ---------- */
const tkDate = at => new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tkOffLabel = v => (v > 0 ? '+' : '') + v + ' ms';
function takesHTML() {
  const off = +tkGet(TK_LS.off, 0) || 0;
  return `<div class="tk-wrap">
    <button class="tk-rec" data-act="tk-rec" id="tkRec">${TKI.rec}<span>Enregistrer</span></button>
    <p class="hint" id="tkMsg">Mets ton casque, touche « Enregistrer » : 3 bips, puis le solo démarre et ta prise s’enregistre.</p>
    <div id="tkList" class="tk-list"></div>
    <details class="tk-set"><summary>Micro et casque</summary>
      <div class="tk-set-body">
        <label class="tk-f">Micro<select id="tkMic"><option value="">Micro par défaut</option></select></label>
        <p class="hint">Choisis le micro intégré du téléphone. Avec le micro d’un casque Bluetooth, le téléphone passe en mode « mains libres » et le son devient très mauvais.</p>
        <div class="tk-f">Mon casque : décalage proposé aux nouvelles prises
          <div class="tk-off-row"><button class="pl-sq" data-act="tk-dflt" data-d="-10" aria-label="Moins 10 ms">${IC.minus}</button><b id="tkDflt">${tkOffLabel(off)}</b><button class="pl-sq" data-act="tk-dflt" data-d="10" aria-label="Plus 10 ms">${IC.plus}</button></div>
        </div>
      </div>
    </details>
  </div>`;
}
function tkItemHTML(t) {
  const playing = id => TK.cur && TK.cur.id === t.id && TK.cur.mix === id;
  const btn = (mix, label) => `<button class="tk-b${playing(mix) ? ' on' : ''}" data-act="tk-play" data-id="${t.id}"${mix ? ' data-mix="1"' : ''}>${playing(mix) ? IC.pause : IC.play}<span>${label}</span></button>`;
  return `<div class="tk" data-id="${t.id}">
    <div class="tk-top"><small class="tk-date">${tkDate(t.at)} · ${fmt(t.duration)}</small><button class="tk-del" data-act="tk-del" data-id="${t.id}" aria-label="Supprimer cette prise">${IC.trash}</button></div>
    <div class="tk-btns">${btn(false, 'Prise seule')}${btn(true, 'Superposée au solo')}</div>
    <label class="tk-vol"><span>Ma prise</span><input type="range" min="0" max="100" step="1" value="${t.volTake}" data-tk="volTake" data-id="${t.id}" aria-label="Volume de ma prise"><b>${t.volTake} %</b></label>
    <label class="tk-vol"><span>Solo original</span><input type="range" min="0" max="100" step="1" value="${t.volSolo}" data-tk="volSolo" data-id="${t.id}" aria-label="Volume du solo original"><b>${t.volSolo} %</b></label>
    <details class="tk-off"><summary>Décalage</summary>
      <div class="tk-off-row"><button class="pl-sq" data-act="tk-off" data-id="${t.id}" data-d="-10" aria-label="Moins 10 ms">${IC.minus}</button>
        <input type="range" min="-300" max="800" step="10" value="${t.offsetMs}" data-tk="offsetMs" data-id="${t.id}" aria-label="Décalage de la prise"><button class="pl-sq" data-act="tk-off" data-id="${t.id}" data-d="10" aria-label="Plus 10 ms">${IC.plus}</button></div>
      <div class="tk-off-row"><b class="tk-offv" data-id="${t.id}">${tkOffLabel(t.offsetMs)}</b><button class="tk-b" data-act="tk-auto" data-id="${t.id}"><span>Caler automatiquement</span></button><small class="tk-essai">essai</small></div>
      <p class="hint tk-auto" data-id="${t.id}" hidden></p>
    </details>
  </div>`;
}
function tkRender() {
  const box = document.getElementById('tkList'); if (!box) return;
  box.innerHTML = TK.list.length ? TK.list.map(tkItemHTML).join('') : '<p class="hint">Aucune prise pour ce solo.</p>';
  const rec = document.getElementById('tkRec'); if (rec) tkRecUI();
}
function tkRecUI(label) {
  const b = document.getElementById('tkRec'); if (!b) return;
  const st = TK.rec ? TK.rec.state : '';
  b.classList.toggle('on', !!st);
  const sb = document.getElementById('sbRec');
  if (sb) sb.classList.toggle('rec', !!st);
  b.innerHTML = st === 'rec' ? `${TKI.stop}<span>Arrêter</span>` : st === 'count' ? `<span>${label || '…'}</span>` : `${TKI.rec}<span>Enregistrer</span>`;
}
function tkButtons() {   // met à jour seulement les boutons de lecture (la liste, ses réglages ouverts et ses curseurs restent en place)
  document.querySelectorAll('.tk-b[data-act="tk-play"]').forEach(b => {
    const on = !!(TK.cur && TK.cur.id === b.dataset.id && TK.cur.mix === !!b.dataset.mix);
    b.classList.toggle('on', on); const sp = b.querySelector('span'); b.innerHTML = (on ? IC.pause : IC.play) + `<span>${sp ? sp.textContent : ''}</span>`;
  });
}
const tkMsg = m => { const e = document.getElementById('tkMsg'); if (e) e.textContent = m; };

/* ---------- Micro ---------- */
const TK_BT = /bluetooth|headset|casque|airpods|buds|hands-?free|\bbt\b|oreillette/i, TK_INT = /int[ée]gr|built-?in|internal|t[ée]l[ée]phone|phone|microphone array|bottom|front|back|arri[èe]re|avant/i;
async function tkMics(fill) {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.label);
    const sel = document.getElementById('tkMic');
    if (sel && fill !== false) {
      let cur = tkGet(TK_LS.mic, '');
      if (!cur) { const d = devs.find(d => TK_INT.test(d.label) && !TK_BT.test(d.label)); if (d) { cur = d.deviceId; } }
      sel.innerHTML = '<option value="">Micro par défaut</option>' + devs.map(d => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label)}${TK_BT.test(d.label) ? ' (Bluetooth)' : ''}</option>`).join('');
      if (cur && !tkGet(TK_LS.mic, '')) tkSet(TK_LS.mic, cur);
    }
    return devs;
  } catch { return []; }
}
async function tkGetMic() {
  const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
  const id = tkGet(TK_LS.mic, '');
  let stream;
  if (id) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: id } } }); } catch (e) { if (e && e.name === 'NotAllowedError') throw e; } }
  if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: base });
  const devs = await tkMics();
  const trk = stream.getAudioTracks()[0]; TK.micLabel = trk ? trk.label : '';
  if (TK_BT.test(TK.micLabel)) toast('Micro Bluetooth détecté : la qualité sera mauvaise. Choisis le micro du téléphone.');
  return stream;
}

/* ---------- Enregistrement ---------- */
function tkMime() { for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {} } return ''; }
async function tkRecord() {
  if (TK.rec) { if (TK.rec.state === 'count') tkCancelCount(); else tkStopRec(); return; }
  const solo = curSolo(); if (!solo || !S.song) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { tkMsg('Ce navigateur ne permet pas d’enregistrer le micro.'); return; }
  tkStop(); audio.pause(); cancelGap(); ensureBeep();
  let stream;
  try { stream = await tkGetMic(); }
  catch (e) {
    tkMsg(e && e.name === 'NotAllowedError' ? 'Micro refusé : autorise le micro pour ce site dans les réglages du navigateur, puis réessaie.'
      : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'Aucun micro trouvé sur cet appareil.' : 'Impossible d’ouvrir le micro (' + (e && e.name || 'erreur') + ').');
    return;
  }
  const mime = tkMime(); let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch { stream.getTracks().forEach(t => t.stop()); tkMsg('Enregistrement impossible sur cet appareil.'); return; }
  TK.lastMime = mr.mimeType || mime;
  const rec = TK.rec = { state: 'count', stream, mr, chunks: [], solo, songId: S.song.id, rate: S.tempo, timers: [] };
  mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  mr.onstop = () => tkFinish(rec);
  tkMsg('Prépare-toi…'); tkRecUI('3');
  [0, 1, 2].forEach(i => rec.timers.push(setTimeout(() => { beep(false); tkRecUI(String(3 - i)); }, i * 1000)));
  rec.timers.push(setTimeout(() => {
    beep(true); rec.state = 'rec'; rec.t0 = performance.now();
    try { mr.start(); } catch { tkCancelCount(); return; }
    audio.currentTime = solo.start; audio.play().catch(() => {});
    tkRecUI(); tkMsg('Enregistrement en cours… touche « Arrêter » quand tu as fini.');
  }, 3000));
}
function tkCancelCount() { const r = TK.rec; if (!r) return; r.timers.forEach(clearTimeout); r.stream.getTracks().forEach(t => t.stop()); TK.rec = null; tkRecUI(); tkMsg('Enregistrement annulé.'); }
function tkStopRec() {
  const r = TK.rec; if (!r) return;
  if (r.state === 'count') { tkCancelCount(); return; }
  r.state = 'stop'; audio.pause(); cancelGap();
  try { r.mr.stop(); } catch { tkFinish(r); }
}
function tkWav(buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate, pcm = new Int16Array(n);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) { let v = 0; for (let c = 0; c < ch; c++) v += data[c][i]; v /= ch; pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff; }
  const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, sr, true); h.setUint32(28, sr * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length * 2, true);
  return new Blob([h, pcm], { type: 'audio/wav' });
}
async function tkFinish(rec) {
  rec.stream.getTracks().forEach(t => t.stop()); if (TK.rec === rec) TK.rec = null; tkRecUI();
  const raw = new Blob(rec.chunks, { type: TK.lastMime || 'audio/webm' });
  if (!raw.size) { tkMsg('Rien n’a été enregistré.'); return; }
  let blob = raw, mime = raw.type, duration = (performance.now() - (rec.t0 || performance.now())) / 1000;
  try {   // WAV : durée connue et lecture à position exacte sur tous les navigateurs (le webm du MediaRecorder n'a pas de durée)
    const ctx = tkCtx(), buf = await ctx.decodeAudioData(await raw.arrayBuffer());
    blob = tkWav(buf); mime = 'audio/wav'; duration = buf.duration;
  } catch {}
  const stored = tkGet(TK_LS.off, null), auto = stored !== null ? +stored : Math.round((((TK.ctx && TK.ctx.outputLatency) || 0) + ((TK.ctx && TK.ctx.baseLatency) || 0)) * 1000);
  const t = { id: 'tk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), songId: rec.songId, soloId: rec.solo.id, at: Date.now(), duration, mime, recMime: raw.type, blob,
    offsetMs: Math.max(-300, Math.min(800, Math.round(auto / 10) * 10)) || 0, volTake: 100, volSolo: 70, rate: rec.rate };
  try { await tkPut(t); } catch { tkMsg('Impossible d’enregistrer la prise (stockage plein ?).'); return; }
  const cs = curSolo(); if (cs && cs.id === rec.solo.id) { TK.list = (await tkForSolo(cs.id)).sort((a, b) => b.at - a.at); tkRender(); }
  tkMsg('Prise enregistrée.');
}

/* ---------- Écoute (prise seule / superposée) ---------- */
function tkCtx() {
  if (!TK.ctx) {
    TK.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (TK.ctx.state === 'suspended') TK.ctx.resume().catch(() => {});
  return TK.ctx;
}
function tkGraph() {
  const ctx = tkCtx();
  if (!TK.g) {
    TK.el = new Audio(); TK.el.preservesPitch = true; TK.el.mozPreservesPitch = true; TK.el.webkitPreservesPitch = true;
    const gTake = ctx.createGain(), gSolo = ctx.createGain();
    ctx.createMediaElementSource(TK.el).connect(gTake).connect(ctx.destination);
    ctx.createMediaElementSource(audio).connect(gSolo).connect(ctx.destination);   // iPhone : le volume d'un élément audio est sans effet, d'où les GainNode
    TK.g = { gTake, gSolo };
  }
  return TK.g;
}
const tkRecRate = t => Math.max(0.1, (t.rate || 100) / 100);
const tkTarget = (t, solo) => (audio.currentTime - solo.start) / tkRecRate(t) + t.offsetMs / 1000;   // position de la prise = position du solo + décalage
function tkRate(t) { TK.el.playbackRate = Math.max(0.0625, Math.min(16, (audio.playbackRate || 1) / tkRecRate(t))); }
function tkSync(force) {
  const c = TK.cur; if (!c || !c.mix) return;
  const target = tkTarget(c.t, c.solo), el = TK.el;
  if (target < 0) { if (!el.paused) el.pause(); return; }
  if (force || Math.abs(el.currentTime - target) > 0.04) { try { el.currentTime = target; } catch {} }
  if (!audio.paused && el.paused && target < (c.t.duration || 1e9)) el.play().catch(() => {});
}
function tkStop() {
  clearInterval(TK.timer); TK.timer = 0;
  if (TK.el) { TK.el.pause(); }
  if (TK.cur && TK.cur.mix) audio.pause();
  if (TK.g) { TK.g.gSolo.gain.value = 1; }
  while (TK.urls.length) URL.revokeObjectURL(TK.urls.pop());
  TK.cur = null; tkButtons();
}
function tkStopAll() { if (TK.rec) tkStopRec(); tkStop(); }
async function tkPlay(id, mix) {
  const t = TK.list.find(x => x.id === id), solo = curSolo(); if (!t || !solo) return;
  if (TK.cur && TK.cur.id === id && TK.cur.mix === mix) { tkStop(); return; }   // deuxième appui = arrêt
  if (TK.rec) return;
  tkStop(); cancelGap();
  const g = tkGraph(); tkCtx();
  g.gTake.gain.value = t.volTake / 100; g.gSolo.gain.value = mix ? t.volSolo / 100 : 0;
  const url = URL.createObjectURL(t.blob); TK.urls.push(url); TK.el.src = url;
  TK.cur = { id, mix, t, solo };
  audio.pause();
  applyRate(); tkRate(t);
  if (mix) {
    audio.currentTime = solo.start;
    await audio.play().catch(() => {});
    tkSync(true);
  } else { TK.el.currentTime = 0; TK.el.play().catch(() => {}); }
  TK.timer = setInterval(() => {
    if (!TK.cur) return;
    tkRate(t);
    if (TK.cur.mix) {
      if (!S.loop && audio.currentTime >= solo.end && !audio.paused) { tkStop(); return; }
      tkSync(false);
    } else if (TK.el.ended || TK.el.paused) tkStop();
  }, 250);
  TK.el.onended = () => { if (TK.cur && !TK.cur.mix) tkStop(); };
  tkButtons();
}
audio.addEventListener('seeked', () => { if (TK.cur && TK.cur.mix) tkSync(true); });
audio.addEventListener('play', () => { if (TK.cur && TK.cur.mix) tkSync(true); });
audio.addEventListener('pause', () => { if (TK.cur && TK.cur.mix && TK.el) TK.el.pause(); });

/* ---------- Calage automatique (essai : propose, n'applique jamais seul) ---------- */
function tkEnvelope(data, sr, t0, hop, n) {   // énergie par image (t0 et hop en secondes du fichier)
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, Math.floor((t0 + i * hop) * sr)), b = Math.min(data.length, Math.floor((t0 + (i + 1) * hop) * sr));
    let s = 0; for (let k = a; k < b; k++) s += data[k] * data[k];
    e[i] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  const o = new Float32Array(n);
  for (let i = 1; i < n; i++) o[i] = Math.max(0, Math.log(e[i] + 1e-4) - Math.log(e[i - 1] + 1e-4));
  let m = 0, v = 0; for (let i = 0; i < n; i++) m += o[i]; m /= n; for (let i = 0; i < n; i++) { o[i] -= m; v += o[i] * o[i]; } v = Math.sqrt(v / n) || 1;
  for (let i = 0; i < n; i++) o[i] /= v;
  return o;
}
async function tkAutoAlign(t) {
  const song = S.song, solo = curSolo(); if (!song || !solo) return null;
  const ctx = tkCtx(), songBlob = await idb('audio', 'readonly', s => s.get(song.id)); if (!songBlob) return null;
  const [sBuf, tBuf] = await Promise.all([ctx.decodeAudioData(await songBlob.arrayBuffer()), ctx.decodeAudioData(await t.blob.arrayBuffer())]);
  const rate = tkRecRate(t), wall = Math.min(tBuf.duration, (solo.end - solo.start) / rate), hop = 0.01, n = Math.floor(wall / hop);
  if (n < 200) return { weak: true };
  const mono = b => { const d = b.getChannelData(0); return d; };
  const takeEnv = tkEnvelope(mono(tBuf), tBuf.sampleRate, 0, hop, n);
  const soloEnv = tkEnvelope(mono(sBuf), sBuf.sampleRate, solo.start, hop * rate, n);
  const MAXL = 80; let best = -1e9, bestL = 0; const all = [];
  for (let L = -MAXL; L <= MAXL; L++) {
    let s = 0, c = 0; for (let i = 0; i < n; i++) { const j = i + L; if (j >= 0 && j < n) { s += takeEnv[j] * soloEnv[i]; c++; } }
    const v = c ? s / c : 0; all.push(v); if (v > best) { best = v; bestL = L; }
  }
  const mean = all.reduce((a, b) => a + b, 0) / all.length, sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length) || 1, z = (best - mean) / sd;
  return { offsetMs: bestL * 10, corr: best, z, weak: best < 0.15 || z < 5 };
}

/* ---------- Actions ---------- */
async function tkMount() {   // appelé quand la page « Détails du solo » est (re)dessinée
  const solo = curSolo(); if (!solo) return;
  if (TK.cur && TK.cur.solo.id !== solo.id) tkStop();
  try { TK.list = (await tkForSolo(solo.id)).sort((a, b) => b.at - a.at); } catch { TK.list = []; }
  tkRender(); tkRecUI(); tkMics();
  const sel = document.getElementById('tkMic'); if (sel) sel.onchange = () => tkSet(TK_LS.mic, sel.value);
}
function tkUpdate(t, patch) { Object.assign(t, patch); clearTimeout(t._save); t._save = setTimeout(() => { const { _save, ...rest } = t; tkPut(rest).catch(() => {}); }, 300); }
function tkApplyLive(t) {
  if (TK.cur && TK.cur.id === t.id && TK.g) { TK.g.gTake.gain.value = t.volTake / 100; TK.g.gSolo.gain.value = TK.cur.mix ? t.volSolo / 100 : 0; tkSync(true); }
}
document.addEventListener('input', e => {
  const r = e.target.closest && e.target.closest('input[data-tk]'); if (!r) return;
  const t = TK.list.find(x => x.id === r.dataset.id); if (!t) return;
  const k = r.dataset.tk, v = +r.value; tkUpdate(t, { [k]: v });
  if (k === 'offsetMs') { const lab = document.querySelector(`.tk-offv[data-id="${t.id}"]`); if (lab) lab.textContent = tkOffLabel(v); }
  else { const b = r.parentElement.querySelector('b'); if (b) b.textContent = v + ' %'; }
  tkApplyLive(t);
});
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-act^="tk-"]'); if (!b) return;
  const act = b.dataset.act, d = b.dataset, t = TK.list.find(x => x.id === d.id);
  if (act === 'tk-rec') tkRecord();
  else if (act === 'tk-play') tkPlay(d.id, !!d.mix);
  else if (act === 'tk-del') { if (t && confirm('Supprimer cette prise ?')) { if (TK.cur && TK.cur.id === t.id) tkStop(); await tkDelete(t.id); TK.list = TK.list.filter(x => x !== t); tkRender(); } }
  else if (act === 'tk-off' && t) {
    const v = Math.max(-300, Math.min(800, t.offsetMs + +d.d)); tkUpdate(t, { offsetMs: v });
    const rg = document.querySelector(`input[data-tk="offsetMs"][data-id="${t.id}"]`); if (rg) rg.value = v;
    const lab = document.querySelector(`.tk-offv[data-id="${t.id}"]`); if (lab) lab.textContent = tkOffLabel(v); tkApplyLive(t);
  }
  else if (act === 'tk-dflt') { const v = Math.max(-300, Math.min(800, (+tkGet(TK_LS.off, 0) || 0) + +d.d)); tkSet(TK_LS.off, String(v)); const l = document.getElementById('tkDflt'); if (l) l.textContent = tkOffLabel(v); }
  else if (act === 'tk-auto' && t) {
    const msg = document.querySelector(`.tk-auto[data-id="${t.id}"]`); if (!msg) return;
    msg.hidden = false; msg.textContent = 'Calcul…';
    let r = null; try { r = await tkAutoAlign(t); } catch {}
    if (!r || r.weak) { msg.textContent = 'Calage incertain : règle le décalage à l’oreille.'; return; }
    msg.innerHTML = `Décalage proposé : <b>${tkOffLabel(r.offsetMs)}</b> <button class="tk-b" data-act="tk-accept" data-id="${t.id}" data-v="${r.offsetMs}"><span>Appliquer</span></button> <button class="tk-b" data-act="tk-ignore" data-id="${t.id}"><span>Ignorer</span></button>`;
  }
  else if (act === 'tk-accept' && t) {
    const v = Math.max(-300, Math.min(800, +d.v)); tkUpdate(t, { offsetMs: v }); tkApplyLive(t);
    const rg = document.querySelector(`input[data-tk="offsetMs"][data-id="${t.id}"]`); if (rg) rg.value = v;
    const lab = document.querySelector(`.tk-offv[data-id="${t.id}"]`); if (lab) lab.textContent = tkOffLabel(v);
    const msg = document.querySelector(`.tk-auto[data-id="${t.id}"]`); if (msg) msg.hidden = true;
  }
  else if (act === 'tk-ignore') { const msg = document.querySelector(`.tk-auto[data-id="${d.id}"]`); if (msg) msg.hidden = true; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') tkStopAll(); });

const Takes = {
  html: takesHTML, mount: tkMount, stopAll: tkStopAll,
  async confirmDelete(soloId) {   // avant de supprimer un solo : propose de supprimer aussi ses prises
    let n = 0; try { n = (await tkForSolo(soloId)).length; } catch {}
    if (!n) return true;
    if (!confirm(`Ce solo a ${n} prise${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}. Les supprimer aussi ?`)) return false;
    tkStopAll(); await tkDeleteBy('soloId', soloId); return true;
  },
  async deleteSong(songId) { try { await tkDeleteBy('songId', songId); } catch {} },
  diag() {
    const c = TK.ctx; return { mime: TK.lastMime || tkMime(), mic: TK.micLabel || null, micChoisi: tkGet(TK_LS.mic, '') ? 'oui' : 'défaut', decalageCasque: +tkGet(TK_LS.off, 0) || 0,
      outputLatencyMs: c && c.outputLatency != null ? Math.round(c.outputLatency * 1000) : null, baseLatencyMs: c && c.baseLatency != null ? Math.round(c.baseLatency * 1000) : null,
      prises: TK.list.map(t => ({ duree: +t.duration.toFixed(1), decalageMs: t.offsetMs, volPrise: t.volTake, volSolo: t.volSolo, tempoPct: t.rate, mime: t.mime, mimeOrigine: t.recMime })) };
  },
};
