'use strict';
/* Solo Looper — repérer, isoler, boucler et ralentir des solos (sans changer la hauteur du son). */

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#ff7a59', '#2ec4b6', '#ffd166', '#8ac926', '#b388eb', '#ff8fab', '#4cc9f0', '#ff9f1c'];
const PEAK_STEP = 0.25;            // résolution des pics stockés (secondes)
const SLOT = 8;                    // largeur d'un petit rectangle + espace (px)
const BAR_W = 5;
const ZOOMS = [0.25, 0.5, 1, 2];   // secondes par rectangle
const STEPS = [1, 0.5, 0.1];       // pas de réglage fin (secondes)

/* ---------- Stockage (IndexedDB) ---------- */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('solo-looper', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('songs', { keyPath: 'id' }); r.result.createObjectStore('audio'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idb = (store, mode, fn) => new Promise((res, rej) => {
  const tx = db.transaction(store, mode);
  const req = fn(tx.objectStore(store));
  tx.oncomplete = () => res(req && req.result);
  tx.onerror = () => rej(tx.error);
});
const saveSongNow = song => idb('songs', 'readwrite', s => s.put(song));
let saveTimer;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => S.song && saveSongNow(S.song), 300); }

/* ---------- État ---------- */
const S = {
  songs: [], tab: 'songs', song: null, soloId: null,
  loop: true, tempo: 100, zoom: 1, step: 1,
  onlyFav: false, instr: '',
};
const audio = new Audio();
audio.preload = 'auto';
let objectUrl = null, raf = 0, touching = false, wakeLock = null;
const spb = () => ZOOMS[S.zoom];
const curSolo = () => S.song && S.song.solos.find(s => s.id === S.soloId);

/* ---------- Utilitaires ---------- */
function fmt(t, dec = false) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return dec ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}
let toastT;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Analyse audio : durée + niveaux pour les petits rectangles ---------- */
async function analyze(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const chans = [...Array(Math.min(2, buf.numberOfChannels))].map((_, i) => buf.getChannelData(i));
    const win = Math.max(1, Math.floor(buf.sampleRate * PEAK_STEP));
    const n = Math.ceil(buf.length / win), vals = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, c = 0;
      const end = Math.min(buf.length, (i + 1) * win);
      for (let j = i * win; j < end; j += 8) { for (const ch of chans) { sum += ch[j] * ch[j]; c++; } }
      vals[i] = c ? Math.sqrt(sum / c) : 0;
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
    return { duration: buf.duration, peaks: vals.map(v => Math.round(Math.min(1, v / ref) * 100) / 100) };
  } finally { ctx.close(); }
}

async function importFiles(files) {
  for (const file of files) {
    toast(`Analyse de « ${file.name} »…`);
    try {
      const { duration, peaks } = await analyze(file);
      const song = { id: uid(), title: file.name.replace(/\.[^.]+$/, ''), duration, peaks, solos: [], added: Date.now() };
      await idb('audio', 'readwrite', s => s.put(file, song.id));
      await saveSongNow(song);
      S.songs.push(song);
    } catch (e) {
      console.error(e); toast(`Impossible de lire « ${file.name} »`);
    }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render();
  toast('Morceau ajouté ✔');
}

/* ---------- Navigation / rendu ---------- */
function render() {
  const inSong = !!S.song;
  $('#backBtn').hidden = !inSong;
  $('#tabs').hidden = inSong;
  $('#topAction').hidden = inSong;
  $('#title').textContent = inSong ? S.song.title : 'Solo Looper';
  inSong ? renderSong() : renderLibrary();
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
}

function songChips(song, onlyFav) {
  return song.solos.filter(s => !onlyFav || s.fav).map(s =>
    `<button class="chip" data-act="open-solo" data-song="${song.id}" data-solo="${s.id}"><i style="background:${s.color}"></i>${esc(s.name)}${s.fav ? ' ★' : ''}</button>`).join('');
}

function renderLibrary() {
  const c = $('#content');
  if (!S.songs.length) {
    c.innerHTML = `<div class="empty"><div class="big">🎶</div><p>Aucun morceau pour l'instant.<br>Ajoute un fichier audio de ton téléphone pour commencer à découper des solos.</p><button class="cta" data-act="add-song">＋ Ajouter un morceau</button></div>`;
    return;
  }
  if (S.tab === 'songs') {
    const songs = [...S.songs].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    c.innerHTML = `<div class="filters"><button class="chip ${S.onlyFav ? 'on' : ''}" data-act="fav-filter">★ Favoris</button></div>` +
      songs.filter(sg => !S.onlyFav || sg.solos.some(s => s.fav)).map(sg => `
      <div class="song">
        <div class="song-head">
          <button class="song-open" data-act="open-song" data-song="${sg.id}"><b>${esc(sg.title)}</b><small>${fmt(sg.duration)} · ${sg.solos.length} solo${sg.solos.length > 1 ? 's' : ''}</small></button>
          <button class="icon-btn" data-act="del-song" data-song="${sg.id}" aria-label="Supprimer">🗑</button>
        </div>
        ${sg.solos.length ? `<div class="chips">${songChips(sg, S.onlyFav)}</div>` : ''}
      </div>`).join('');
  } else {
    const all = S.songs.flatMap(sg => sg.solos.map(s => ({ sg, s })));
    const instrs = [...new Set(all.map(x => x.s.instrument).filter(Boolean))].sort();
    const list = all.filter(({ s }) => (!S.onlyFav || s.fav) && (!S.instr || s.instrument === S.instr));
    c.innerHTML = `<div class="filters"><button class="chip ${S.onlyFav ? 'on' : ''}" data-act="fav-filter">★ Favoris</button>` +
      instrs.map(i => `<button class="chip ${S.instr === i ? 'on' : ''}" data-act="instr-filter" data-instr="${esc(i)}">${esc(i)}</button>`).join('') + `</div>` +
      (list.length ? `<div class="panel">` + list.map(({ sg, s }) => `
        <div class="solo"><button class="pick" data-act="open-solo" data-song="${sg.id}" data-solo="${s.id}"><i class="dot" style="background:${s.color}"></i><span><b>${esc(s.name)}${s.instrument ? ' · ' + esc(s.instrument) : ''}</b><small>${esc(sg.title)} · ${fmt(s.start)}–${fmt(s.end)}</small></span></button>
        <button class="star ${s.fav ? 'on' : ''}" data-act="star-lib" data-song="${sg.id}" data-solo="${s.id}">${s.fav ? '★' : '☆'}</button></div>`).join('') + `</div>`
        : `<div class="empty"><p>Aucun solo ici.<br>Ouvre un morceau et crée tes solos avec « Nouveau solo ».</p></div>`);
  }
}

/* ---------- Vue morceau ---------- */
function renderSong() {
  const c = $('#content');
  c.innerHTML = `
  <section class="player">
    <div class="tl-scroll" id="tlScroll"><div class="tl-inner" id="tlInner"><canvas id="tl"></canvas><div class="playhead" id="playhead"></div></div></div>
    <div class="tl-tools"><span id="timeLbl"></span><button data-act="zoom" data-d="1" aria-label="Dézoomer">－</button><button data-act="zoom" data-d="-1" aria-label="Zoomer">＋</button></div>
    <div class="transport">
      <button data-act="seek" data-d="-5">⏪ 5 s</button>
      <button class="big" id="playBtn" data-act="play">▶</button>
      <button data-act="seek" data-d="5">5 s ⏩</button>
      <button class="toggle" id="loopBtn" data-act="loop" aria-label="Boucle">🔁</button>
    </div>
    <div class="tempo">
      <button data-act="tempo" data-d="-5">−</button>
      <input type="range" id="tempoRange" min="40" max="120" step="1" aria-label="Tempo">
      <button data-act="tempo" data-d="5">+</button>
      <b id="tempoLbl"></b>
    </div>
    <div class="presets">${[50, 60, 70, 80, 90, 100].map(v => `<button data-act="preset" data-v="${v}">${v}</button>`).join('')}</div>
  </section>
  <section class="panel" id="soloPanel"></section>`;
  const sc = $('#tlScroll');
  sc.addEventListener('touchstart', () => touching = true, { passive: true });
  sc.addEventListener('touchend', () => setTimeout(() => touching = false, 1500), { passive: true });
  $('#tlInner').addEventListener('click', e => {
    const x = e.clientX - $('#tlInner').getBoundingClientRect().left;
    audio.currentTime = Math.min(S.song.duration, Math.max(0, x / SLOT * spb()));
    updatePlayhead();
  });
  $('#tempoRange').addEventListener('input', e => setTempo(+e.target.value));
  drawTimeline(); renderPanel(); updateTransport(); updatePlayhead(true);
}

function drawTimeline() {
  const cv = $('#tl'); if (!cv) return;
  const song = S.song, dur = song.duration, per = spb();
  const nBars = Math.ceil(dur / per), W = nBars * SLOT, H = 104, LBL = 16;
  const inner = $('#tlInner'); inner.style.width = W + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 16000 / W);
  cv.width = Math.ceil(W * dpr); cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const solos = song.solos, act = curSolo();
  // fond du solo sélectionné
  if (act) {
    g.fillStyle = act.color + '33';
    g.fillRect(act.start / per * SLOT, 0, (act.end - act.start) / per * SLOT, H);
    g.fillStyle = act.color;
    g.fillRect(act.start / per * SLOT - 1, 0, 3, H); g.fillRect(act.end / per * SLOT - 2, 0, 3, H);
  }
  const mid = (H - LBL) / 2, maxH = H - LBL - 12, per2 = PEAK_STEP;
  for (let i = 0; i < nBars; i++) {
    const t0 = i * per, t1 = t0 + per;
    let p = 0;
    for (let k = Math.floor(t0 / per2); k < Math.max(Math.floor(t0 / per2) + 1, Math.ceil(t1 / per2)); k++) p = Math.max(p, song.peaks[k] || 0);
    const h = Math.max(4, p * maxH), tm = t0 + per / 2;
    const inSolo = solos.find(s => tm >= s.start && tm <= s.end);
    g.fillStyle = inSolo ? (inSolo === act ? inSolo.color : inSolo.color + 'aa') : '#5a6272';
    const x = i * SLOT + (SLOT - BAR_W) / 2, y = mid - h / 2;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, BAR_W, h, 2) : g.rect(x, y, BAR_W, h); g.fill();
  }
  // repères de temps
  const stepS = [5, 10, 15, 30, 60, 120, 300].find(s => s / per * SLOT >= 56) || 300;
  g.fillStyle = '#98a0ae'; g.font = '11px system-ui'; g.textBaseline = 'bottom';
  for (let t = 0; t < dur; t += stepS) g.fillText(fmt(t), t / per * SLOT + 3, H - 2);
}

function renderPanel() {
  const p = $('#soloPanel'); if (!p) return;
  const song = S.song, act = curSolo();
  const list = song.solos.filter(s => !S.onlyFav || s.fav).sort((a, b) => a.start - b.start);
  let h = '';
  if (act) {
    h += `<div class="editor">
      <input class="txt" id="soloName" value="${esc(act.name)}" placeholder="Nom du solo" aria-label="Nom du solo">
      <input class="txt" id="soloInstr" list="instrs" value="${esc(act.instrument)}" placeholder="Instrument (flûte, sax…)" aria-label="Instrument">
      ${['start', 'end'].map(w => `<div class="edrow"><span class="lbl">${w === 'start' ? 'Début' : 'Fin'}</span><b>${fmt(act[w], true)}</b>
        <button data-act="nudge" data-w="${w}" data-d="-1">−</button><button data-act="nudge" data-w="${w}" data-d="1">+</button>
        <button class="here" data-act="here" data-w="${w}">⌖ ici</button></div>`).join('')}
      <div class="edrow2"><button data-act="step">Pas : ${S.step} s</button><button class="danger" data-act="solo-del">🗑 Supprimer</button></div>
    </div>`;
  }
  h += `<button class="newsolo" data-act="solo-new">＋ Nouveau solo à partir d'ici</button>
    <h2>Solos de ce morceau <button class="chip ${S.onlyFav ? 'on' : ''}" style="min-height:36px;float:right" data-act="fav-filter">★</button></h2>`;
  h += list.length ? list.map(s => `<div class="solo ${s.id === S.soloId ? 'sel' : ''}">
      <button class="pick" data-act="solo-pick" data-solo="${s.id}"><i class="dot" style="background:${s.color}"></i><span><b>${esc(s.name)}${s.instrument ? ' · ' + esc(s.instrument) : ''}</b><small>${fmt(s.start)} – ${fmt(s.end)} · ${s.tempo}%</small></span></button>
      <button class="star ${s.fav ? 'on' : ''}" data-act="star" data-solo="${s.id}" aria-label="Favori">${s.fav ? '★' : '☆'}</button>
    </div>`).join('') : `<p class="hint">${song.solos.length ? 'Aucun favori.' : 'Écoute le morceau, puis appuie sur « Nouveau solo » quand un solo commence.'}</p>`;
  p.innerHTML = h;
  const n = $('#soloName'), i = $('#soloInstr');
  if (n) n.addEventListener('input', () => { act.name = n.value; saveSoon(); const b = document.querySelector(`.solo.sel .pick b`); if (b) b.textContent = act.name + (act.instrument ? ' · ' + act.instrument : ''); });
  if (i) i.addEventListener('input', () => { act.instrument = i.value; saveSoon(); });
}

/* ---------- Lecture ---------- */
function updateTransport() {
  const pb = $('#playBtn'); if (!pb) return;
  pb.textContent = audio.paused ? '▶' : '⏸';
  $('#loopBtn').classList.toggle('on', S.loop);
  $('#tempoRange').value = S.tempo; $('#tempoLbl').textContent = S.tempo + '%';
  document.querySelectorAll('.presets button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.tempo));
}
function updatePlayhead(forceScroll) {
  const ph = $('#playhead'); if (!ph) return;
  const x = audio.currentTime / spb() * SLOT;
  ph.style.transform = `translateX(${x}px)`;
  $('#timeLbl').textContent = `${fmt(audio.currentTime)} / ${fmt(S.song.duration)}`;
  const sc = $('#tlScroll');
  if (forceScroll || ((!audio.paused) && !touching)) {
    if (forceScroll || x < sc.scrollLeft + 24 || x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.3);
  }
}
function tick() {
  const r = S.loop && curSolo(), t = audio.currentTime;
  if (r && !audio.paused && t >= r.end && t < r.end + 0.6) audio.currentTime = r.start;
  updatePlayhead();
  raf = requestAnimationFrame(tick);
}
function setPlaying(on) {
  cancelAnimationFrame(raf);
  if (on) { raf = requestAnimationFrame(tick); requestWake(); } else releaseWake();
  updateTransport();
}
async function requestWake() { try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch {} }
function releaseWake() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }
audio.addEventListener('play', () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('seeked', () => S.song && updatePlayhead());
audio.addEventListener('ended', () => {
  const r = S.loop && curSolo();
  if (r) { audio.currentTime = r.start; audio.play(); } else setPlaying(false);
});
function applyRate() {
  audio.playbackRate = S.tempo / 100;
  audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true; // tempo sans changer la hauteur
}
function setTempo(v) {
  S.tempo = Math.max(40, Math.min(120, Math.round(v)));
  applyRate();
  const s = curSolo(); if (s) { s.tempo = S.tempo; saveSoon(); renderPanel(); }
  updateTransport();
}
function play() { audio.paused ? audio.play().catch(() => {}) : audio.pause(); }

async function openSong(id, soloId) {
  const song = S.songs.find(s => s.id === id); if (!song) return;
  const blob = await idb('audio', 'readonly', s => s.get(id));
  if (!blob) { toast('Fichier audio introuvable'); return; }
  audio.pause();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  S.song = song; S.soloId = null; S.onlyFav = false;
  applyRate();
  render();
  if (soloId) pickSolo(soloId, true);
}
function closeSong() {
  audio.pause(); S.song && saveSongNow(S.song);
  S.song = null; S.soloId = null; S.onlyFav = false;
  render();
}
function pickSolo(id, autoplay) {
  const s = S.song.solos.find(x => x.id === id); if (!s) return;
  S.soloId = id; S.tempo = s.tempo || 100; applyRate();
  audio.currentTime = s.start;
  drawTimeline(); renderPanel(); updateTransport(); updatePlayhead(true);
  if (autoplay) audio.play().catch(() => {});
}
function newSolo() {
  const song = S.song, t = audio.currentTime;
  const start = Math.min(t, Math.max(0, song.duration - 2));
  const solo = {
    id: uid(), name: `Solo ${song.solos.length + 1}`, instrument: song.solos.length ? song.solos[song.solos.length - 1].instrument : '',
    start, end: Math.min(song.duration, start + 20), tempo: S.tempo, fav: false, color: COLORS[song.solos.length % COLORS.length],
  };
  song.solos.push(solo); saveSoon();
  pickSolo(solo.id, false);
  toast('Solo créé : place la fin avec « ⌖ ici »');
}
function editEdge(w, newT) {
  const s = curSolo(); if (!s) return;
  const dur = S.song.duration;
  if (w === 'start') s.start = Math.max(0, Math.min(newT, s.end - 0.5));
  else s.end = Math.min(dur, Math.max(newT, s.start + 0.5));
  s.start = Math.round(s.start * 10) / 10; s.end = Math.round(s.end * 10) / 10;
  saveSoon();
  audio.currentTime = w === 'start' ? s.start : Math.max(s.start, s.end - 2);  // on réécoute le bord modifié
  drawTimeline(); renderPanel(); updatePlayhead(true);
}

/* ---------- Actions (délégation des clics) ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, s = curSolo();
  switch (d.act) {
    case 'add-song': $('#fileInput').click(); break;
    case 'back': closeSong(); break;
    case 'tab': S.tab = d.tab; render(); break;
    case 'fav-filter': S.onlyFav = !S.onlyFav; S.song ? renderPanel() : render(); break;
    case 'instr-filter': S.instr = S.instr === d.instr ? '' : d.instr; render(); break;
    case 'open-song': openSong(d.song); break;
    case 'open-solo': openSong(d.song, d.solo); break;
    case 'del-song':
      if (confirm('Supprimer ce morceau et tous ses solos ?')) {
        await idb('songs', 'readwrite', st => st.delete(d.song)); await idb('audio', 'readwrite', st => st.delete(d.song));
        S.songs = S.songs.filter(x => x.id !== d.song); render();
      } break;
    case 'star-lib': { const sg = S.songs.find(x => x.id === d.song), so = sg.solos.find(x => x.id === d.solo); so.fav = !so.fav; saveSongNow(sg); render(); break; }
    case 'star': { const so = S.song.solos.find(x => x.id === d.solo); so.fav = !so.fav; saveSoon(); renderPanel(); break; }
    case 'play': play(); break;
    case 'seek': audio.currentTime = Math.max(0, Math.min(S.song.duration, audio.currentTime + +d.d)); updatePlayhead(); break;
    case 'loop': S.loop = !S.loop; updateTransport(); break;
    case 'tempo': setTempo(S.tempo + +d.d); break;
    case 'preset': setTempo(+d.v); break;
    case 'zoom': S.zoom = Math.max(0, Math.min(ZOOMS.length - 1, S.zoom + +d.d)); drawTimeline(); updatePlayhead(true); break;
    case 'solo-pick':
      if (S.soloId === d.solo) { play(); } else pickSolo(d.solo, true);
      break;
    case 'solo-new': newSolo(); break;
    case 'solo-del':
      if (s && confirm(`Supprimer « ${s.name} » ?`)) { S.song.solos = S.song.solos.filter(x => x !== s); S.soloId = null; saveSoon(); drawTimeline(); renderPanel(); }
      break;
    case 'here': if (s) editEdge(d.w, audio.currentTime); break;
    case 'nudge': if (s) editEdge(d.w, s[d.w] + +d.d * S.step); break;
    case 'step': S.step = STEPS[(STEPS.indexOf(S.step) + 1) % STEPS.length]; renderPanel(); break;
  }
});
$('#fileInput').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) importFiles(f); });
window.addEventListener('beforeunload', () => S.song && saveSongNow(S.song));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !audio.paused) requestWake(); });

/* ---------- Démarrage ---------- */
(async function init() {
  db = await openDB();
  S.songs = (await idb('songs', 'readonly', s => s.getAll())) || [];
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
