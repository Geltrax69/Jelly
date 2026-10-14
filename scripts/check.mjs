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
check('terrain heightfield (160 res)', /PlaneGeometry\(10,\s*10,\s*RES\s*-\s*1,\s*RES\s*-\s*1\)/.test(html) && /const RES = 160/.test(html));
check('terrain shader: wet darkening + waterline', /wet/.test(html) && /wline/.test(html));
check('terrain shader: caustics + laplacian texture', /uCausticTex/.test(html) && /lapTex/.test(html));
check('strata canvas texture', /makeStrataTexture/.test(html) && /CanvasTexture/.test(html));
check('four sediment sides + underside', (html.match(/mkSide\(/g) || []).length === 4 && /rotation\.x = Math\.PI \/ 2/.test(html));
check('rim pebbles', /IcosahedronGeometry/.test(html));
check('palms: 3 trunks + crowns', (html.match(/buildPalm\(/g) || []).length === 4 && /CatmullRomCurve3/.test(html));
check('palm fronds merged', /mergeGeometries/.test(html) && /buildFrondGeometry/.test(html));
check('palm coconuts (3 per crown)', /SphereGeometry\(0\.085/.test(html));
check('wave sim: 100x100, fixed 1/120 step', /const WN = 100/.test(html) && /WSTEP = 1 \/ 120/.test(html));
check('wave sim: laplacian + spring + damping + land mask', /lap/.test(html) && /wEqArr/.test(html) && /wLand/.test(html));
check('tilt spring + tilted equilibrium', /tilt\.vrx/.test(html) && /wEqA/.test(html) && /makeRotationFromEuler/.test(html));
check('water surface: transmission, IOR 1.33, ripple normal map', /transmission: 1/.test(html) && /ior: 1\.33/.test(html) && /makeRippleNormalMap/.test(html));
check('skirt + highlight lines', /skirtMat/.test(html) && /hiMat/.test(html));
check('stir + tilt pointer modes', /dragMode/.test(html) && /disturb\(px/.test(html));
check('drips', /wDripTimer/.test(html));
check('sampleWater exposed for surfing + objects', /function sampleWater/.test(html));
check('fur shader: shells, droop, strand discard, root-to-tip shade',
  /furMaterial/.test(html) && /transformed\.y -= uGrav/.test(html) && /discard/.test(html) && /mix\(0\.58, 1\.07/.test(html));
check('fur cache + base-only shadows', /furCache/.test(html) && /castShadow = k === 0/.test(html));
check('fur density rep ~200-250', /rep = 220/.test(html));
check('surfer hierarchy: surfer > boardTilt > rooster > bodyGroup',
  /surfer/.test(html) && /boardTilt/.test(html) && /rooster/.test(html) && /bodyGroup/.test(html));
check('surfboard: flattened sphere + coral stripe + fin',
  /boardMesh\.scale\.set\(0\.34, 0\.045, 0\.82\)/.test(html) && /stripe\.scale\.set\(0\.10/.test(html) && /ConeGeometry\(0\.06, 0\.18/.test(html));
check('legs: felt tube + knee + 4 splayed toes', /buildLeg/.test(html) && /CapsuleGeometry\(0\.016, 0\.14/.test(html));
check('slouch: shorts + torso + belly + neck',
  /makeFur\(shortsGeo/.test(html) && /makeFur\(torsoGeo/.test(html) && /makeFur\(bellyGeo/.test(html) && /neckCurve/.test(html));
check('head: sphere + tuft + comb (blade + 5 lobes)',
  /headGroup/.test(html) && /CapsuleGeometry\(0\.035/.test(html) && /heights = \[0\.10, 0\.14, 0\.16, 0\.13, 0\.09\]/.test(html));
check('eyes: bulging white, heavy lids 56%, rim, lower lid, pupil + highlight',
  /buildEye/.test(html) && /1\.76/.test(html) && /TorusGeometry/.test(html) && /Math\.PI - 0\.5/.test(html) && /pupil/.test(html));
check('beak: deformed cone, hook bend, hinged lower beak, tongue, wattles',
  /buildBeakGeo/.test(html) && /Math\.pow\(t, 2\.4\)/.test(html) && /jawGroup/.test(html) && /tongue/.test(html) && /wattles/.test(html));
check('mane: 6 rings, gold + orange merged', /ringY = \[0\.95/.test(html) && /maneGold/.test(html) && /maneOrange/.test(html));
check('wings: ZYX shoulders, forearm + mid + 5 merged fingers', /buildWing/.test(html) && /rotation\.order = 'ZYX'/.test(html));
check('tail: orange base + dark spikes', /tailGroup/.test(html));
check('surfing: orbit + gradient + repulsion + wall bounce + speed cap',
  /desVx/.test(html) && /samp\.gx/.test(html) && /terr > params\.tide/.test(html) && /sp > 1\.2/.test(html));
check('surfing vertical: footprint average, spring, glue, gravity, clamps',
  /surfHAt/.test(html) && /surfH \+ 0\.01/.test(html) && /9\.8 \* 1\.8/.test(html) && /newGap < -0\.04/.test(html) && /newGap > 0\.16/.test(html));
check('board orientation: yaw + normal + lean',
  /_qNormal/.test(html) && /surf\.lean/.test(html) && /slerp/.test(html));
check('groove: beat sway, nod, cock, look, wattle flop, jaw breathe, tail',
  /beat = t \* 2\.4/.test(html) && /headGroup\.rotation\.z = 0\.14/.test(html) && /jawGroup\.rotation\.x = 0\.42/.test(html));
check('wings: balance + calm shaka + wrist wiggle',
  /shaka = calm/.test(html) && /wingR\.rotation\.y/.test(html) && /Math\.sin\(t \* 1\.5\)/.test(html));
check('blink: 4.2s cycle, sine close', /blinkClose/.test(html) && /t % 4\.2/.test(html));
check('gap stats tracked', /gapRing/.test(html) && /gapMedian/.test(html));
check('props: pebble sinks, coconut floats (fur), spawn assigned',
  /spawnProp/.test(html) && /spawn: spawnProp/.test(html) && /state = 'sinking'/.test(html) && /makeFur\(new THREE\.SphereGeometry\(radius/.test(html));
check('props: splash on entry + ring effect', /splashAt/.test(html) && /RingGeometry/.test(html));
check('props: buoyancy, drag, gradient push, wall bounce, roll',
  /floatY/.test(html) && /g\.gx/.test(html) && /wallBounceProp/.test(html) && /_qRoll/.test(html));
check('props: ashore + tide refloat + counters', /ashore/.test(html) && /waterH > terrH/.test(html) && /setCounts\(afloat/.test(html));
check('props: grab + throw', /pointerToProp/.test(html) && /dragMode = 'grab'/.test(html) && /grabHistory/.test(html));
check('props: reset clears', /props\.length = 0/.test(html));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
