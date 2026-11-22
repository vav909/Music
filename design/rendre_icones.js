// Rend design/loops-icone.svg en PNG : v2/icon-192.png et v2/icon-512.png (Playwright déjà installé)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const svg = fs.readFileSync(path.join(root, 'design/loops-icone.svg'), 'utf8');
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0">${svg.replace(/width="\d+" height="\d+"/, `width="${s}" height="${s}"`)}</body>`);
    await p.screenshot({ path: path.join(root, `v2/icon-${s}.png`) });
  }
  await b.close();
})();
