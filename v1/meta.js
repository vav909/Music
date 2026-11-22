'use strict';
/* Titre, artiste, album, pochette d'un morceau (les étiquettes ID3 sont lues par tags.js) :
   nom de fichier nettoyé, puis recherche de candidats (iTunes, MusicBrainz + Cover Art Archive) classés, à choisir par l'utilisatrice.
   Aucune dépendance, aucune clé. Deezer : métadonnées seulement, jamais l'audio (non utilisé ici). */

const Meta = (() => {
  const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokens = s => strip(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const normKey = s => tokens(s).join('');
  const clean = s => String(s || '').replace(/\0/g, '').trim();

  /* ---------- 1. Nettoyage du nom de fichier ---------- */
  const NOISE = /^(?:remaster(?:ed)?(?:\s+version)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?|mono|stereo|(?:official\s+)?(?:audio|video|music video|lyric video|lyrics?)|hd|hq|explicit|bonus(?:\s+track)?|deluxe(?:\s+edition)?|(?:original|single|album|radio|album)\s+(?:version|mix|edit)|(?:feat|ft|featuring)\.?\s.*|(?:19|20)\d{2})$/i;
  /* → { title, parts?: [gauche, droite], feat } ; strict : supprime toutes les parenthèses (pour la recherche) */
  function cleanName(raw, strict = false) {
    let s = String(raw || '').replace(/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus)$/i, '');
    const hadUnderscore = s.includes('_');
    s = s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    if (hadUnderscore && !/\s[-–—]\s/.test(s)) s = s.replace(/(\S)-(\S)/, '$1 - $2');                 // « Miles_Davis-So_What »
    // numéro de piste (sans toucher aux titres qui commencent par un nombre : « 26-2 », « 52nd Street Theme »)
    const lead = [/^0\d[\s._-]+(?=\S)/, /^\d{1,3}\s*[.)]\s+(?=\S)/, /^\d{1,3}\s+[-–—]\s+(?=\S)/, /^\d{1,2}[-.]\d{2}[\s._-]+(?=\S)/];
    for (const re of lead) { const t = s.replace(re, ''); if (t !== s && t.length >= 2) { s = t; break; } }
    let feat = '';
    s = s.replace(/[([]([^)\]]*)[)\]]/g, (m, inner) => {
      if (/^\s*(feat|ft|featuring)\.?\s/i.test(inner)) { feat = inner.replace(/^\s*(feat|ft|featuring)\.?\s*/i, '').trim(); return ' '; }
      return strict || NOISE.test(inner.trim()) ? ' ' : m;
    });
    s = s.replace(/\s+(?:feat|ft|featuring)\.?\s+(.*)$/i, (m, who) => { feat = feat || who.trim(); return ''; });
    s = s.replace(/\s+[-–—]\s+(?:remaster(?:ed)?(?:\s+version)?(?:\s+\d{4})?|mono|stereo|live(?:\s+.*)?|bonus track|(?:original|single|album|radio)\s+(?:version|mix|edit))\s*$/i, '');
    s = s.replace(/\s*[-–—]\s*(?:19|20)\d{2}\s*$/, '');
    s = s.replace(/\s+/g, ' ').trim();
    const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    return { title: s, parts: m ? [m[1].trim(), m[2].trim()] : null, feat };
  }

  /* Variantes de recherche, de la plus précise à la plus large : [{artist, title, text}] */
  function buildQueries({ title, artist, file }) {
    const out = [], seen = new Set();
    const add = (a, t) => { a = clean(a); t = clean(t); const text = `${a} ${t}`.trim(); const k = normKey(a) + '|' + normKey(t); if (!t || seen.has(k)) return; seen.add(k); out.push({ artist: a, title: t, text }); };
    if (title && artist) add(artist, cleanName(title, true).title);
    for (const src of [file, title]) {
      if (!src) continue;
      for (const strict of [false, true]) {
        const c = cleanName(src, strict);
        if (c.parts) { add(c.parts[0], c.parts[1]); add(c.parts[1], c.parts[0]); } else add(artist || '', c.title);
        add('', c.title);
      }
    }
    return out;
  }

  /* ---------- 2. Recherche de candidats ---------- */
  const withTimeout = async (f, url, ms, extra) => {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
    try { const r = await f(url, { signal: ctl.signal, ...extra }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(to); }
  };
  async function searchItunes(text, o = {}) {
    const url = 'https://itunes.apple.com/search?media=music&entity=song&limit=10&term=' + encodeURIComponent(text);
    const j = await withTimeout(o.fetch || fetch, url, o.timeout || 9000);
    return (j.results || []).filter(x => x.trackName && x.artistName).map(x => ({
      source: 'iTunes', id: 'it' + x.trackId, title: x.trackName, artist: x.artistName, album: x.collectionName || '',
      year: String(x.releaseDate || '').slice(0, 4), duration: x.trackTimeMillis ? x.trackTimeMillis / 1000 : null,
      cover: x.artworkUrl100 ? x.artworkUrl100.replace('100x100bb', '600x600bb') : '', thumb: x.artworkUrl100 || '',
    }));
  }
  const luc = s => String(s).replace(/(["\\])/g, '\\$1');
  function mbQuery({ artist, title, text }) {
    if (artist && title) return `recording:"${luc(title)}" AND artist:"${luc(artist)}"`;
    return tokens(text || title).map(t => `(recording:${t} OR artist:${t})`).join(' AND ');
  }
  async function searchMusicBrainz(q, o = {}) {
    const url = 'https://musicbrainz.org/ws/2/recording/?fmt=json&limit=8&query=' + encodeURIComponent(mbQuery(q));
    const j = await withTimeout(o.fetch || fetch, url, o.timeout || 9000, { headers: { Accept: 'application/json' } });
    return (j.recordings || []).map(r => {
      const rels = r.releases || [], rel = rels.find(x => x.status === 'Official' && (x['release-group'] || {})['primary-type'] === 'Album') || rels.find(x => x.status === 'Official') || rels[0];
      const artist = (r['artist-credit'] || []).map(a => (a.name || (a.artist && a.artist.name) || '') + (a.joinphrase || '')).join('').trim();
      return {
        source: 'MusicBrainz', id: 'mb' + r.id, title: r.title, artist, album: rel ? rel.title : '', year: String((rel && rel.date) || r['first-release-date'] || '').slice(0, 4),
        duration: r.length ? r.length / 1000 : null, cover: rel ? `https://coverartarchive.org/release/${rel.id}/front-500` : '', thumb: rel ? `https://coverartarchive.org/release/${rel.id}/front-250` : '',
      };
    }).filter(c => c.title && c.artist);
  }

  /* Classe les candidats : mots communs avec ce qu'on sait, titre/artiste exacts, durée proche de celle du fichier. */
  function rank(cands, info) {
    const want = tokens([info.artist, info.title, info.query].filter(Boolean).join(' ')), wantSet = new Set(want);
    const bad = /karaok|tribute|made famous|originally performed|cover version|ringtone/i, seen = new Set(), out = [];
    for (const c of cands) {
      const k = normKey(c.title + '|' + c.artist + '|' + c.album); if (seen.has(k)) continue; seen.add(k);
      const ct = new Set(tokens(c.artist + ' ' + c.title)); let hit = 0; wantSet.forEach(w => { if (ct.has(w)) hit++; });
      let sc = (wantSet.size ? hit / wantSet.size : 0) * 0.6 + (ct.size ? hit / ct.size : 0) * 0.2;
      if (info.title && normKey(c.title) === normKey(cleanName(info.title, true).title)) sc += 0.3;
      if (info.artist && normKey(c.artist) === normKey(info.artist)) sc += 0.3;
      if (info.album && normKey(c.album) === normKey(info.album)) sc += 0.1;
      if (info.duration && c.duration) {
        const d = Math.abs(c.duration - info.duration);
        sc += d <= 2 ? 0.35 : d <= 6 ? 0.2 : d <= 15 ? 0.05 : d > 60 ? -0.1 : 0;
        c.sameLength = d <= 3;
      }
      if (bad.test(c.title + ' ' + c.album + ' ' + c.artist) && !bad.test(info.title || '')) sc -= 0.4;
      out.push({ ...c, score: +sc.toFixed(3) });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /* Cherche sur iTunes (rapide) puis MusicBrainz (secours) et renvoie les meilleurs candidats + les sources en échec. */
  async function searchAll(info, o = {}) {
    const text = clean(info.query);
    const qs = text ? [{ artist: '', title: text, text }] : buildQueries(info), errors = [], all = [];
    const texts = [...new Map(qs.slice(0, 4).map(q => [tokens(q.text).sort().join(' '), q.text])).values()].slice(0, 2);     // iTunes cherche dans tous les champs : l'ordre importe peu
    const itunes = texts.map(q => searchItunes(q, o).then(r => all.push(...r)).catch(e => errors.push({ source: 'iTunes', message: String(e.message || e) })));
    await Promise.all(itunes);
    if (all.length < 3 || o.allSources) {                                                                // MusicBrainz : 1 requête/s au maximum
      for (const q of qs.slice(0, 2)) {
        try { all.push(...await searchMusicBrainz(q, o)); } catch (e) { errors.push({ source: 'MusicBrainz', message: String(e.message || e) }); }
        if (all.length >= 8) break;
        await new Promise(r => setTimeout(r, o.pause ?? 1100));
      }
    }
    return { candidates: rank(all, { ...info, query: text }).slice(0, 8), errors, queries: qs };
  }

  /* ---------- 3. Pochettes : réduites et stockées dans le morceau (hors ligne) — navigateur uniquement ---------- */
  async function coverToDataURL(src, max = 360) {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
    return cv.toDataURL('image/jpeg', 0.85);
  }

  return { cleanName, buildQueries, searchItunes, searchMusicBrainz, searchAll, rank, mbQuery, coverToDataURL, tokens };
})();
if (typeof module !== 'undefined') module.exports = Meta;
