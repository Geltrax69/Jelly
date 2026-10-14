/* Lean runtime check: no screenshots (the headless GPU stalls on ReadPixels).
 * Loads the page, stirs aggressively, reads gap stats, spawns props,
 * reads counters + mesh count, reports console errors.
 * Run: node scripts/browser/lean-verify.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const type = file.endsWith('.html') ? 'text/html' : 'text/javascript';
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const consoleMsgs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('https://cdn.jsdelivr.net/**', async route => {
  const url = new URL(route.request().url());
  const localPath = path.join(ROOT, 'scripts', 'browser', 'vendor', url.pathname.replace('/npm/three@0.165.0/', 'three@0.165.0/'));
  if (fs.existsSync(localPath)) await route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(localPath) });
  else await route.abort();
});
await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('console', m => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  if (m.text().includes('GL Driver Message') || m.text().includes('GPU stall')) return;
  consoleMsgs.push(m.type() + ': ' + m.text());
});
page.on('pageerror', e => consoleMsgs.push('pageerror: ' + e.message));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__jelly)) break;
  if (i === 29) throw new Error('window.__jelly never appeared');
}
await page.waitForTimeout(2000);
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

await page.evaluate(() => { window.__jelly.spawn('pebble'); window.__jelly.spawn('coconut'); });
await page.waitForTimeout(4000);
const counts = await page.evaluate(() => window.__jelly.state.counts);
console.log('counts after spawn: afloat=' + counts.afloat + ' sunk=' + counts.sunk + ' ashore=' + counts.ashore);

const meshes = await page.evaluate(() => {
  let n = 0;
  window.__jelly.scene.traverse(o => { if (o.isMesh) n++; });
  return n;
});
console.log('meshes: ' + meshes);
console.log('console errors/warnings: ' + consoleMsgs.length);
for (const m of consoleMsgs) console.log('  ' + m);

await browser.close();
server.close();
const okGap = stressed.median >= -0.05 && stressed.median <= 0.05 && stressed.max <= 0.16;
const okConsole = consoleMsgs.length === 0;
const okCounts = counts.sunk === 1 && counts.afloat === 1;
console.log('VERDICT gap=' + (okGap ? 'PASS' : 'FAIL') + ' console=' + (okConsole ? 'PASS' : 'FAIL') + ' counts=' + (okCounts ? 'PASS' : 'FAIL'));
process.exit(okGap && okConsole && okCounts ? 0 : 1);
