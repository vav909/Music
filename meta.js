'use strict';
/* Titre, artiste, album, pochette d'un morceau :
   1) étiquettes ID3 du MP3 (parseur maison) ; 2) nom de fichier nettoyé ; 3) recherche de candidats (iTunes, MusicBrainz + Cover Art Archive)
   à choisir par l'utilisatrice. Aucune dépendance, aucune clé. Deezer : métadonnées seulement, jamais l'audio (non utilisé ici). */

const Meta = (() => {
  const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokens = s => strip(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const normKey = s => tokens(s).join('');

  /* ---------- 1. Étiquettes ID3 (v1, v2.2, v2.3, v2.4) ---------- */
  const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const unsync = b => { const o = []; for (let i = 0; i < b.length; i++) { o.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; } return Uint8Array.from(o); };
  const decoders = {};
  const dec = (label, bytes) => (decoders[label] = decoders[label] || new TextDecoder(label)).decode(bytes);
  function decodeText(enc, bytes) {
    let t;
    if (enc === 1) {                                              // UTF-16 avec BOM
      if (bytes[0] === 0xfe && bytes[1] === 0xff) t = dec('utf-16be', bytes.subarray(2));
      else t = dec('utf-16le', bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2) : bytes);
    } else if (enc === 2) t = dec('utf-16be', bytes);
    else if (enc === 3) t = dec('utf-8', bytes);
    else t = dec('iso-8859-1', bytes);
    return t;
  }
  /* Position du terminateur d'une chaîne selon l'encodage (1 octet nul, ou 2 alignés pour UTF-16). */
  function termAt(b, from, enc) {
    if (enc === 1 || enc === 2) { for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return { end: i, next: i + 2 }; }
    else for (let i = from; i < b.length; i++) if (b[i] === 0) return { end: i, next: i + 1 };
    return { end: b.length, next: b.length };
  }
  const textFrame = data => {
    const enc = data[0], parts = decodeText(enc, data.subarray(1)).split('\0').map(x => x.trim()).filter(Boolean);
    return parts.join(' / ');
  };
  const sniff = b => (b[0] === 0xff && b[1] === 0xd8) ? 'image/jpeg' : (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ? 'image/png' : (b[0] === 0x47 && b[1] === 0x49) ? 'image/gif' : '';
  function pictureFrame(data, v22) {
    const enc = data[0]; let pos = 1, mime = '';
    if (v22) { const f = String.fromCharCode(...data.subarray(1, 4)).toUpperCase(); mime = f === 'PNG' ? 'image/png' : f === 'JPG' ? 'image/jpeg' : ''; pos = 4; }
    else { const t = termAt(data, 1, 0); mime = dec('iso-8859-1', data.subarray(1, t.end)).toLowerCase(); pos = t.next; }
    const type = data[pos++], t = termAt(data, pos, enc), img = data.subarray(t.next);
    if (!img.length || mime === '-->') return null;
    const m = sniff(img) || (mime.startsWith('image/') ? mime : '');
    return m ? { type, bytes: img, mime: m } : null;
  }
  function parseV2(head, buf) {
    const ver = head[3], flags = head[5], out = { frames: {}, pics: [] };
    if (ver < 2 || ver > 4) return out;
    if (flags & 0x80 && ver < 4) buf = unsync(buf);
    let pos = 0;
    if (ver >= 3 && flags & 0x40) pos = ver === 4 ? syncsafe(buf, 0) : u32(buf, 0) + 4;                // en-tête étendu
    const hdr = ver === 2 ? 6 : 10;
    while (pos + hdr <= buf.length && buf[pos] !== 0) {
      let id, size, ff = 0;
      if (ver === 2) { id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2]); size = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5]; }
      else { id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]); size = ver === 4 ? syncsafe(buf, pos + 4) : u32(buf, pos + 4); ff = (buf[pos + 8] << 8) | buf[pos + 9]; }
      pos += hdr;
      if (size <= 0 || pos + size > buf.length) break;
      let data = buf.subarray(pos, pos + size); pos += size;
      if (ver === 4) { if (ff & 0x000c) continue; if (ff & 0x0040) data = data.subarray(1); if (ff & 0x0001) data = data.subarray(4); if (ff & 0x0002) data = unsync(data); }
      else if (ver === 3) { if (ff & 0x00c0) continue; if (ff & 0x0020) data = data.subarray(1); }
      if (!data.length) continue;
      try {
        if (id === 'APIC' || id === 'PIC') { const p = pictureFrame(data, ver === 2); if (p) out.pics.push(p); }
        else if (id[0] === 'T' && id !== 'TXXX' && id !== 'TXX') { if (!(id in out.frames)) out.frames[id] = textFrame(data); }
      } catch { /* trame illisible : on passe à la suivante */ }
    }
    return out;
  }
  const clean = s => String(s || '').replace(/\0/g, '').trim();
  const junk = s => /^(track|piste|titre|title|unknown|inconnu|untitled)\s*\d*$/i.test(s) || /^\d+$/.test(s);

  /* Lit les étiquettes d'un fichier MP3 (Blob/File). Ne charge que l'en-tête de l'étiquette, pas tout le fichier. */
  async function readID3(blob) {
    const out = { title: '', artist: '', album: '', year: '', track: '', cover: null, found: false };
    try {
      const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
      if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
        const size = syncsafe(head, 6), buf = new Uint8Array(await blob.slice(10, 10 + size).arrayBuffer());
        const { frames: f, pics } = parseV2(head, buf);
        const pick = (...ids) => { for (const i of ids) if (f[i]) return clean(f[i]); return ''; };
        out.title = pick('TIT2', 'TT2'); out.artist = pick('TPE1', 'TP1', 'TPE2', 'TP2'); out.album = pick('TALB', 'TAL');
        out.year = (pick('TDRC', 'TYER', 'TYE').match(/\d{4}/) || [''])[0]; out.track = pick('TRCK', 'TRK').split('/')[0];
        const pic = pics.find(p => p.type === 3) || pics[0];
        if (pic) out.cover = new Blob([pic.bytes], { type: pic.mime });
      }
      if (!out.title && !out.artist && blob.size > 128) {                                              // ID3v1 : 128 derniers octets
        const t = new Uint8Array(await blob.slice(blob.size - 128).arrayBuffer());
        if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
          const f = (a, b) => clean(dec('iso-8859-1', t.subarray(a, b)));
          out.title = f(3, 33); out.artist = f(33, 63); out.album = f(63, 93); out.year = f(93, 97);
        }
      }
    } catch { /* fichier sans étiquette lisible */ }
    if (junk(out.title)) out.title = '';
    out.found = !!(out.title || out.artist || out.album || out.cover);
    return out;
  }

  /* ---------- 2. Nettoyage du nom de fichier ---------- */
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

  /* ---------- 3. Recherche de candidats ---------- */
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

  /* ---------- 4. Pochettes : réduites et stockées dans le morceau (hors ligne) — navigateur uniquement ---------- */
  async function coverToDataURL(src, max = 360) {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
    return cv.toDataURL('image/jpeg', 0.85);
  }

  return { readID3, cleanName, buildQueries, searchItunes, searchMusicBrainz, searchAll, rank, mbQuery, coverToDataURL, tokens };
})();
if (typeof module !== 'undefined') module.exports = Meta;
