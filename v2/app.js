'use strict';
/* Solo Looper — repérer, isoler, boucler et ralentir des solos (sans changer la hauteur du son). */

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#1f6feb'];       // thème sobre : tout en bleu (le champ color reste stocké)
const PEAK_STEP = 0.25;            // résolution des pics stockés (secondes)
const SLOT0 = 6, BAR0 = 2.43;      // pas et largeur d'un bâtonnet au zoom normal (px)
const ZOOMS = [0.4, 0.6, 1, 1.6, 2.5, 4];   // facteur d'espacement : « − » rapproche les bâtonnets, « + » les écarte
const slot = () => SLOT0 * ZOOMS[S.zoom], barW = () => Math.max(1, Math.min(BAR0 * ZOOMS[S.zoom], slot() - 1));
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
  loop: true, tempo: 100, zoom: 2, step: 1, gap: 0, ramp: false, passes: 0, waiting: false,
  onlyFav: false, instr: '', status: null, exp: new Set(), openId: null, sort: (() => { try { return localStorage.getItem('sl-sort') === 'new' ? 'new' : 'alpha'; } catch { return 'alpha'; } })(),   // openId : solo dont les options sont dépliées
};
S.full = (() => { try { return localStorage.getItem('sl-full') !== '0'; } catch { return true; } })();   // lecteur complet ou allégé
/* Icônes dessinées en trait fin (épaisseur commune). Les symboles ▶ ⏸ ⏹ ⬆ ⬇ en texte deviennent des emojis colorés sur Android. */
const svgI = (p, s = 24) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  play: svgI('<path d="M8.5 5.5v13l10.5-6.5z"/>', 28),
  trash: svgI('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12h9.4l.8-12M10 11v5M14 11v5"/>', 24),
  pause: svgI('<path d="M9 6v12M15 6v12"/>', 28),
  stop: svgI('<rect x="7" y="7" width="10" height="10" rx="1.5"/>', 22),
  chev: svgI('<path d="M6 9l6 6 6-6"/>', 24),
  chevUp: svgI('<path d="M6 15l6-6 6 6"/>', 24),
  pencil: svgI('<path d="M4.5 19.5l.8-3.6L16.2 5a2 2 0 0 1 2.8 2.8L8.1 18.7zM14.5 6.8l2.7 2.7"/>', 24),
  loop: svgI('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>', 26),
  reset: svgI('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>', 18),
  back: svgI('<path d="M19 12H5M11 6l-6 6 6 6"/>', 26),
  close: svgI('<path d="M6 6l12 12M18 6L6 18"/>', 22),
  plus: svgI('<path d="M12 5v14M5 12h14"/>', 20),
  minus: svgI('<path d="M5 12h14"/>', 20),
  target: svgI('<circle cx="12" cy="12" r="5.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>', 18),
  up: svgI('<path d="M12 19V5M6 11l6-6 6 6"/>', 18),
  down: svgI('<path d="M12 5v14M6 13l6 6 6-6"/>', 18),
  rew: svgI('<path d="M12 6l-6 6 6 6M19 6l-6 6 6 6"/>', 26),
  fwd: svgI('<path d="M12 6l6 6-6 6M5 6l6 6-6 6"/>', 26),
  reanalyze: svgI('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/><circle cx="10.6" cy="15" r="1.6"/><path d="M12.2 15V9.4l2.6 1.1"/>', 26),
  star: on => svgI('<path d="M12 4.2l2.4 5 5.4.7-4 3.8 1 5.4L12 16.5l-4.8 2.6 1-5.4-4-3.8 5.4-.7z"' + (on ? ' fill="currentColor"' : '') + '/>', 24),
};
/* « + » ou « − » entouré de petits tirets, comme un chrono */
function chronoIcon(sign) {
  let t = '';
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); t += `<line x1="${(16 + s * 11.6).toFixed(1)}" y1="${(16 - c * 11.6).toFixed(1)}" x2="${(16 + s * 14.6).toFixed(1)}" y2="${(16 - c * 14.6).toFixed(1)}"/>`; }
  const mid = '<line x1="10.5" y1="16" x2="21.5" y2="16"/>' + (sign === '+' ? '<line x1="16" y1="10.5" x2="16" y2="21.5"/>' : '');
  return `<svg class="ic" viewBox="0 0 32 32" width="36" height="36" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${t}${mid}</g></svg>`;
}
const audio = new Audio();
audio.preload = 'auto';
let objectUrl = null, raf = 0, wakeLock = null;
const spb = () => 0.5;   // secondes par bâtonnet (fixe : c'est l'espacement qui varie avec le zoom)
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
      let tags = null; try { tags = await readTags(file); } catch (e) { console.warn('étiquettes illisibles', e); }
      const song = { id: uid(), title: (tags && tags.title) || Meta.cleanName(file.name).title || file.name.replace(/\.[^.]+$/, ''), file: file.name, duration, peaks, solos: [], added: Date.now(), tagsRead: true };
      if (tags) {
        song.tags = { title: tags.title, artist: tags.artist, album: tags.album, hasCover: !!tags.coverBytes };
        song.artist = tags.artist; song.album = tags.album;
        if (tags.coverBytes) song.cover = await coverToDataUrl(tags.coverBytes, tags.coverMime);
      }
      await idb('audio', 'readwrite', s => s.put(file, song.id));
      await saveSongNow(song);
      S.songs.push(song);
    } catch (e) {
      console.error(e); toast(`Impossible de lire « ${file.name} »`);
    }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render();
  toast('Morceau ajouté');
}

/* ---------- Navigation / rendu ---------- */
/* En-tête du morceau : pochette, titre, artiste · album ; le crayon à droite ouvre la modification. */
function updateHeader() {
  const song = S.song, t = $('#title');
  t.classList.toggle('is-song', !!song);
  if (!song) { t.textContent = 'Loops'; return; }
  const sub = [song.artist, song.album].filter(Boolean).join(' · ');
  t.innerHTML = `<span class="hd">${song.cover ? `<img class="hd-cover" src="${esc(song.cover)}" alt="Pochette" onerror="this.outerHTML='<span class=&quot;hd-cover ph&quot;>♪</span>'">` : '<span class="hd-cover ph">♪</span>'}<span class="hd-t"><b>${esc(song.title || 'Sans titre')}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></span>`;
}
function render() {
  const inSong = !!S.song;
  $('#backBtn').hidden = !inSong;
  $('#tabs').hidden = inSong;
  ['#btnImport', '#btnExport', '#btnFilter'].forEach(id => { $(id).hidden = inSong; });
  const nf = (S.onlyFav ? 1 : 0) + (S.instr ? 1 : 0) + (S.status !== null ? 1 : 0); $('#btnFilter .fdot').hidden = !nf; $('#btnFilter').setAttribute('aria-expanded', String(!!S.showFilters));
  $('#editBtn').hidden = !inSong;
  updateHeader();
  inSong ? renderSong() : renderLibrary();
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
}

/* Onglet Solos : lecture sur place (sans ouvrir le morceau) */
S.lib = null; let libSongId = null;
const libOn = id => !!(S.lib && S.lib.soloId === id && !audio.paused);
function syncLibPlay() {
  document.querySelectorAll('.list.lib .solo-play').forEach(b => { const on = libOn(b.dataset.solo); b.classList.toggle('on', on); b.innerHTML = on ? IC.pause : IC.play; const c = b.closest('.solo'); if (c) c.classList.toggle('sel', !!(S.lib && S.lib.soloId === b.dataset.solo)); });
}
function libStop() { if (S.lib) { audio.pause(); S.lib = null; } }
async function libPlay(songId, soloId) {
  const sg = S.songs.find(x => x.id === songId), so = sg && sg.solos.find(x => x.id === soloId); if (!so) return;
  if (S.lib && S.lib.soloId === soloId) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
  if (libSongId !== songId || !S.lib) {
    const blob = await idb('audio', 'readonly', st => st.get(songId));
    if (!blob) { toast('Fichier audio introuvable'); return; }
    audio.pause(); if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob); audio.src = objectUrl; libSongId = songId;
  }
  S.lib = { songId, soloId, start: so.start, end: so.end }; S.tempo = so.tempo || 100; applyRate();
  const go = () => { audio.currentTime = so.start; audio.play().catch(() => {}); };
  audio.readyState >= 1 ? go() : audio.addEventListener('loadedmetadata', go, { once: true });
  syncLibPlay();
}
/* Statut de travail d'un solo : '' (non renseigné) → à travailler → en cours → validé */
const STATUS = { '': 'Non renseigné', todo: 'À travailler', doing: 'En cours', done: 'Validé' }, STATUS_NEXT = { '': 'todo', todo: 'doing', doing: 'done', done: '' };
const statBtn = (so, act, extra = '') => `<button class="stat" data-act="${act}" ${extra} data-solo="${so.id}" aria-label="Statut : ${STATUS[so.status || '']} (toucher pour changer)"><i class="st-${so.status || 'none'}"></i></button>`;
const bySoloOrder = (a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || a.start - b.start;   // ordre choisi à la main (champ « ord », ajouté), sinon par début
function songChips(song, onlyFav) {
  return song.solos.filter(s => !onlyFav || s.fav).map(s =>
    `<button class="chip" data-act="open-solo" data-song="${song.id}" data-solo="${s.id}"><i></i>${esc(s.name)}${s.fav ? ' ' + IC.star(true) : ''}</button>`).join('');
}

function renderLibrary() {
  const c = $('#content');
  if (!S.songs.length) {
    c.innerHTML = `<div class="empty"><div class="big">♪</div><p>Aucun morceau pour l'instant.<br>Ajoute un fichier audio de ton téléphone pour commencer à découper des solos.</p><button class="cta" data-act="add-song">＋ Ajouter un morceau</button></div>`;
    return;
  }
  const all = S.songs.flatMap(sg => sg.solos.map(s => ({ sg, s })));
  const instrs = [...new Set(all.map(x => x.s.instrument).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  if (S.instr && !instrs.includes(S.instr)) S.instr = '';
  const filtering = S.onlyFav || !!S.instr || S.status !== null;
  const songs = [...S.songs].sort(S.sort === 'new' ? (x, y) => (x.added || 0) - (y.added || 0) : (x, y) => (x.title || '').localeCompare(y.title || '', 'fr'));
  const groups = songs.map(sg => ({ sg, list: sg.solos.filter(s => (!S.onlyFav || s.fav) && (!S.instr || s.instrument === S.instr) && (S.status === null || (s.status || '') === S.status)).sort(bySoloOrder) })).filter(g => !filtering || g.list.length);
  const soloCard = (sg, s) => `
        <div class="swrap"><button class="swipe-del" data-act="lib-del" data-song="${sg.id}" data-solo="${s.id}" aria-label="Supprimer ce solo">${IC.trash}</button>
        <div class="solo acc${libOn(s.id) ? ' sel' : ''}">
          <div class="solo-head">
            <button class="solo-play${libOn(s.id) ? ' on' : ''}" data-act="lib-play" data-song="${sg.id}" data-solo="${s.id}" aria-label="Jouer ce solo">${libOn(s.id) ? IC.pause : IC.play}</button>
            <button class="pick" data-act="lib-play" data-song="${sg.id}" data-solo="${s.id}"><span><b>${esc(s.name)}${s.instrument ? ' · ' + esc(s.instrument) : ''}</b><small>${fmt(s.start)} – ${fmt(s.end)} · ${s.tempo}%${s.soloist ? ' · ' + esc(s.soloist) : ''}</small></span></button>
            ${statBtn(s, 'lib-status', `data-song="${sg.id}"`)}
            <button class="star ${s.fav ? 'on' : ''}" data-act="star-lib" data-song="${sg.id}" data-solo="${s.id}" aria-label="Favori">${IC.star(s.fav)}</button>
            <button class="icon-sm" data-act="lib-details" data-song="${sg.id}" data-solo="${s.id}" aria-label="Détails du solo">${PENCIL}</button>
          </div></div></div>`;
  // un morceau = sa carte (pochette, titre, détails) au-dessus de ses solos ; balayer la carte emporte tout le bloc (corbeille sur fond violet sur toute la hauteur)
  const songCard = (sg, open) => `
      <div class="grp-head"><button class="grp-open" data-act="open-song" data-song="${sg.id}">
        ${sg.cover ? `<img class="grp-cover" src="${esc(sg.cover)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;grp-cover ph&quot;>♪</span>'">` : '<span class="grp-cover ph">♪</span>'}
        <span class="grp-t"><b>${esc(sg.title || 'Sans titre')}</b><small>${[sg.artist, sg.album].filter(Boolean).map(esc).join(' · ')}${sg.artist || sg.album ? ' · ' : ''}${fmt(sg.duration)} · ${sg.solos.length} solo${sg.solos.length > 1 ? 's' : ''}</small></span></button>
        <button class="grp-chev" data-act="grp-toggle" data-song="${sg.id}" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'} les solos">${open ? IC.chevUp : IC.chev}</button></div>`;
  c.innerHTML = `<div class="list lib">
      <div class="filter-panel"${S.showFilters ? '' : ' hidden'}>
      ${instrs.length ? `<div class="filters row-instr">` + instrs.map(i => `<button class="chip ${S.instr === i ? 'on' : ''}" data-act="instr-filter" data-instr="${esc(i)}">${esc(i)}</button>`).join('') + `</div>` : ''}
      <div class="filters"><button class="chip ${S.onlyFav ? 'on' : ''}" data-act="fav-filter">${IC.star(S.onlyFav)} Favoris</button><button class="chip ${S.sort === 'alpha' ? 'on' : ''}" data-act="sort" data-sort="alpha">A – Z</button><button class="chip ${S.sort === 'new' ? 'on' : ''}" data-act="sort" data-sort="new">Arrivée</button></div>
      <div class="filters row-status">` + Object.entries(STATUS).map(([k, v]) => `<button class="chip ${S.status === k ? 'on' : ''}" data-act="status-filter" data-status="${k}"><i class="st-dot st-${k || 'none'}"></i>${v}</button>`).join('') + `</div></div>` +
      (groups.length ? groups.map(({ sg, list }) => { const open = filtering || S.exp.has(sg.id); return `<div class="grp-wrap"><button class="grp-del" data-act="del-song" data-song="${sg.id}" aria-label="Supprimer ce morceau et ses solos">${IC.trash}</button><div class="grp-inner">${songCard(sg, open)}${open ? `<div class="grp-solos">${list.map(s => soloCard(sg, s)).join('')}</div>` : ''}</div></div>`; }).join('')
        : `<div class="empty"><p>Aucun solo ici.</p></div>`) + `</div><button class="fab fab-r" data-act="add-song" aria-label="Importer un morceau" title="Importer un morceau">${IC.plus}</button>`;
}

/* ---------- Vue morceau ---------- */
function renderSong() {
  const c = $('#content');
  c.innerHTML = playerHTML() + `<section class="list" id="soloPanel"></section>
    <button class="fab fab-r" data-act="solo-new" aria-label="Nouveau solo à partir d’ici">${IC.plus}</button>`;
  mountPlayer($('.player'));
  drawTimeline(); renderPanel(); updateTransport(); updatePlayhead(true);
}

/* Lecteur, sur la page du morceau et dans les détails du solo :
   réduit = bande du son, boucle / reculer / lecture / avancer, tempo ; complet = + temps, zoom, début / fin du solo, pas, montée progressive */
function playerHTML() {
  return `<section class="player${S.full ? ' full' : ''}">
    <div class="tlbox">${timelineTools()}${timelineHTML()}</div>
    <div class="pl-ctl">
      <button class="pl-loop" data-act="loop" aria-label="Boucle">${IC.loop}</button>
      <button class="pl-seek" data-act="seek-hold" data-d="-1" aria-label="Reculer d’une demi-seconde (appui long : 1, 3, 5 puis 10 secondes)">${IC.rew}</button>
      <button class="pl-play" data-act="play" aria-label="Lecture"></button>
      <button class="pl-seek" data-act="seek-hold" data-d="1" aria-label="Avancer d’une demi-seconde (appui long : 1, 3, 5 puis 10 secondes)">${IC.fwd}</button>
      <button class="pl-expand" data-act="player-full" aria-expanded="${S.full}" aria-label="Plus de réglages">${IC.chevUp}</button>
    </div>
    <div class="pl-tempo-row">
      <button class="pl-sq" data-act="tempo" data-d="-5" aria-label="Tempo moins 5 pour cent">${IC.minus}</button>
      <div class="pl-slider"><button class="pl-tlbl" data-act="tempo-reset" aria-label="Tempo : toucher pour revenir à 100 %"></button>
        <input class="pl-tempo" type="range" min="30" max="150" step="10" aria-label="Tempo, de dix en dix"></div>
      <button class="pl-sq" data-act="tempo" data-d="5" aria-label="Tempo plus 5 pour cent">${IC.plus}</button>
      <button class="pl-sq pl-gap" data-act="gap" aria-label="Pause entre passages"><i></i><span>0s</span><i></i></button>
    </div>
    <div class="pl-edges">${edgeRow('start')}${edgeRow('end')}</div>
    <div class="pl-more"><button data-act="step" data-step>Pas : 1 s</button><button class="pl-ramp" data-act="ramp">Montée progressive : non</button></div>
  </section>`;
}
function mountPlayer(root) {
  if (!root) return;
  mountTimeline(root.querySelector('.tlbox'));
  root.querySelector('.pl-tempo').addEventListener('input', e => setTempo(+e.target.value));
}

/* La timeline existe à deux endroits (page du morceau, détails du solo) : chaque exemplaire se dessine et suit la lecture. */
const TLS = [];
const timelineHTML = () => '<div class="tl-scroll"><div class="tl-inner"><canvas></canvas><div class="playhead"></div></div></div>';
const timelineTools = () => '<div class="tl-tools"><span class="tl-time"></span><button data-act="zoom" data-d="-1" aria-label="Rapprocher les bâtonnets (dézoomer)">' + IC.minus + '</button><button data-act="zoom" data-d="1" aria-label="Écarter les bâtonnets (zoomer)">' + IC.plus + '</button></div>';
function mountTimeline(root) {
  if (!root) return null;
  const tl = { root, sc: root.querySelector('.tl-scroll'), inner: root.querySelector('.tl-inner'), cv: root.querySelector('canvas'), ph: root.querySelector('.playhead'), lbl: root.querySelector('.tl-time'), touching: false };
  tl.sc.addEventListener('touchstart', () => tl.touching = true, { passive: true });
  tl.sc.addEventListener('touchend', () => setTimeout(() => tl.touching = false, 1500), { passive: true });
  tl.inner.addEventListener('click', e => {
    const x = e.clientX - tl.inner.getBoundingClientRect().left;
    audio.currentTime = Math.min(S.song.duration, Math.max(0, x / slot() * spb()));
    updatePlayhead();
  });
  for (let i = TLS.length - 1; i >= 0; i--) if (!document.contains(TLS[i].root)) TLS.splice(i, 1);
  TLS.push(tl); return tl;
}
const liveTimelines = () => { for (let i = TLS.length - 1; i >= 0; i--) if (!document.contains(TLS[i].root)) TLS.splice(i, 1); return TLS; };
function drawTimeline() { if (S.song) for (const tl of liveTimelines()) drawOneTimeline(tl); }
function drawOneTimeline(tl) {
  const cv = tl.cv; if (!cv) return;
  const song = S.song, dur = song.duration, per = spb();
  const pl = tl.root.closest('.player'), full = !pl || pl.classList.contains('full');   // bande fine (réduit) ou grande forme d'onde (complet)
  const nBars = Math.ceil(dur / per), W = nBars * slot(), H = full ? 104 : 34, LBL = full ? 16 : 0;
  const inner = tl.inner; inner.style.width = W + 'px'; inner.style.height = H + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 16000 / W);
  cv.width = Math.ceil(W * dpr); cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const act = curSolo();
  // fond du solo sélectionné
  if (act) {
    g.fillStyle = '#e5e5f0';
    g.fillRect(act.start / per * slot(), 0, (act.end - act.start) / per * slot(), H);
    g.fillStyle = '#636487';
    g.fillRect(act.start / per * slot() - 1, 0, 3, H); g.fillRect(act.end / per * slot() - 2, 0, 3, H);
  }
  const mid = (H - LBL) / 2, maxH = full ? H - LBL - 12 : H - 8, per2 = PEAK_STEP;
  for (let i = 0; i < nBars; i++) {
    const t0 = i * per, t1 = t0 + per;
    let p = 0;
    for (let k = Math.floor(t0 / per2); k < Math.max(Math.floor(t0 / per2) + 1, Math.ceil(t1 / per2)); k++) p = Math.max(p, song.peaks[k] || 0);
    const h = H * (.3 + .4 * p), tm = t0 + per / 2;
    // la plage sélectionnée a toujours la couleur de sélection (même si un autre solo la chevauche) ; le reste reste beige
    g.fillStyle = act && tm >= act.start && tm <= act.end ? '#636487' : '#e3c5a2';
    const SL = slot(), BW = barW(), x = i * SL + (SL - BW) / 2, y = mid - h / 2;
    g.beginPath(); g.roundRect(x, y, BW, h, BW / 2); g.fill();   // bâtonnets arrondis, comme sur la maquette
  }
  // repères de temps
  const stepS = [5, 10, 15, 30, 60, 120, 300].find(s => s / per * slot() >= 56) || 300;
  g.fillStyle = '#98836a'; g.font = '11px Inter, system-ui'; g.textBaseline = 'bottom';
  if (full) for (let t = 0; t < dur; t += stepS) g.fillText(fmt(t), t / per * slot() + 3, H - 2);
}

const PENCIL = IC.pencil;
/* Champs d'un solo : dépliés sous sa carte (le début et la fin se règlent dans le lecteur complet) */
const edgeRow = w => { const n = w === 'start' ? 'Début' : 'Fin'; return `<div class="pl-edge"><span class="lbl">${n}</span><b data-edge="${w}">0:00.0</b><span class="sp"></span>
    <button class="pl-sq" data-act="nudge" data-w="${w}" data-d="-1" aria-label="${n} moins">${IC.minus}</button>
    <button class="pl-sq" data-act="nudge" data-w="${w}" data-d="1" aria-label="${n} plus">${IC.plus}</button>
    <button class="pl-sq here" data-act="here" data-w="${w}" aria-label="${n} : prendre la position de lecture">${IC.target}</button></div>`; };
function bindProfile(act, pfx, after) {
  const sl = $('#' + pfx + 'Soloist'), n = $('#' + pfx + 'Name'), i = $('#' + pfx + 'Instr'), io = $('#' + pfx + 'InstrOther');
  if (sl) sl.addEventListener('input', () => { act.soloist = sl.value; saveSoon(); after && after(); });
  if (n) n.addEventListener('input', () => { act.name = n.value; saveSoon(); after && after(); });
  if (i) i.addEventListener('change', () => {
    if (i.value === '__other') { io.hidden = false; io.focus(); act.instrument = canonInstr(io.value); }
    else { io.hidden = true; act.instrument = i.value; }
    saveSoon(); after && after();
  });
  if (io) io.addEventListener('input', () => { act.instrument = io.value.trim(); saveSoon(); after && after(); });
}
/* Instruments : liste stricte (jazz) + « Autre… » pour une saisie libre */
const INSTRUMENTS = ['Flûte', 'Piccolo', 'Saxophone soprano', 'Saxophone alto', 'Saxophone ténor', 'Saxophone baryton', 'Trompette', 'Bugle', 'Trombone', 'Clarinette', 'Piano', 'Orgue', 'Guitare', 'Vibraphone', 'Violon', 'Voix', 'Contrebasse'];
const INSTR_ALIAS = { flute: 'Flûte', saxophone: 'Saxophone alto', sax: 'Saxophone alto', saxalto: 'Saxophone alto', saxtenor: 'Saxophone ténor', saxsoprano: 'Saxophone soprano', saxbaryton: 'Saxophone baryton', trumpet: 'Trompette', clarinet: 'Clarinette', voice: 'Voix', bass: 'Contrebasse', basse: 'Contrebasse' };
function canonInstr(v) {
  const n = norm(v); if (!n) return '';
  return INSTRUMENTS.find(i => norm(i) === n) || INSTR_ALIAS[n] || String(v).trim();
}
function instrSelectHTML(cur, pfx = 'solo') {
  const c = canonInstr(cur), known = INSTRUMENTS.includes(c), other = !!c && !known;
  return `<select class="txt sel" id="${pfx}Instr" aria-label="Instrument"><option value="">Instrument…</option>${INSTRUMENTS.map(i => `<option${i === c ? ' selected' : ''}>${i}</option>`).join('')}<option value="__other"${other ? ' selected' : ''}>Autre…</option></select>
      <input class="txt" id="${pfx}InstrOther" value="${other ? esc(c) : ''}" placeholder="Autre instrument" aria-label="Autre instrument"${other ? '' : ' hidden'}>`;
}
function profileFields(act, pfx) {
  return `<input class="txt" id="${pfx}Name" value="${esc(act.name)}" placeholder="Nom du solo" aria-label="Nom du solo">
      ${instrSelectHTML(act.instrument, pfx)}
      <input class="txt" id="${pfx}Soloist" value="${esc(act.soloist)}" placeholder="Soliste (ex. Miles Davis)" aria-label="Soliste">`;
}
function soloEditor(act) {
  return `<div class="editor">
      ${S.newId === act.id ? profileFields(act, 'solo') : ''}
      <div class="ed-time"><span>Début <b data-edge="start">${fmt(act.start, true)}</b></span><span>Fin <b data-edge="end">${fmt(act.end, true)}</b></span></div>
      <button class="cta2" data-act="sheet-open">Détails du solo</button>
    </div>`;
}
function renderPanel() {
  const p = $('#soloPanel'); if (!p) return;
  const song = S.song;
  const list = song.solos.filter(s => !S.onlyFav || s.fav).sort(bySoloOrder);
  let h = `<div class="list-title"><b>Mes solos</b><button class="fav-btn${S.onlyFav ? ' on' : ''}" data-act="fav-filter" aria-label="Favoris seulement">${IC.star(S.onlyFav)}</button></div>`;
  // une carte : pastille ▶ = jouer la plage ; le nom (ou ▾) déplie les champs ; crayon (carte repliée) = page des détails
  h += list.length ? list.map(s => { const open = S.openId === s.id;
    return `<div class="swrap" data-solo="${s.id}"><button class="swipe-del" data-act="solo-swipe-del" data-solo="${s.id}" aria-label="Supprimer ce solo">${IC.trash}</button>
    <div class="solo acc ${s.id === S.soloId ? 'sel' : ''}${open ? ' open' : ''}">
      <div class="solo-head">
        <button class="solo-play" data-act="solo-pick" data-solo="${s.id}" aria-label="Jouer ce solo">${IC.play}</button>
        <button class="pick" data-act="solo-toggle" data-solo="${s.id}" aria-expanded="${open}" aria-label="Champs du solo"><span><b>${esc(s.name)}${s.instrument ? ' · ' + esc(s.instrument) : ''}</b><small>${fmt(s.start)} – ${fmt(s.end)} · ${s.tempo}%${s.soloist ? ' · ' + esc(s.soloist) : ''}</small></span></button>
        ${statBtn(s, 'solo-status')}
        <button class="star ${s.fav ? 'on' : ''}" data-act="star" data-solo="${s.id}" aria-label="Favori">${IC.star(s.fav)}</button>
        ${open ? '' : `<button class="icon-sm" data-act="solo-details" data-solo="${s.id}" aria-label="Détails du solo">${PENCIL}</button>`}
        <button class="icon-sm" data-act="solo-toggle" data-solo="${s.id}" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'} les champs du solo">${open ? IC.chevUp : IC.chev}</button>
      </div>
      ${open ? soloEditor(s) : ''}
    </div></div>`; }).join('') : `<p class="hint">${song.solos.length ? 'Aucun favori.' : 'Écoute le morceau, puis touche + quand un solo commence.'}</p>`;
  p.innerHTML = h; syncSoloPlay(); syncEdges();
  const act = S.openId && song.solos.find(x => x.id === S.openId);
  if (!act) return;
  bindProfile(act, 'solo', () => { const b = document.querySelector('.solo.open .pick b'); if (b) b.textContent = act.name + (act.instrument ? ' · ' + act.instrument : ''); });
}
/* L'icône de la ligne du solo en cours suit la lecture (▶ / ⏸) */
function syncSoloPlay() {
  document.querySelectorAll('.solo-play').forEach(b => { const on = b.dataset.solo === S.soloId && !audio.paused; b.classList.toggle('on', on); b.innerHTML = on ? IC.pause : IC.play; });
}
/* Début / fin / pas affichés dans les options et dans la page des détails */
function syncEdges() {
  const so = curSolo(); if (!so) return;
  document.querySelectorAll('[data-edge]').forEach(b => { b.textContent = fmt(so[b.dataset.edge], true); });
  document.querySelectorAll('[data-step]').forEach(b => { b.textContent = 'Pas : ' + S.step + ' s'; });
  const sub = $('#sheetSub'); if (sub) sub.textContent = `${fmt(so.start)} – ${fmt(so.end)} · ${so.tempo || S.tempo}%`;
}

/* ---------- Lecture ---------- */
function updateTransport() {
  if (!document.querySelector('.player')) return;
  const playing = !(audio.paused && !S.waiting), pct = Math.round((S.tempo - 30) / 120 * 100), so = curSolo();
  document.querySelectorAll('.pl-play').forEach(b => { b.innerHTML = playing ? IC.pause : IC.play; });
  document.querySelectorAll('.pl-loop').forEach(b => b.classList.toggle('on', S.loop));
  document.querySelectorAll('.pl-tempo').forEach(r => { r.value = S.tempo; r.style.setProperty('--p', Math.max(0, Math.min(100, pct)) + '%'); });
  document.querySelectorAll('.pl-tlbl').forEach(l => { l.textContent = S.tempo + ' %'; });
  document.querySelectorAll('.pl-gap').forEach(b => { b.classList.toggle('on', S.gap > 0); b.querySelector('span').textContent = (S.gap || 0) + 's'; });
  document.querySelectorAll('.pl-ramp').forEach(b => { b.textContent = 'Montée progressive : ' + (S.ramp ? 'oui' : 'non'); b.classList.toggle('on', S.ramp); });
  document.querySelectorAll('.player').forEach(pl => pl.classList.toggle('has-solo', !!so));
  syncEdges(); syncSoloPlay();
}
function updatePlayhead(forceScroll) {
  if (!S.song) return;
  const x = audio.currentTime / spb() * slot(), label = `${fmt(audio.currentTime)} / ${fmt(S.song.duration)}`;
  for (const tl of liveTimelines()) {
    tl.ph.style.transform = `translateX(${x}px)`;
    if (tl.lbl) tl.lbl.textContent = label;
    const sc = tl.sc;
    if (forceScroll || ((!audio.paused) && !tl.touching)) {
      if (forceScroll || x < sc.scrollLeft + 24 || x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.3);
    }
  }
}
let gapTimers = [], beepCtx = null;
function ensureBeep() {
  try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); if (beepCtx.state === 'suspended') beepCtx.resume(); } catch {}
}
function beep(hi) {
  try {
    ensureBeep();
    const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t = beepCtx.currentTime;
    o.frequency.value = hi ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(beepCtx.destination); o.start(t); o.stop(t + 0.1);
  } catch {}
}
function cancelGap() { gapTimers.forEach(clearTimeout); gapTimers = []; S.waiting = false; }
function loopEnd(r) {
  S.passes++;
  if (S.ramp && S.tempo < 100) { setTempo(S.tempo + 5, false); toast(`Passage ${S.passes + 1} · ${S.tempo} %`); }
  if (S.gap > 0) {
    S.waiting = true; audio.pause(); audio.currentTime = r.start; updateTransport();
    const n = Math.max(1, Math.round(S.gap));
    for (let i = 0; i < n; i++) gapTimers.push(setTimeout(() => beep(i === n - 1), S.gap * 1000 * i / n));
    gapTimers.push(setTimeout(() => { S.waiting = false; audio.play().catch(() => {}); }, S.gap * 1000));
  } else audio.currentTime = r.start;
}
function tick() {
  if (S.lib && !audio.paused && audio.currentTime >= S.lib.end) audio.currentTime = S.lib.start;   // boucle sur la plage
  const r = S.loop && curSolo(), t = audio.currentTime;
  if (r && !audio.paused && !S.waiting && t >= r.end && t < r.end + 0.6) loopEnd(r);
  updatePlayhead();
  raf = requestAnimationFrame(tick);
}
function setPlaying(on) {
  cancelAnimationFrame(raf);
  if (on) { raf = requestAnimationFrame(tick); requestWake(); } else releaseWake();
  updateTransport(); syncLibPlay();
}
async function requestWake() { try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch {} }
function releaseWake() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }
audio.addEventListener('play', () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('seeked', () => S.song && updatePlayhead());
audio.addEventListener('ended', () => {
  if (S.lib) { audio.currentTime = S.lib.start; audio.play().catch(() => {}); return; }
  const r = S.loop && curSolo();
  if (r && !S.waiting) { loopEnd(r); if (!S.gap) audio.play().catch(() => {}); } else setPlaying(false);
});
function applyRate() {
  audio.playbackRate = S.tempo / 100;
  audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true; // tempo sans changer la hauteur
}
function setTempo(v, persist = true) {
  S.tempo = Math.max(25, Math.min(150, Math.round(v)));
  applyRate();
  const s = curSolo(); if (s && persist) { s.tempo = S.tempo; saveSoon(); renderPanel(); }
  updateTransport();
}
function play() {
  ensureBeep();
  if (S.waiting) { cancelGap(); updateTransport(); return; }   // appui pendant la pause : on reste en pause
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}

async function openSong(id, soloId) {
  const song = S.songs.find(s => s.id === id); if (!song) return;
  const blob = await idb('audio', 'readonly', s => s.get(id));
  if (!blob) { toast('Fichier audio introuvable'); return; }
  S.lib = null; libSongId = null; audio.pause(); cancelGap(); S.passes = 0; S.openId = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  S.song = song; S.soloId = null; S.onlyFav = false;
  applyRate();
  render();
  if (soloId) pickSolo(soloId, true);
}
function closeSong() {
  audio.pause(); cancelGap(); S.song && saveSongNow(S.song);
  S.song = null; S.soloId = null; S.openId = null; S.onlyFav = false;
  render();
}
function pickSolo(id, autoplay) {
  const s = S.song.solos.find(x => x.id === id); if (!s) return;
  cancelGap(); S.passes = 0; S.soloId = id; if (S.openId !== id) S.openId = null; S.tempo = s.tempo || 100; applyRate();   // choisir un autre solo replie les options
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
  [...song.solos].sort(bySoloOrder).forEach((x, i) => { x.ord = i + 1; }); solo.ord = 0;   // le nouveau solo arrive en haut de la pile
  song.solos.push(solo); saveSoon();
  S.newId = solo.id;   // les trois champs du profil ne sont affichés que pour un solo qui vient d'être créé
  pickSolo(solo.id, false); S.openId = solo.id; renderPanel();
  toast('Solo créé : règle début et fin dans le bandeau du haut');
}
function editEdge(w, newT) {
  const s = curSolo(); if (!s) return;
  const dur = S.song.duration;
  if (w === 'start') s.start = Math.max(0, Math.min(newT, s.end - 0.5));
  else s.end = Math.min(dur, Math.max(newT, s.start + 0.5));
  s.start = Math.round(s.start * 10) / 10; s.end = Math.round(s.end * 10) / 10;
  saveSoon();
  audio.currentTime = w === 'start' ? s.start : Math.max(s.start, s.end - 2);  // on réécoute le bord modifié
  drawTimeline(); renderPanel(); syncEdges(); updatePlayhead(true);
}

/* ---------- Artiste, album, pochette (recherche automatique, saisie manuelle en secours) ---------- */
const cleanTerm = t => Meta.cleanName(t, true).title;   // garde « 26-2 », retire numéro de piste, remaster, feat, année
// étiquettes du fichier (titre, artiste, album, pochette) lues une fois pour les morceaux déjà importés
async function applyFileTags(song) {
  if (song.tagsRead) return false;
  song.tagsRead = true;
  const blob = await idb('audio', 'readonly', st => st.get(song.id));
  const tags = blob ? await readTags(blob) : null;
  if (!tags) { saveSoon(); return false; }
  song.tags = { title: tags.title, artist: tags.artist, album: tags.album, hasCover: !!tags.coverBytes };
  let got = false;
  if (tags.artist && !song.artist) { song.artist = tags.artist; got = true; }
  if (tags.album && !song.album) { song.album = tags.album; got = true; }
  if (tags.coverBytes && !song.cover) { song.cover = await coverToDataUrl(tags.coverBytes, tags.coverMime); got = !!song.cover || got; }
  saveSoon(); return got;
}
const CH = { hits: [], term: '', busy: false };
function renderChooser(msg) {
  const el = $('#chooser'); el.hidden = false; document.body.style.overflow = 'hidden';
  el.innerHTML = `<div class="sheet-top"><button class="icon-btn" data-act="ch-close" aria-label="Fermer">${IC.back}</button><b>Choisir le bon morceau</b></div>
    <div class="ch-search"><input class="txt" id="chTerm" value="${esc(CH.term)}" placeholder="Artiste et titre" aria-label="Recherche"><button data-act="ch-search">Chercher</button></div>
    <p class="hint">${esc(msg || 'Touche la bonne ligne : titre, artiste, album et pochette seront repris. Vérifie l’album et la durée. Tu peux corriger la recherche.')}</p>
    <div class="ch-list">${CH.hits.map((h, i) => `<button class="ch-hit" data-act="ch-pick" data-i="${i}">
      <img src="${esc(h.thumb || '')}" alt="" onerror="this.style.visibility='hidden'"><span><b>${esc(h.title)}</b><small>${esc(h.artist)}</small><small>${esc(h.album || '')}${h.year ? ' · ' + esc(h.year) : ''}${h.duration ? ' · ' + fmt(h.duration) : ''}${h.sameLength ? ' · même durée' : ''} · ${esc(h.source)}</small></span></button>`).join('')}</div>`;
  const inp = $('#chTerm'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); chSearch(inp.value); } });
}
function closeChooser() { $('#chooser').hidden = true; if ($('#sheet').hidden && $('#edit').hidden) document.body.style.overflow = ''; }
/* Modifier le morceau : titre, artiste (origine), album, pochette, identification automatique */
function editHTML(song) {
  return `<div class="sheet-top"><button class="icon-btn" data-act="edit-close" aria-label="Fermer">${IC.back}</button><b>Modifier le morceau</b></div>
    <div class="edit-body">
      <div class="edit-cover">${song.cover ? `<img class="cover" src="${esc(song.cover)}" alt="Pochette" onerror="this.outerHTML='<div class=&quot;cover ph&quot;>♪</div>'">` : '<div class="cover ph">♪</div>'}
        <button data-act="cover-file">Changer la pochette…</button></div>
      <label class="fld">Titre du morceau<input class="txt" id="songTitle" value="${esc(song.title)}" placeholder="Titre"></label>
      <label class="fld">Artiste (origine)<input class="txt" id="songArtist" value="${esc(song.artist)}" placeholder="Artiste"></label>
      <label class="fld">Album<input class="txt" id="songAlbum" value="${esc(song.album)}" placeholder="Album"></label>
      <button class="cta2" data-act="lookup">Identifier le morceau</button>
      <p class="hint">« Identifier » cherche le titre, l’artiste, l’album et la pochette ; tu choisis ensuite le bon résultat.</p>
      <button data-act="edit-close">Terminé</button>
    </div>`;
}
function renderEdit() {
  const song = S.song, el = $('#edit'); if (!song || el.hidden) return;
  el.innerHTML = editHTML(song);
  for (const [id, key] of [['songTitle', 'title'], ['songArtist', 'artist'], ['songAlbum', 'album']]) {
    const i = $('#' + id); if (i) i.addEventListener('input', () => { song[key] = i.value; saveSoon(); updateHeader(); });
  }
}
function openEdit() { if (!S.song) return; $('#edit').hidden = false; document.body.style.overflow = 'hidden'; renderEdit(); }
function closeEdit() { $('#edit').hidden = true; if ($('#sheet').hidden && $('#chooser').hidden) document.body.style.overflow = ''; updateHeader(); if (S.song) renderPanel(); }
function refreshMeta() { updateHeader(); renderEdit(); renderPanel(); }
/* auto : recherche à partir du titre / nom de fichier / artiste ; sinon les mots saisis, tels quels */
async function chSearch(term, auto) {
  const song = S.song; if (!song || CH.busy) return;
  CH.busy = true; CH.term = term; CH.hits = []; renderChooser('Recherche en cours…');
  try {
    const r = await Meta.searchAll({ title: (song.tags && song.tags.title) || song.title, artist: (song.tags && song.tags.artist) || song.artist, album: (song.tags && song.tags.album) || song.album, file: song.file || song.title, duration: song.duration, query: auto ? '' : term });
    CH.hits = r.candidates; if (auto && r.queries[0]) CH.term = r.queries[0].text;
    song.lookupLog = { term: CH.term, at: new Date().toISOString(), n: r.candidates.length, errors: r.errors, top: r.candidates.slice(0, 5).map(h => ({ source: h.source, track: h.title, artist: h.artist, album: h.album, score: h.score })) };
    saveSoon();
    const down = r.errors.length >= 2;
    renderChooser(r.candidates.length ? '' : down ? 'Recherche impossible (hors ligne ou service indisponible). Ferme et saisis à la main.' : 'Rien trouvé : change les mots de la recherche, ou ferme et saisis à la main.');
  } catch (e) {
    song.lookupLog = { term, at: new Date().toISOString(), error: String(e && e.message || e) }; saveSoon();
    renderChooser('Recherche impossible (hors ligne ?). Ferme et saisis l’artiste et l’album à la main.');
  }
  CH.busy = false;
}
async function lookup() {
  const song = S.song; if (!song) return;
  let got = false; try { got = await applyFileTags(song); } catch (e) { console.warn(e); }
  if (got) { refreshMeta(); toast('Infos lues dans le fichier MP3'); }
  CH.hits = []; CH.term = '';
  await chSearch('', true);
}
async function pickHit(i) {
  const song = S.song, h = CH.hits[i]; if (!song || !h) return;
  song.title = h.title || song.title; song.artist = h.artist || song.artist; song.album = h.album || song.album;
  if (song.lookupLog) song.lookupLog.chosen = { source: h.source, track: h.title, artist: h.artist, album: h.album };
  saveSongNow(song); closeChooser(); refreshMeta(); toast('Titre, artiste et album mis à jour');
  if (!h.cover) return;
  try { song.cover = await Meta.coverToDataURL(h.cover); }                  // copie réduite, disponible hors ligne
  catch { song.cover = h.cover; }                                            // service sans CORS : on garde l’adresse
  await saveSongNow(song); if (S.song === song) refreshMeta();
}
async function setCoverFile(file) {
  const song = S.song; if (!song || !file) return;
  try { song.cover = await Meta.coverToDataURL(file); await saveSongNow(song); if (S.song === song) refreshMeta(); toast('Pochette enregistrée'); }
  catch { toast('Image illisible'); }
}
$('#coverInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) setCoverFile(f); });

/* ---------- Diagnostic : un petit fichier (sans audio) à m'envoyer pour comprendre les erreurs ---------- */
async function diagnostic() {
  const song = S.song, solo = curSolo(); if (!song) { toast('Ouvre un morceau d’abord'); return; }
  const sc = solo && solo.score;
  const rep = {
    app: 'solo-looper-diag', version: 3, date: new Date().toISOString(), ua: navigator.userAgent, viewport: [innerWidth, innerHeight],
    song: { title: song.title, file: song.file || null, artist: song.artist || '', album: song.album || '', duration: song.duration,
      coverKind: !song.cover ? 'aucune' : /^data:/.test(song.cover) ? 'intégrée au fichier' : 'en ligne', tags: song.tags || null, lookup: song.lookupLog || null },
    solo: solo ? { range: solo.range || null, top: !!solo.top, name: solo.name, instrument: solo.instrument, soloist: solo.soloist, start: solo.start, end: solo.end, tempoPct: solo.tempo } : null,
    takes: typeof Takes !== 'undefined' ? Takes.diag() : null,
    score: sc ? { bpm: sc.bpm, lead: sc.lead, swing: !!sc.swing, tapped: !!sc.tapped, flats: !!sc.flats, edited: !!sc.edited, diag: sc.diag || null, raw: sc.raw, notes: sc.notes } : null,
  };
  const file = new File([JSON.stringify(rep, null, 1)], 'diagnostic-solo-looper.json', { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Diagnostic Solo Looper' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Diagnostic enregistré : envoie-le moi (aucun audio dedans)');
}

/* ---------- Partage : seulement les repères, jamais l'audio ---------- */
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
function exportSolos() {
  const songs = S.songs.filter(sg => sg.solos.length).map(sg => ({
    title: sg.title, file: sg.file || '', artist: sg.artist || '', album: sg.album || '',
    solos: sg.solos.map(({ name, instrument, soloist, start, end, tempo, fav, score, range, top }) => ({ name, instrument, soloist: soloist || '', start, end, tempo, fav, score, range, top })),
  }));
  if (!songs.length) { toast('Aucun solo à partager pour l\u2019instant'); return; }
  const blob = new Blob([JSON.stringify({ app: 'solo-looper', version: 1, songs }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mes-solos.json';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Fichier prêt : il contient les repères, pas l\u2019audio');
}
async function importSolos(file) {
  let n = 0, skipped = 0;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'solo-looper' || !Array.isArray(data.songs)) throw new Error('format');
    for (const it of data.songs) {
      const sg = S.songs.find(x => norm(x.title) === norm(it.title) || (it.file && x.file && norm(x.file) === norm(it.file)));
      if (!sg) { skipped += it.solos.length; continue; }
      sg.artist = sg.artist || it.artist; sg.album = sg.album || it.album;
      for (const so of it.solos) {
        if (sg.solos.some(x => Math.abs(x.start - so.start) < 0.2 && Math.abs(x.end - so.end) < 0.2)) continue;
        sg.solos.push({ id: uid(), color: COLORS[0], fav: false, tempo: 100, ...so }); n++;
      }
      await saveSongNow(sg);
    }
  } catch { toast('Fichier non reconnu'); return; }
  render();
  toast(`${n} solo${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} ignoré${skipped > 1 ? 's' : ''} (morceau absent de ta bibliothèque)` : ''));
}
$('#jsonInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importSolos(f); });

/* ---------- Avance / recul : un appui = 0,5 s ; en maintenant : 1 s, puis 3 s, 5 s et 10 s ---------- */
function seekBy(dt) {
  if (!S.song) return;
  audio.currentTime = Math.max(0, Math.min(S.song.duration, audio.currentTime + dt)); updatePlayhead();
}
const HOLD = { timer: null };
function stopHold() { clearTimeout(HOLD.timer); HOLD.timer = null; }
function startHold(dir) {
  stopHold(); const t0 = performance.now();
  seekBy(dir * 0.5);
  const step = () => {
    const held = performance.now() - t0, n = held >= 4200 ? 10 : held >= 3000 ? 5 : held >= 1800 ? 3 : 1;
    seekBy(dir * n); HOLD.timer = setTimeout(step, n === 1 ? 350 : 450);
  };
  HOLD.timer = setTimeout(step, 450);
}
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-act=seek-hold]'); if (!b) return; e.preventDefault(); startHold(+b.dataset.d); });
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, stopHold);
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-act=seek-hold]')) e.preventDefault(); });

/* ---------- Pédale Bluetooth / clavier ---------- */
document.addEventListener('keydown', e => {
  if (!S.song || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'Space' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); play(); }
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); const so = curSolo(); audio.currentTime = so ? so.start : 0; updatePlayhead(true); }
});

/* ---------- Actions (délégation des clics) ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, s = curSolo();
  switch (d.act) {
    case 'add-song': $('#fileInput').click(); break;
    case 'back': closeSong(); break;
    case 'tab': libStop(); S.tab = d.tab; render(); break;
    case 'solo-status': { const so = S.song.solos.find(x => x.id === d.solo); if (so) { so.status = STATUS_NEXT[so.status || '']; saveSoon(); renderPanel(); toast('Statut : ' + STATUS[so.status].toLowerCase()); } break; }
    case 'lib-status': { const sg = S.songs.find(x => x.id === d.song), so = sg && sg.solos.find(x => x.id === d.solo); if (so) { so.status = STATUS_NEXT[so.status || '']; saveSongNow(sg); render(); toast('Statut : ' + STATUS[so.status].toLowerCase()); } break; }
    case 'grp-toggle': S.exp.has(d.song) ? S.exp.delete(d.song) : S.exp.add(d.song); render(); break;
    case 'filter-toggle': S.showFilters = !S.showFilters; render(); break;
    case 'status-filter': S.status = S.status === d.status ? null : d.status; render(); break;
    case 'lib-play': libPlay(d.song, d.solo); break;
    case 'lib-details': await openSong(d.song); if (S.song) { pickSolo(d.solo, false); openSheet(); } break;
    case 'lib-del': {
      const sg = S.songs.find(x => x.id === d.song); if (!sg || !(await Takes.confirmDelete(d.solo))) break;
      if (S.lib && S.lib.soloId === d.solo) libStop();
      sg.solos = sg.solos.filter(x => x.id !== d.solo); saveSongNow(sg); render(); toast('Solo supprimé'); break;
    }
    case 'fav-filter': S.onlyFav = !S.onlyFav; S.song ? renderPanel() : render(); break;
    case 'instr-filter': S.instr = S.instr === d.instr ? '' : d.instr; render(); break;
    case 'open-song': openSong(d.song); break;
    case 'open-solo': openSong(d.song, d.solo); break;
    case 'del-song':
      if (confirm('Supprimer ce morceau et tous ses solos ?')) {
        await idb('songs', 'readwrite', st => st.delete(d.song)); await idb('audio', 'readwrite', st => st.delete(d.song)); await Takes.deleteSong(d.song);
        S.songs = S.songs.filter(x => x.id !== d.song); render();
      } break;
    case 'star-lib': { const sg = S.songs.find(x => x.id === d.song), so = sg.solos.find(x => x.id === d.solo); so.fav = !so.fav; saveSongNow(sg); render(); break; }
    case 'star': { const so = S.song.solos.find(x => x.id === d.solo); so.fav = !so.fav; saveSoon(); renderPanel(); break; }
    case 'play': play(); break;
    case 'seek': audio.currentTime = Math.max(0, Math.min(S.song.duration, audio.currentTime + +d.d)); updatePlayhead(); break;
    case 'loop': S.loop = !S.loop; updateTransport(); break;
    case 'tempo': setTempo(S.tempo + +d.d); break;
    case 'tempo-reset': setTempo(100); break;
    case 'seek-hold': if (e.detail === 0 && S.song) seekBy(+d.d * 0.5); break;   // clavier / lecteur d'écran ; au doigt, voir les événements pointer
    case 'player-full': {
      S.full = !S.full; try { localStorage.setItem('sl-full', S.full ? '1' : '0'); } catch {}
      document.querySelectorAll('.player').forEach(pl => pl.classList.toggle('full', S.full));
      document.querySelectorAll('.pl-expand').forEach(x => x.setAttribute('aria-expanded', S.full));
      drawTimeline(); updatePlayhead(true); break;
    }
    case 'edit-song': openEdit(); break;
    case 'edit-close': closeEdit(); break;
    case 'zoom': S.zoom = Math.max(0, Math.min(ZOOMS.length - 1, S.zoom + +d.d)); drawTimeline(); updatePlayhead(true); break;
    case 'solo-pick':
      if (S.soloId === d.solo) {                       // déjà choisi : pause / reprise ; hors de la plage, on repart du début
        if (audio.paused && s && (audio.currentTime < s.start || audio.currentTime >= s.end - 0.05)) audio.currentTime = s.start;
        play();
      } else pickSolo(d.solo, true);
      break;
    case 'solo-new': newSolo(); break;
    case 'solo-toggle': if (S.newId && S.newId !== d.solo) S.newId = null; if (S.openId === d.solo) { S.openId = null; S.newId = null; renderPanel(); } else { pickSolo(d.solo, false); S.openId = d.solo; renderPanel(); } break;
    case 'solo-details': pickSolo(d.solo, false); openSheet(); break;
    case 'solo-del':
      if (s && confirm(`Supprimer « ${s.name} » ?`) && await Takes.confirmDelete(s.id)) { S.song.solos = S.song.solos.filter(x => x !== s); S.soloId = null; S.openId = null; saveSoon(); drawTimeline(); renderPanel(); if (!$('#sheet').hidden) closeSheet(); }
      break;
    case 'sheet-status': { const so = curSolo(); if (so) { so.status = STATUS_NEXT[so.status || '']; saveSoon(); $('#sheetStat').innerHTML = `<i class="st-${so.status || 'none'}"></i>`; renderPanel(); toast('Statut : ' + STATUS[so.status].toLowerCase()); } break; }
    case 'sheet-star': { const so = curSolo(); if (so) { so.fav = !so.fav; saveSoon(); $('#sheetStar').innerHTML = IC.star(so.fav); $('#sheetStar').classList.toggle('on', so.fav); renderPanel(); } break; }
    case 'sheet-profile': { const pf = $('#sheetProfile'); if (pf) pf.hidden = !pf.hidden; break; }
    case 'solo-swipe-del': {
      const so = S.song.solos.find(x => x.id === d.solo); if (!so || !(await Takes.confirmDelete(so.id))) break;
      S.song.solos = S.song.solos.filter(x => x !== so); if (S.soloId === so.id) S.soloId = null; if (S.openId === so.id) S.openId = null;
      saveSoon(); drawTimeline(); renderPanel(); toast('Solo supprimé'); break;
    }
    case 'sort': S.sort = d.sort; try { localStorage.setItem('sl-sort', S.sort); } catch {} render(); break;
    case 'here': if (s) editEdge(d.w, audio.currentTime); break;
    case 'nudge': if (s) editEdge(d.w, s[d.w] + +d.d * S.step); break;
    case 'gap': ensureBeep(); S.gap = [0, 1, 2, 4][([0, 1, 2, 4].indexOf(S.gap) + 1) % 4]; updateTransport(); break;
    case 'ramp': S.ramp = !S.ramp; S.passes = 0; if (S.ramp && S.tempo >= 100) setTempo(60, false); updateTransport(); break;
    case 'lookup': lookup(); break;
    case 'cover-file': $('#coverInput').click(); break;
    case 'diag': diagnostic(); break;
    case 'ch-close': closeChooser(); break;
    case 'ch-search': { const i = $('#chTerm'); if (i) chSearch(i.value.trim()); break; }
    case 'ch-pick': pickHit(+d.i); break;
    case 'export': exportSolos(); break;
    case 'import': $('#jsonInput').click(); break;
    case 'step': S.step = STEPS[(STEPS.indexOf(S.step) + 1) % STEPS.length]; syncEdges(); break;
  }
});
$('#fileInput').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) importFiles(f); });
/* Liste « Mes solos » : appui long puis glisser = changer l'ordre ; balayage vers la gauche = corbeille */
(() => {
  const SW = 80; let g = null, mute = false;
  const cardOf = w => w.classList.contains('grp-wrap') ? w.querySelector(':scope > .grp-inner') : w.querySelector('.solo');
  const closeSwipes = except => document.querySelectorAll('.swrap.swiped, .grp-wrap.swiped').forEach(w => { if (w !== except) { w.classList.remove('swiped'); const c = cardOf(w); c.style.transition = ''; c.style.transform = ''; } });
  function begin(t, x, y) {
    const h = t.closest && t.closest('.grp-head'), w = (t.closest && t.closest('.swrap')) || (h && h.closest('.grp-wrap')) || (t.closest && t.closest('.grp-del') && t.closest('.grp-wrap'));
    closeSwipes(w); if (!w || t.closest('.swipe-del, .grp-del, input, select')) return;
    g = { w, card: cardOf(w), x0: x, y0: y, mode: '', open: w.classList.contains('swiped') };
    if (w.closest('#soloPanel')) g.timer = setTimeout(() => { if (g && !g.mode) startDrag(); }, 380);
  }
  function startDrag() {
    g.mode = 'drag'; g.list = [...document.querySelectorAll('#soloPanel .swrap')]; g.idx = g.list.indexOf(g.w); g.t = g.idx;
    g.h = g.w.offsetHeight + 10; g.w.classList.add('dragging'); g.list.forEach(w => { if (w !== g.w) w.style.transition = 'transform .15s'; });
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function move(x, y, ev) {
    if (!g) return; const dx = x - g.x0, dy = y - g.y0;
    if (!g.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { g.mode = 'swipe'; clearTimeout(g.timer); }
      else if (Math.abs(dy) > 8) { g.mode = 'scroll'; clearTimeout(g.timer); }
    }
    if (g.mode === 'swipe') { const tx = Math.max(-SW - 24, Math.min(0, (g.open ? -SW : 0) + dx)); g.card.style.transition = 'none'; g.card.style.transform = `translateX(${tx}px)`; g.tx = tx; }
    else if (g.mode === 'drag') {
      if (ev && ev.cancelable) ev.preventDefault();
      g.w.style.transform = `translateY(${dy}px)`;
      g.t = Math.max(0, Math.min(g.list.length - 1, g.idx + Math.round(dy / g.h)));
      g.list.forEach((w, k) => { if (w === g.w) return; w.style.transform = g.idx < g.t && k > g.idx && k <= g.t ? `translateY(${-g.h}px)` : g.t < g.idx && k >= g.t && k < g.idx ? `translateY(${g.h}px)` : ''; });
    }
  }
  function end() {
    if (!g) return; clearTimeout(g.timer); const m = g.mode; if (m === 'swipe' || m === 'drag') { mute = true; setTimeout(() => { mute = false; }, 60); }
    if (m === 'swipe') {
      const open = (g.tx ?? 0) < -SW / 2; g.card.style.transition = 'transform .18s'; g.card.style.transform = open ? `translateX(${-SW}px)` : ''; g.w.classList.toggle('swiped', open);
    } else if (m === 'drag') {
      const ids = g.list.map(w => w.dataset.solo), moved = ids.splice(g.idx, 1)[0]; ids.splice(g.t, 0, moved);
      if (g.t !== g.idx && S.song) {
        const full = [...S.song.solos].sort(bySoloOrder), shown = new Set(ids), slots = full.map((x, i) => shown.has(x.id) ? i : -1).filter(i => i >= 0);
        slots.forEach((slot, k) => { full[slot] = S.song.solos.find(x => x.id === ids[k]); });
        full.forEach((x, i) => { x.ord = i; }); saveSoon();
      }
      renderPanel();
    }
    g = null;
  }
  document.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(e.target, e.touches[0].clientX, e.touches[0].clientY); else if (g) { clearTimeout(g.timer); g = null; } }, { passive: true });
  document.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  document.addEventListener('mousedown', e => { if (e.button === 0) begin(e.target, e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => move(e.clientX, e.clientY, e));
  document.addEventListener('mouseup', end);
  document.addEventListener('click', e => { if (mute) { e.stopPropagation(); e.preventDefault(); } }, true);
})();
window.addEventListener('beforeunload', () => S.song && saveSongNow(S.song));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !audio.paused) requestWake(); });

/* ---------- Démarrage ---------- */
function fatal(msg) {
  $('#content').innerHTML = `<div class="fatal"><p><b>L\u2019application n\u2019a pas pu démarrer.</b></p><p>${esc(msg)}</p><button onclick="location.reload()">Réessayer</button></div>`;
}
window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Une erreur est survenue, réessaie'); });

const splashT0 = performance.now();
function hideSplash() { const e = document.getElementById('splash'); if (!e) return; setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 500); }, Math.max(0, 800 - (performance.now() - splashT0))); }
(async function init() {
  try {
    db = await openDB();
    S.songs = (await idb('songs', 'readonly', s => s.getAll())) || [];
    for (const sg of S.songs) { let ch = false; for (const so of sg.solos || []) { const c = canonInstr(so.instrument); if (c !== (so.instrument || '')) { so.instrument = c; ch = true; } } if (ch) saveSongNow(sg); }   // « Flute » → « Flûte », etc.
    render(); hideSplash();
  } catch (e) {
    hideSplash();
    console.error(e);
    fatal('Le stockage du navigateur est indisponible (navigation privée ?). Ouvre l\u2019app dans une fenêtre normale.');
    return;
  }
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had) return;                                   // première installation : rien à recharger
      if (!S.song) location.reload(); else toast('Nouvelle version prête : elle s\u2019applique à la prochaine ouverture');
    });
  }
})();
