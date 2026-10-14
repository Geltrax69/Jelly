/* Targeted prop check: spawn a pebble + coconut, then poll until the
 * page's own sim clock (state.time) has advanced 5 s — so the props get
 * 5 s of simulated time regardless of headless frame rate — then read
 * the counters. Run: node scripts/browser/prop-verify.mjs
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
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'text/javascript' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('https://cdn.jsdelivr.net/**', async route => {
  const url = new URL(route.request().url());
  const localPath = path.join(ROOT, 'scripts', 'browser', 'vendor', url.pathname.replace('/npm/three@0.165.0/', 'three@0.165.0/'));
  if (fs.existsSync(localPath)) await route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(localPath) });
  else await route.abort();
});
await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__jelly)) break;
  if (i === 59) throw new Error('window.__jelly never appeared');
}
const t0 = await page.evaluate(() => window.__jelly.state.time);
console.log('sim time at spawn: ' + t0.toFixed(2));
await page.evaluate(() => { window.__jelly.spawn('pebble'); window.__jelly.spawn('coconut'); });
// Poll until 5 s of sim time have passed (or 240 s real time).
let counts = null, simNow = t0;
for (let i = 0; i < 48; i++) {
  await page.waitForTimeout(5000);
  simNow = await page.evaluate(() => window.__jelly.state.time);
  counts = await page.evaluate(() => window.__jelly.state.counts);
  console.log('poll ' + (i + 1) + ': sim=' + simNow.toFixed(2) + ' (+' + (simNow - t0).toFixed(2) + 's) counts afloat=' + counts.afloat + ' sunk=' + counts.sunk + ' ashore=' + counts.ashore);
  if (simNow - t0 >= 5) break;
}
await browser.close();
server.close();
const ok = counts && counts.sunk === 1 && counts.afloat === 1;
console.log('VERDICT counts=' + (ok ? 'PASS' : 'FAIL'));
process.exit(ok ? 0 : 1);
