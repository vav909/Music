'use strict';
/* Lecture des étiquettes intégrées au fichier MP3 (ID3v2 puis ID3v1) : titre, artiste, album, pochette.
   Aucune dépendance. Renvoie null si le fichier n'en contient pas. */

function id3Text(b, enc) {
  if (!b.length) return '';
  let s;
  try {
    if (enc === 1) s = new TextDecoder(b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-16le').decode(b);
    else if (enc === 2) s = new TextDecoder('utf-16be').decode(b);
    else if (enc === 3) s = new TextDecoder('utf-8').decode(b);
    else s = new TextDecoder('windows-1252').decode(b);
  } catch { s = ''; }
  return s.replace(/^﻿/, '').replace(/\0+$/g, '').split('\0')[0].trim();
}
// fin d'une chaîne terminée par un zéro (1 octet en latin1/UTF-8, 2 en UTF-16)
function id3End(b, from, enc) {
  const w = enc === 1 || enc === 2 ? 2 : 1;
  for (let i = from; i + w <= b.length; i += w) { if (b[i] === 0 && (w === 1 || b[i + 1] === 0)) return i; }
  return b.length;
}
const syncsafe = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);

async function readTags(file) {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  const out = { title: '', artist: '', album: '', coverBytes: null, coverMime: '' };
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {                 // "ID3"
    const ver = head[3], total = syncsafe(head, 6);
    const b = new Uint8Array(await file.slice(10, 10 + Math.min(total, 12e6)).arrayBuffer());
    let o = 0;
    if (head[5] & 0x40 && b.length > 4) o = ver === 4 ? syncsafe(b, 0) : 4 + ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]);   // en-tête étendu
    const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
    while (o + hdr <= b.length) {
      const id = String.fromCharCode(...b.subarray(o, o + idLen));
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const sz = ver === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5]
        : ver === 4 ? syncsafe(b, o + 4) : ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0;
      const f = b.subarray(o + hdr, o + hdr + sz); o += hdr + sz;
      if (!f.length) continue;
      const enc = f[0];
      if (/^(TIT2|TT2)$/.test(id)) out.title = id3Text(f.subarray(1), enc);
      else if (/^(TPE1|TP1)$/.test(id)) out.artist = id3Text(f.subarray(1), enc);
      else if (/^(TALB|TAL)$/.test(id)) out.album = id3Text(f.subarray(1), enc);
      else if (/^(APIC|PIC)$/.test(id) && !out.coverBytes) {
        let p = 1, mime;
        if (id === 'PIC') { mime = 'image/' + String.fromCharCode(...f.subarray(1, 4)).toLowerCase().replace('jpg', 'jpeg'); p = 4; }
        else { const e = id3End(f, 1, 0); mime = String.fromCharCode(...f.subarray(1, e)).toLowerCase(); p = e + 1; }
        p += 1;                                                                  // type d'image
        const e2 = id3End(f, p, enc); p = e2 + (enc === 1 || enc === 2 ? 2 : 1);   // description
        const data = f.subarray(p);
        if (data.length > 100) { out.coverBytes = data; out.coverMime = /^image\//.test(mime) ? mime : (data[0] === 0x89 ? 'image/png' : 'image/jpeg'); }
      }
    }
  } else {
    const size = file.size;
    if (size > 128) {                                                            // ID3v1 : 128 derniers octets
      const t = new Uint8Array(await file.slice(size - 128).arrayBuffer());
      if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
        const txt = (a, z) => id3Text(t.subarray(a, z), 0);
        out.title = txt(3, 33); out.artist = txt(33, 63); out.album = txt(63, 93);
      }
    }
  }
  if (!out.title && !out.artist && !out.album && !out.coverBytes) return null;
  return out;
}

// pochette réduite (≈ 300 px, JPEG) pour rester légère dans le stockage et dans l'export
async function coverToDataUrl(bytes, mime) {
  try {
    const blob = new Blob([bytes], { type: mime });
    const bmp = await createImageBitmap(blob), k = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  } catch { return ''; }
}
