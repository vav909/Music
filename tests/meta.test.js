'use strict';
/* Tests des étiquettes ID3, du nettoyage des noms de fichiers et de la recherche (réseau simulé) :  node tests/meta.test.js */
const assert = require('assert');
const Meta = require('../meta.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  ÉCHEC', name, '\n       ', e.message); } };

/* ----- fabrique d'étiquettes ID3 pour les tests ----- */
const ss = n => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const b32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const lat1 = s => [...Buffer.from(s, 'latin1')];
const u16 = s => [0xff, 0xfe, ...Buffer.from(s, 'utf16le')];
const frame = (ver, id, data) => ver === 2 ? [...lat1(id), (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255, ...data]
  : [...lat1(id), ...(ver === 4 ? ss(data.length) : b32(data.length)), 0, 0, ...data];
const text = (ver, id, enc, bytes) => frame(ver, id, [enc, ...bytes]);
const tag = (ver, frames, flags = 0) => { const body = frames.flat(); return new Blob([Uint8Array.from([0x49, 0x44, 0x33, ver, 0, flags, ...ss(body.length + 20), ...body, ...new Array(20).fill(0), 0xff, 0xfb, 0x90, 0, 1, 2, 3])]); };
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9], PNG = [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 9, 9];
const apic = (ver, type, mime, img, desc = 'x') => frame(ver, 'APIC', [0, ...lat1(mime), 0, type, ...lat1(desc), 0, ...img]);
const buf = async b => new Uint8Array(await b.arrayBuffer());

(async () => {
  console.log('Étiquettes ID3');
  await t('v2.3 : latin-1, titre, artiste, album, année, piste', async () => {
    const r = await Meta.readID3(tag(3, [text(3, 'TIT2', 0, lat1('Café Noir')), text(3, 'TPE1', 0, lat1('Miles Davis')), text(3, 'TALB', 0, lat1('Kind of Blue')), text(3, 'TYER', 0, lat1('1959')), text(3, 'TRCK', 0, lat1('3/5'))]));
    assert.deepStrictEqual([r.title, r.artist, r.album, r.year, r.track, r.found], ['Café Noir', 'Miles Davis', 'Kind of Blue', '1959', '3', true]);
  });
  await t('v2.4 : UTF-8, plusieurs artistes, date complète', async () => {
    const r = await Meta.readID3(tag(4, [text(4, 'TIT2', 3, [...Buffer.from('Naïma', 'utf8')]), text(4, 'TPE1', 3, [...Buffer.from('Chet Baker\0Gerry Mulligan', 'utf8')]), text(4, 'TDRC', 3, lat1('1953-05-01'))]));
    assert.deepStrictEqual([r.title, r.artist, r.year], ['Naïma', 'Chet Baker / Gerry Mulligan', '1953']);
  });
  await t('v2.3 : UTF-16 avec BOM + pochette (type 3 préférée à une autre image)', async () => {
    const r = await Meta.readID3(tag(3, [text(3, 'TIT2', 1, u16('Ceora')), text(3, 'TPE1', 1, u16('Lee Morgan')), apic(3, 0, 'image/png', PNG), apic(3, 3, 'image/jpeg', JPEG)]));
    assert.strictEqual(r.title, 'Ceora'); assert.strictEqual(r.artist, 'Lee Morgan');
    assert.strictEqual(r.cover.type, 'image/jpeg'); assert.deepStrictEqual([...await buf(r.cover)], JPEG);
  });
  await t('v2.2 : trames à 3 caractères et pochette PNG', async () => {
    const r = await Meta.readID3(tag(2, [text(2, 'TT2', 0, lat1('Maiden Voyage')), text(2, 'TP1', 0, lat1('Herbie Hancock')), text(2, 'TAL', 0, lat1('Maiden Voyage')), frame(2, 'PIC', [0, ...lat1('PNG'), 3, 0, ...PNG])]));
    assert.deepStrictEqual([r.title, r.artist, r.album, r.cover.type], ['Maiden Voyage', 'Herbie Hancock', 'Maiden Voyage', 'image/png']);
  });
  await t('v2.4 : tailles de trame « syncsafe » > 127 octets (grande pochette)', async () => {
    const big = [0xff, 0xd8, 0xff, ...Array.from({ length: 600 }, (_, i) => (i * 7) & 255), 0xff, 0xd9];
    const r = await Meta.readID3(tag(4, [text(4, 'TIT2', 3, lat1('So What')), apic(4, 3, 'image/jpeg', big)]));
    assert.strictEqual(r.title, 'So What'); assert.deepStrictEqual([...await buf(r.cover)], big);
  });
  await t('désynchronisation (FF 00) rétablie', async () => {
    const body = [...frame(3, 'TIT2', [0, ...lat1('Blue'), 0xff, 0x00, ...lat1('Z')])];     // 0xFF 0x00 → 0xFF
    const r = await Meta.readID3(new Blob([Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0x80, ...ss(body.length + 10), ...body, ...new Array(10).fill(0)])]));
    assert.strictEqual(r.title, 'BlueÿZ');
  });
  await t('ID3v1 seule', async () => {
    const v1 = new Uint8Array(128); v1.set(lat1('TAG')); v1.set(lat1('Moanin'), 3); v1.set(lat1('Art Blakey'), 33); v1.set(lat1('Moanin'), 63); v1.set(lat1('1958'), 93);
    const r = await Meta.readID3(new Blob([new Uint8Array(500), v1]));
    assert.deepStrictEqual([r.title, r.artist, r.album, r.year], ['Moanin', 'Art Blakey', 'Moanin', '1958']);
  });
  await t('sans étiquette ou fichier corrompu : pas d\'erreur, found = false', async () => {
    assert.strictEqual((await Meta.readID3(new Blob([new Uint8Array(1000)]))).found, false);
    assert.strictEqual((await Meta.readID3(new Blob([Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 1, 0, 1, 2, 3, 255, 255])]))).found, false);
    assert.strictEqual((await Meta.readID3(new Blob([]))).found, false);
  });
  await t('titre bidon (« Track 01 ») ignoré', async () => {
    const r = await Meta.readID3(tag(3, [text(3, 'TIT2', 0, lat1('Track 01')), text(3, 'TPE1', 0, lat1('Miles Davis'))]));
    assert.strictEqual(r.title, ''); assert.strictEqual(r.artist, 'Miles Davis');
  });

  console.log('Nettoyage des noms de fichiers');
  const ct = (raw, title, strict) => assert.strictEqual(Meta.cleanName(raw, strict).title, title, raw);
  await t('numéros de piste', () => {
    ct('01 - So What.mp3', 'So What'); ct('03. Blue in Green.mp3', 'Blue in Green'); ct('1-05 All Blues.mp3', 'All Blues'); ct('12) Take Five', 'Take Five');
    ct('07_Naima.mp3', 'Naima'); ct('02 Cantaloupe Island.mp3', 'Cantaloupe Island');
  });
  await t('titres qui commencent par un nombre : conservés', () => {
    ct('26-2.mp3', '26-2'); ct('52nd Street Theme.mp3', '52nd Street Theme'); ct('502 Blues.mp3', '502 Blues'); ct('3 Little Words.mp3', '3 Little Words');
  });
  await t('remaster, année, feat, parenthèses', () => {
    ct('Take Five (Remastered 2009).mp3', 'Take Five'); ct('Autumn Leaves - 1958.mp3', 'Autumn Leaves'); ct('So What - Remastered.mp3', 'So What'); ct('So What - Live.mp3', 'So What');
    ct('Giant Steps (alternate take).mp3', 'Giant Steps (alternate take)'); ct('Giant Steps (alternate take).mp3', 'Giant Steps', true);
    ct('Cantaloupe Island feat. Herbie Hancock.mp3', 'Cantaloupe Island'); ct('My Funny Valentine (feat. Gerry) [HD].mp3', 'My Funny Valentine');
    assert.strictEqual(Meta.cleanName('Cantaloupe Island feat. Herbie Hancock').feat, 'Herbie Hancock');
  });
  await t('« Artiste - Titre » séparé, y compris avec des tirets bas', () => {
    const a = Meta.cleanName('03 - Miles Davis - So What.mp3'); assert.deepStrictEqual(a.parts, ['Miles Davis', 'So What']);
    const b = Meta.cleanName('Miles_Davis-So_What.mp3'); assert.deepStrictEqual(b.parts, ['Miles Davis', 'So What']);
    assert.strictEqual(Meta.cleanName('Blue Mitchell - Fungii Mama').title, 'Blue Mitchell - Fungii Mama');
  });
  await t('variantes de recherche : deux ordres, version stricte, sans doublon', () => {
    const q = Meta.buildQueries({ title: '03 - Miles Davis - So What', file: '03 - Miles Davis - So What' });
    const txt = q.map(x => x.text);
    assert.ok(txt.includes('Miles Davis So What')); assert.ok(q.some(x => x.artist === 'So What' && x.title === 'Miles Davis')); assert.ok(txt.includes('Miles Davis - So What'));
    assert.strictEqual(new Set(q.map(x => x.artist + '|' + x.title)).size, q.length);
    assert.strictEqual(Meta.buildQueries({ title: 'Naima', artist: 'John Coltrane', file: 'Naima.mp3' })[0].text, 'John Coltrane Naima');
  });

  console.log('Recherche (réponses simulées au format réel des API)');
  const ITUNES = { resultCount: 4, results: [
    { wrapperType: 'track', kind: 'song', trackId: 1, artistName: 'Pink', collectionName: 'Funhouse', trackName: 'So What', artworkUrl100: 'https://x/a/100x100bb.jpg', releaseDate: '2008-01-01T08:00:00Z', trackTimeMillis: 215000 },
    { wrapperType: 'track', kind: 'song', trackId: 2, artistName: 'Miles Davis', collectionName: 'Kind of Blue', trackName: 'So What', artworkUrl100: 'https://x/b/100x100bb.jpg', releaseDate: '1959-08-17T07:00:00Z', trackTimeMillis: 562000 },
    { wrapperType: 'track', kind: 'song', trackId: 3, artistName: 'Jazz Karaoke Band', collectionName: 'Karaoke: So What', trackName: 'So What (Karaoke Version)', artworkUrl100: 'https://x/c/100x100bb.jpg', releaseDate: '2010-01-01T08:00:00Z', trackTimeMillis: 560000 },
    { wrapperType: 'track', kind: 'song', trackId: 4, artistName: 'Miles Davis', collectionName: 'Live in Stockholm', trackName: 'So What - Live', artworkUrl100: 'https://x/d/100x100bb.jpg', releaseDate: '1960-03-22T08:00:00Z', trackTimeMillis: 690000 }] };
  const MB = { recordings: [{ id: 'abc', title: 'So What', length: 562000, 'artist-credit': [{ name: 'Miles Davis', joinphrase: '', artist: { name: 'Miles Davis' } }],
    releases: [{ id: 'rel9', title: 'Kind of Blue', status: 'Official', date: '1959-08-17', 'release-group': { 'primary-type': 'Album' } }] }] };
  const ok = j => async () => ({ ok: true, json: async () => j });
  const router = (it, mb, calls = []) => async url => { calls.push(url); return (url.includes('itunes') ? it : mb)(); };
  await t('iTunes : champs lus, pochette 600 px', async () => {
    const r = await Meta.searchItunes('miles davis so what', { fetch: ok(ITUNES) });
    assert.strictEqual(r.length, 4); assert.strictEqual(r[1].cover, 'https://x/b/600x600bb.jpg'); assert.strictEqual(r[1].duration, 562); assert.strictEqual(r[1].year, '1959');
  });
  await t('MusicBrainz : artiste composé, album officiel, pochette Cover Art Archive', async () => {
    const r = await Meta.searchMusicBrainz({ artist: 'Miles Davis', title: 'So What' }, { fetch: ok(MB) });
    assert.deepStrictEqual([r[0].artist, r[0].album, r[0].year, r[0].cover], ['Miles Davis', 'Kind of Blue', '1959', 'https://coverartarchive.org/release/rel9/front-500']);
    assert.ok(Meta.mbQuery({ artist: 'Miles "Dewey" Davis', title: 'So What' }).includes('\\"Dewey\\"'));
  });
  await t('classement : le bon morceau d\'abord (artiste du nom de fichier, durée du fichier), karaoké en dernier', async () => {
    const calls = [], r = await Meta.searchAll({ title: '03 - Miles Davis - So What', file: '03 - Miles Davis - So What.mp3', duration: 561 }, { fetch: router(ok(ITUNES), ok(MB), calls), pause: 0 });
    assert.strictEqual(r.candidates[0].artist, 'Miles Davis'); assert.strictEqual(r.candidates[0].album, 'Kind of Blue'); assert.strictEqual(r.candidates[0].sameLength, true);
    assert.ok(r.candidates.findIndex(c => /Karaoke/.test(c.album)) > 1, 'karaoké trop haut');
    assert.ok(r.candidates.findIndex(c => c.artist === 'Pink') > 0);
  });
  await t('une source en panne : l\'autre répond, l\'erreur est signalée', async () => {
    const r = await Meta.searchAll({ title: 'So What', file: 'Miles Davis - So What.mp3' }, { fetch: router(async () => { throw new Error('réseau'); }, ok(MB)), pause: 0 });
    assert.ok(r.candidates.length >= 1); assert.ok(r.errors.some(e => e.source === 'iTunes'));
  });
  await t('tout en panne : liste vide et erreurs, pas d\'exception', async () => {
    const r = await Meta.searchAll({ title: 'So What' }, { fetch: async () => ({ ok: false, status: 503 }), pause: 0 });
    assert.strictEqual(r.candidates.length, 0); assert.ok(r.errors.length >= 2);
  });
  await t('saisie libre de l\'utilisatrice utilisée telle quelle', async () => {
    const calls = []; await Meta.searchAll({ title: 'x', query: 'miles davis so what' }, { fetch: router(ok(ITUNES), ok(MB), calls), pause: 0 });
    assert.ok(decodeURIComponent(calls[0]).includes('term=miles davis so what'));
  });

  if (fails) { console.log(`\n${fails} test(s) en échec`); process.exit(1); }
  console.log('\nTous les tests passent.');
})();
