/* Runtime verification for Island Jelly.
 * Serves the repo over HTTP, loads it in headless Chromium, and reports:
 *  - console errors / warnings (incl. NaN)
 *  - screenshots: full view + two Joe close-ups (camera moved via the
 *    exposed OrbitControls, not clipped screenshots — clipped ReadPixels
 *    stalls the headless GPU in this sandbox)
 *  - gap stats at rest and under aggressive stirring
 *  - spawn + counters (pebble sinks, coconut floats)
 *  - mesh count (draw-call lower bound)
 * Run: node scripts/browser/verify.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'renders', 'verify');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const consoleMsgs = [];
// No network for the browser: three.js + addons are served from a local
// mirror of the exact jsDelivr files (scripts/browser/vendor/), and the
// Google Fonts stylesheet is stubbed empty. The page logic runs against
// the real three.js r165; only the delivery differs. This keeps the
// check deterministic and independent of the sandbox egress proxy,
// whose CONNECT tunnel headless Chromium cannot use.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('https://cdn.jsdelivr.net/**', async route => {
  const url = new URL(route.request().url());
  const localPath = path.join(ROOT, 'scripts', 'browser', 'vendor', url.pathname.replace('/npm/three@0.165.0/', 'three@0.165.0/'));
  if (fs.existsSync(localPath)) {
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(localPath) });
  } else {
    await route.abort();
  }
});
await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('console', m => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  // Headless-GPU driver chatter (ReadPixels stalls), not an app error.
  if (m.text().includes('GL Driver Message') || m.text().includes('GPU stall')) return;
  consoleMsgs.push(m.type() + ': ' + m.text());
  console.log('CONSOLE', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', e => { consoleMsgs.push('pageerror: ' + e.message); console.log('PAGEERROR', e.message); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__jelly)) break;
  if (i === 29) throw new Error('window.__jelly never appeared');
}
await page.waitForTimeout(2000);

// Full view.
await page.screenshot({ timeout: 120000, path: path.join(OUT, 'full.png') });
console.log('full screenshot ok');

// Joe close-ups: move the camera via the exposed OrbitControls.
async function joeCloseup(name, offset) {
  await page.evaluate((off) => {
    const j = window.__jelly;
    const surfer = j.diorama.children.find(c => c.type === 'Group' && Math.abs(c.scale.x - 1.35) < 0.01);
    const v = new j.THREE.Vector3();
    surfer.getWorldPosition(v);
    // Joe's head is ~1.5 local units above the board; aim at the head.
    // Drop minDistance first: the default 12 would clamp the close-up away.
    v.y += 1.2;
    j.controls.minDistance = 1;
    j.controls.target.copy(v);
    j.camera.position.set(v.x + off[0], v.y + off[1], v.z + off[2]);
    j.controls.update();
  }, offset);
  await page.waitForTimeout(500);
  await page.screenshot({ timeout: 120000, path: path.join(OUT, name) });
  console.log(name + ' ok');
}
await joeCloseup('joe-front34.png', [2.2, 1.0, 3.0]); // front 3/4
await joeCloseup('joe-side.png', [4.0, 0.6, 0.5]);    // side

const rest = await page.evaluate(() => window.__jelly.getGapStats());
console.log('gap at rest: median=' + rest.median.toFixed(4) + ' max=' + rest.max.toFixed(4));

// Aggressive stirring: 12 fast drags across the water.
for (let i = 0; i < 12; i++) {
  const y = 380 + (i % 4) * 30;
  await page.mouse.move(300, y);
  await page.mouse.down();
  await page.mouse.move(950, y + 40, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(60);
}
await page.waitForTimeout(1500);
const stressed = await page.evaluate(() => window.__jelly.getGapStats());
console.log('gap stressed: median=' + stressed.median.toFixed(4) + ' max=' + stressed.max.toFixed(4));

// Spawn a pebble + a coconut, wait, read counters.
await page.evaluate(() => { window.__jelly.spawn('pebble'); window.__jelly.spawn('coconut'); });
await page.waitForTimeout(4000);
const counts = await page.evaluate(() => window.__jelly.state.counts);
console.log('counts after spawn: afloat=' + counts.afloat + ' sunk=' + counts.sunk + ' ashore=' + counts.ashore);

// Mesh count (draw-call lower bound; shadow pass roughly doubles it).
const meshes = await page.evaluate(() => {
  let n = 0;
  window.__jelly.scene.traverse(o => { if (o.isMesh) n++; });
  return n;
});
console.log('meshes: ' + meshes);

// Debug overlay loads without errors.
await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);
await page.screenshot({ timeout: 120000, path: path.join(OUT, 'debug.png') });
console.log('debug screenshot ok');

console.log('console errors/warnings: ' + consoleMsgs.length);
for (const m of consoleMsgs) console.log('  ' + m);
const nan = consoleMsgs.filter(m => m.includes('NaN'));
console.log('NaN messages: ' + nan.length);

await browser.close();
server.close();

// Verdict.
const okGap = stressed.median >= -0.05 && stressed.median <= 0.05 && stressed.max <= 0.16;
const okConsole = consoleMsgs.length === 0;
const okCounts = counts.sunk === 1 && counts.afloat === 1;
console.log('VERDICT gap=' + (okGap ? 'PASS' : 'FAIL') + ' console=' + (okConsole ? 'PASS' : 'FAIL') + ' counts=' + (okCounts ? 'PASS' : 'FAIL'));
process.exit(okGap && okConsole && okCounts ? 0 : 1);
