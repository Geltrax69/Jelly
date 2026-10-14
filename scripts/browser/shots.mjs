/* Fresh README screenshots: full view + two Joe close-ups. Skips the
 * debug-overlay shot (its ReadPixels stalls on the headless GPU).
 * Run: node scripts/browser/shots.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'renders', 'verify');
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
page.on('pageerror', e => console.log('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__jelly)) break;
  if (i === 59) throw new Error('window.__jelly never appeared');
}
await page.waitForTimeout(2000);

await page.screenshot({ timeout: 120000, path: path.join(OUT, 'full.png') });
console.log('full.png ok');

async function joeCloseup(name, offset) {
  await page.evaluate((off) => {
    const j = window.__jelly;
    const surfer = j.diorama.children.find(c => c.type === 'Group' && Math.abs(c.scale.x - 1.35) < 0.01);
    const v = new j.THREE.Vector3();
    surfer.getWorldPosition(v);
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
await joeCloseup('joe-front34.png', [2.2, 1.0, 3.0]);
await joeCloseup('joe-side.png', [4.0, 0.6, 0.5]);

await browser.close();
server.close();
console.log('SHOTS DONE');
