#!/usr/bin/env node
/* Static verification for Island Jelly.
 * Extracts the module script from index.html and syntax-checks it,
 * then asserts structural invariants that must hold at every slice.
 * Usage: node scripts/check.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
};

// One module script, one importmap.
check('single module script', (html.match(/<script type="module">/g) || []).length === 1);
check('importmap present', html.includes('<script type="importmap">'));
check('three r165 pinned', html.includes('three@0.165.0'));
check('three/addons/ mapped', html.includes('"three/addons/":'));

// Syntax-check the extracted module with node --check (parses, does not resolve imports).
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log('FAIL no module script found'); process.exit(1); }
const tmp = join(tmpdir(), 'jelly-module-' + process.pid + '.mjs');
writeFileSync(tmp, m[1]);
try {
  execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
  check('module parses (node --check)', true);
} catch (e) {
  check('module parses (node --check)', false, String(e.stderr || e.message).split('\n').slice(0, 6).join('\n'));
}
unlinkSync(tmp);

// Structural invariants.
check('no TODO/FIXME markers', !/TODO|FIXME|XXX/.test(html));
check('no NaN-producing patterns (0/0, Math.sqrt(-', !/0\s*\/\s*0|Math\.sqrt\s*\(\s*-/.test(html));
check('renderer capped pixel ratio 2', /Math\.min\(window\.devicePixelRatio,\s*2\)/.test(html));
check('PCFSoft shadows', /PCFSoftShadowMap/.test(html));
check('NeutralToneMapping', /NeutralToneMapping/.test(html));
check('RoomEnvironment used', /RoomEnvironment/.test(html));
check('OrbitControls used', /OrbitControls/.test(html));
check('shadow map 2048', /2048/.test(html));
check('camera FOV 28', /PerspectiveCamera\(28/.test(html));
check('camera home (15.5, 14.5, 19)', /15\.5,\s*14\.5,\s*19/.test(html));
check('controls: no pan, distance 12-50, polar 1.42',
  /enablePan\s*=\s*false/.test(html) && /minDistance\s*=\s*12/.test(html) &&
  /maxDistance\s*=\s*50/.test(html) && /maxPolarAngle\s*=\s*1\.42/.test(html));
check('flavours present (lagoon, raspberry, lime)',
  /lagoon/.test(html) && /raspberry/.test(html) && /lime/.test(html));
check('debug handle exposed', /window\.__jelly/.test(html));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
