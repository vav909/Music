// Exporte les écrans principaux de la v2 en SVG modifiables (rectangles, textes Inter, pictos, barres du son)
// à partir de l'app réelle lancée en vue téléphone (393 × 852). Usage :
//   python3 -m http.server 8123 &            (depuis la racine du dépôt)
//   S=<dossier avec deux mp3 de test> node design/exporter_ecrans.js
// Le résultat est écrit dans design/v2-ecrans/. Installer la police Inter (v2/fonts/inter.woff2) pour que les textes s'affichent comme dans l'app.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'design/v2-ecrans');
const S = process.env.S, URL = 'http://localhost:8123/v2/', W = 393, H = 852;
fs.mkdirSync(out, { recursive: true });

// enregistre les dessins du canvas (barres du son) pour les exporter en vectoriel
const INIT = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) {
    const c = orig.call(this, t, ...a);
    if (t !== '2d' || c.__rec) return c;
    c.__rec = 1; const log = this.__log = [], P = CanvasRenderingContext2D.prototype; let rr = null;
    c.scale = function (...x) { log.length = 0; return P.scale.apply(this, x); };
    c.fillRect = function (x, y, w, h) { log.push(['r', x, y, w, h, this.fillStyle]); return P.fillRect.call(this, x, y, w, h); };
    c.beginPath = function () { rr = null; return P.beginPath.call(this); };
    c.roundRect = function (x, y, w, h, r) { rr = [x, y, w, h, r]; return P.roundRect.call(this, x, y, w, h, r); };
    c.fill = function (...x) { if (rr) log.push(['rr', ...rr, this.fillStyle]); return P.fill.apply(this, x); };
    c.fillText = function (tx, x, y) { log.push(['t', tx, x, y, this.fillStyle, this.font]); return P.fillText.call(this, tx, x, y); };
    return c;
  };
};

// dessine la page courante en SVG
const DOM2SVG = ({ W, H }) => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let n = 0, defs = '';
  const col = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return { c: c, a: 1 }; const p = m[1].split(',').map(x => parseFloat(x)); const a = p.length > 3 ? p[3] : 1; return { c: '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), a }; };
  const num = v => Math.round(v * 100) / 100;
  const visible = (el, cs, r) => cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden;
  const radii = (cs, r) => { const f = v => v.endsWith('%') ? Math.min(r.width, r.height) * parseFloat(v) / 100 : parseFloat(v) || 0; return Math.min(f(cs.borderTopLeftRadius), Math.min(r.width, r.height) / 2); };
  const nameOf = el => (el.id || [...el.classList].find(c => c) || el.tagName.toLowerCase()).replace(/[^\w-]/g, '_') + '-' + (++n);
  function text(node, el, cs, clipEl) {
    const s = node.textContent; if (!s.trim()) return '';
    const rg = document.createRange(), lines = []; let cur = null;
    for (let i = 0; i < s.length; i++) {
      rg.setStart(node, i); rg.setEnd(node, i + 1); const r = rg.getClientRects()[0]; if (!r || (r.width === 0 && s[i] !== ' ')) continue;
      if (!cur || Math.abs(r.top - cur.top) > 2) { cur = { top: r.top, h: r.height, left: r.left, right: r.right, t: '' }; lines.push(cur); }
      cur.t += s[i]; cur.right = r.right;
    }
    const fs = parseFloat(cs.fontSize), color = col(cs.color), cr = clipEl ? clipEl.getBoundingClientRect() : null;
    const ell = cs.textOverflow === 'ellipsis' && cr;
    return lines.map(l => {
      let t = l.t.replace(/\s+$/, ''); if (!t) return '';
      if (ell && l.right > cr.right + 0.5) { // texte coupé par « … »
        let k = t.length; const probe = document.createRange();
        while (k > 1) { probe.setStart(node, s.indexOf(t) + k - 1); probe.setEnd(node, s.indexOf(t) + k); const rr = probe.getClientRects()[0]; if (rr && rr.right <= cr.right - fs * 0.9) break; k--; }
        t = t.slice(0, k).replace(/\s+$/, '') + '…';
      }
      const y = l.top + 0.969 * fs * (l.h / (1.21 * fs));
      return `<text x="${num(l.left)}" y="${num(y)}" font-family="Inter, system-ui, sans-serif" font-size="${num(fs)}" font-weight="${cs.fontWeight}" fill="${color.c}"${color.a < 1 ? ` fill-opacity="${color.a}"` : ''} xml:space="preserve">${esc(t)}</text>`;
    }).join('');
  }
  function rangeInput(el, r, cs) {
    const min = +el.min || 0, max = +el.max || 100, f = (el.value - min) / (max - min), cx = r.left + 11 + f * (r.width - 22), cy = r.top + r.height / 2;
    const big = el.classList.contains('pl-tempo'), acc = '#636487', thumb = big ? 11 : 8, cx2 = r.left + thumb + f * (r.width - 2 * thumb);
    return `<rect x="${num(r.left)}" y="${num(cy - 2)}" width="${num(r.width)}" height="4" rx="2" fill="#dfe3e8"/><rect x="${num(r.left)}" y="${num(cy - 2)}" width="${num(cx2 - r.left)}" height="4" rx="2" fill="${acc}"/><circle cx="${num(cx2)}" cy="${num(cy)}" r="${thumb}" fill="${acc}"/>`;
  }
  function canvasOps(cv, r, clip) {
    const log = cv.__log || []; const o = [];
    for (const l of log) {
      const f = col(l[l.length - (l[0] === 't' ? 2 : 1)] || '#000');
      if (l[0] === 'r') o.push(`<rect x="${num(r.left + l[1])}" y="${num(r.top + l[2])}" width="${num(l[3])}" height="${num(l[4])}" fill="${f.c}"${f.a < 1 ? ` fill-opacity="${f.a}"` : ''}/>`);
      else if (l[0] === 'rr') o.push(`<rect x="${num(r.left + l[1])}" y="${num(r.top + l[2])}" width="${num(l[3])}" height="${num(l[4])}" rx="${num(typeof l[5] === 'number' ? l[5] : (l[5] && l[5][0]) || 0)}" fill="${f.c}"/>`);
      else { const fsz = parseFloat(l[5]) || 11; o.push(`<text x="${num(r.left + l[2])}" y="${num(r.top + l[3] - fsz * 0.24)}" font-family="Inter, system-ui, sans-serif" font-size="${fsz}" fill="${f.c}">${esc(l[1])}</text>`); }
    }
    return `<g id="barres-du-son-${++n}">${o.join('')}</g>`;
  }
  function walk(el, late, isLate) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) return '';
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return '';
    if (cs.position === 'fixed' && !isLate) { late.push(el); return ''; }
    if (parseFloat(cs.opacity) === 0) return '';
    let s = '';
    const tag = el.tagName;
    if (tag === 'svg') {
      const clone = el.cloneNode(true); const colr = col(cs.color).c;
      let h = clone.outerHTML.replace(/currentColor/g, colr);
      if (!/\sx="/.test(h.slice(0, h.indexOf('>')))) h = h.replace('<svg', `<svg x="${num(r.left)}" y="${num(r.top)}"`);
      h = h.replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${num(r.width)}"`).replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${num(r.height)}"`);
      if (!/\swidth=/.test(h.slice(0, h.indexOf('>')))) h = h.replace('<svg', `<svg width="${num(r.width)}" height="${num(r.height)}"`);
      return h.replace(/\sclass="[^"]*"/, '').replace(/\sstyle="[^"]*"/, '');
    }
    if (tag === 'CANVAS') return canvasOps(el, r);
    const clip = (cs.overflow !== 'visible' || cs.overflowX !== 'visible') && (radii(cs, r) > 0 || el.classList.contains('tl-scroll') || el.id === 'sheet' || el.id === 'content');
    const rad = radii(cs, r), bg = col(cs.backgroundColor), op = parseFloat(cs.opacity);
    let box = '';
    if (r.width > 0 && r.height > 0) {
      if (bg.a > 0) box += `<rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" rx="${num(rad)}" fill="${bg.c}"${bg.a < 1 ? ` fill-opacity="${bg.a}"` : ''}/>`;
      if (/rgba\(255, 255, 255, 0\.6\)/.test(cs.backgroundImage)) box += `<rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" rx="${num(rad)}" fill="#ffffff" fill-opacity="0.6"/>`;
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(cs['border' + k + 'Width']) || 0), bc = col(cs.borderTopColor);
      if (bw.some(v => v > 0) && bc.a > 0) {
        if (bw.every(v => v === bw[0]) && cs.borderTopStyle !== 'none') { const w = bw[0]; box += `<rect x="${num(r.left + w / 2)}" y="${num(r.top + w / 2)}" width="${num(r.width - w)}" height="${num(r.height - w)}" rx="${num(Math.max(0, rad - w / 2))}" fill="none" stroke="${bc.c}"${bc.a < 1 ? ` stroke-opacity="${bc.a}"` : ''} stroke-width="${w}"/>`; }
        else { const L = (x1, y1, x2, y2, w, c) => w > 0 ? `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${col(c).c}" stroke-width="${w}"/>` : ''; box += L(r.left, r.top + bw[0] / 2, r.right, r.top + bw[0] / 2, bw[0], cs.borderTopColor) + L(r.left, r.bottom - bw[2] / 2, r.right, r.bottom - bw[2] / 2, bw[2], cs.borderBottomColor); }
      }
    }
    s += box;
    if (tag === 'IMG') { const id = 'c' + (++n); s += `<clipPath id="${id}"><rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" rx="${num(rad)}"/></clipPath><image x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="${el.src}"/>`; return `<g id="${nameOf(el)}">${s}</g>`; }
    if (tag === 'INPUT' && el.type === 'range') return `<g id="${nameOf(el)}">${rangeInput(el, r, cs)}</g>`;
    if (tag === 'INPUT' || tag === 'SELECT') {
      const v = tag === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent : '') : el.value, ph = !v && el.placeholder, t = v || el.placeholder || '';
      if (t) { const fsz = parseFloat(cs.fontSize), pl = parseFloat(cs.paddingLeft) || 0; s += `<text x="${num(r.left + pl)}" y="${num(r.top + r.height / 2 + fsz * 0.35)}" font-family="Inter, system-ui, sans-serif" font-size="${fsz}" fill="${ph ? '#757575' : col(cs.color).c}">${esc(t)}</text>`; }
      if (tag === 'SELECT') s += `<path d="M${num(r.right - 30)} ${num(r.top + r.height / 2 - 3)}l6 6 6-6" fill="none" stroke="#636487" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      return `<g id="${nameOf(el)}">${s}</g>`;
    }
    if (tag === 'SUMMARY' && el.parentElement.classList.contains('sec2')) {
      const open = el.parentElement.open, x = r.right - 18, y = r.top + r.height / 2;
      s += `<path d="M${num(x - 9)} ${num(y + (open ? 4 : -4))}l9 ${open ? -8 : 8} 9 ${open ? 8 : -8}" fill="none" stroke="#636487" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) s += text(ch, el, cs, el);
      else if (ch.nodeType === 1) s += walk(ch, late, isLate);
    }
    let g = s;
    if (clip) { const id = 'c' + (++n); defs += `<clipPath id="${id}"><rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" rx="${num(rad)}"/></clipPath>`; g = `<g clip-path="url(#${id})">${s}</g>`; }
    if (!g) return '';
    return `<g id="${nameOf(el)}"${op < 1 ? ` opacity="${op}"` : ''}>${g}</g>`;
  }
  const late = [], bg = col(getComputedStyle(document.body).backgroundColor);
  let body = '';
  for (const ch of document.body.children) body += walk(ch, late);
  for (let i = 0; i < late.length; i++) body += walk(late[i], late, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="${bg.c}"/>${body}</svg>`;
};

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInput', [S + '/long.mp3', S + '/tagged.mp3']); await p.waitForSelector('.grp-wrap'); await p.waitForTimeout(800);
  const cover = 'data:image/jpeg;base64,' + fs.readFileSync(S + '/cover.jpg').toString('base64');
  await p.evaluate(async cover => {
    const [a, b2] = S.songs.slice().sort((x, y) => x.title.localeCompare(y.title));
    const long = S.songs.find(x => x.file && /long/.test(x.file)) || a, tag = S.songs.find(x => x !== long);
    Object.assign(long, { title: "Feel Like Makin' Love", artist: 'Hubert Laws', album: 'The San Francisco Concert', cover });
    Object.assign(tag, { title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue' });
    const mk = (n, i, s, e, t, f, st, o) => ({ id: uid(), name: n, instrument: i, soloist: '', start: s, end: e, tempo: t, fav: f, status: st, color: COLORS[0], ord: o });
    long.solos = [mk('Solo ok', 'Flûte', 20, 31, 60, true, 'done', 0), mk('Solo 2', 'Saxophone ténor', 40, 55, 100, true, 'doing', 1), mk('Solo 3', 'Flûte', 62, 76, 75, false, 'todo', 2)];
    tag.solos = [mk('Intro', 'Trompette', 3, 12, 100, false, '', 0)];
    await saveSongNow(long); await saveSongNow(tag); render();
  }, cover);
  const shot = async name => { await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await p.waitForTimeout(300);
    const svg = await p.evaluate(DOM2SVG, { W, H }); fs.writeFileSync(path.join(out, name + '.svg'), svg); console.log(name, Math.round(svg.length / 1024) + ' Ko'); };

  // 1. écran de chargement
  fs.writeFileSync(path.join(out, '01-chargement.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><g transform="translate(${(W - 360) / 2} ${(H - 360) / 2}) scale(0.9)">${fs.readFileSync(path.join(root, 'v2/loops.svg'), 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g></svg>`); console.log('01-chargement');
  // 2. accueil, un morceau déplié
  await p.evaluate(() => { S.exp.add(S.songs.find(x => x.title === "Feel Like Makin' Love").id); render(); }); await shot('02-accueil');
  // 3. accueil, filtres ouverts
  await p.evaluate(() => { S.showFilters = true; render(); }); await shot('03-accueil-filtres');
  await p.evaluate(() => { S.showFilters = false; render(); });
  // 4. page du morceau : un solo déplié
  await p.evaluate(id => openSong(id), await p.evaluate(() => S.songs.find(x => x.title === "Feel Like Makin' Love").id)); await p.waitForSelector('.tl-inner'); await p.waitForTimeout(600);
  await p.evaluate(() => { const so = S.song.solos.find(x => x.name === 'Solo ok'); pickSolo(so.id, false); S.openId = so.id; renderPanel(); audio.currentTime = 24; updatePlayhead(true); }); await shot('04-morceau-solo-deplie');
  // 5. page du morceau : bandeau réduit, solos repliés
  await p.evaluate(() => { S.openId = null; renderPanel(); setFull(false, false); }); await p.waitForTimeout(300); await shot('05-morceau-bandeau-reduit');
  await p.evaluate(() => setFull(true, false));
  // 6-8. détails du solo
  await p.evaluate(() => { pickSolo(S.song.solos.find(x => x.name === 'Solo ok').id, false); openSheet(); document.getElementById('topbar').style.display = 'none'; document.getElementById('content').style.display = 'none'; }); await p.waitForSelector('#scoreWrap svg', { state: 'attached', timeout: 90000 }).catch(() => {}); await p.waitForTimeout(1500);
  await shot('06-details-solo-off');
  await p.click('#sbScore'); await p.waitForTimeout(800); await shot('07-details-solo-partition');
  await p.click('#sbScore');
  await p.evaluate(async () => { const solo = curSolo(), c = tkCtx(), buf = c.createBuffer(1, c.sampleRate * 11, c.sampleRate); const t = { id: 'demo1', songId: S.song.id, soloId: solo.id, at: Date.now(), duration: 11, mime: 'audio/wav', blob: tkWav(buf), offsetMs: 40, volTake: 100, volSolo: 70, rate: 60 };
    await tkPut(t); await tkPut({ ...t, id: 'demo2', at: Date.now() - 86400000, offsetMs: 0, volSolo: 50 }); });
  await p.evaluate(() => tkMount()); await p.click('#sbRec'); await p.waitForTimeout(800); await p.evaluate(() => { document.querySelectorAll('details.tk-off').forEach((d, i) => { if (i === 0) d.open = true; }); }); await shot('08-details-solo-prises');
  fs.copyFileSync(path.join(root, 'design/loops-icone.svg'), path.join(out, '09-icone-app.svg'));
  console.log('erreurs :', errs); await b.close();
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
