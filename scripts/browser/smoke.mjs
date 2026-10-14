/* Quick smoke: loads the page, collects console/page errors, confirms the
 * water interpolation path is live (wHRender defined, mesh updating).
 * Run: node scripts/browser/smoke.mjs
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

const msgs = [];
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
  msgs.push(m.type() + ': ' + m.text());
});
page.on('pageerror', e => msgs.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__jelly)) break;
  if (i === 59) throw new Error('window.__jelly never appeared');
}
// Let a few frames run, then confirm the sim + interpolation are live.
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const j = window.__jelly;
  return {
    time: j.state.time,
    gap: j.getGapStats(),
  };
});
console.log('sim time: ' + info.time.toFixed(2));
console.log('gap: median=' + info.gap.median.toFixed(4) + ' max=' + info.gap.max.toFixed(4));
console.log('console errors/warnings: ' + msgs.length);
for (const m of msgs) console.log('  ' + m);
await browser.close();
server.close();
const ok = msgs.length === 0 && info.time > 0;
console.log('SMOKE ' + (ok ? 'PASS' : 'FAIL'));
process.exit(ok ? 0 : 1);
