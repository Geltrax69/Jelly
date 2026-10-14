# Decision trail — Island Jelly

One row per slice. What was chosen, why, and what was rejected. The build
itself is a single `index.html`, committed slice by slice to `main`.

## Slice 1 — Scaffold, UI, renderer, loop

- **One file, no build step.** The brief asked for a single self-contained
  `index.html`; a bundler would add a step without adding anything the page
  needs. three.js r165 comes in via an importmap from jsDelivr.
- **Hook registries (`flavourListeners`, `resetters`, `tickers`).** Later
  slices register behaviour instead of editing the UI or loop code, so each
  slice stays a clean insertion.
- **Debug handle `window.__jelly`.** Console access to `params`, `state`,
  `spawn`, and `getGapStats()` — the surf-gap target is verified through it,
  not by eyeballing.

## Slice 2 — Diorama block, terrain, sediment sides

- **Deterministic RNG (`mulberry32(20261014)`).** Every placement is seeded,
  so the diorama is identical on every load. Random-looking, reproducible.
- **Terrain shader in *local* space.** The diorama tilts, so the waterline
  must be computed from local position + the tilt uniforms `uEqA`/`uEqB`,
  not world position. World-space would have made the wet band slide off the
  sand as the block tipped.
- **Caustics from the water's Laplacian texture.** The terrain reads the same
  Laplacian the wave sim computes — caustics focus where the water focuses,
  for free.
- **Integer-frequency sines for strata boundaries.** The sediment canvas
  wraps around four sides; only integer frequencies make the seam invisible.
  Non-integer sines left a visible step at the wrap.

## Slice 2b — Palms

- **Fronds merged into one geometry per crown.** 9 fronds × (rib + leaflets)
  as separate meshes would have been ~27 draw calls per palm; merged, one.
- **Crown coconuts stay standard-material.** At r=0.085, fur strands are
  invisible. Fur is reserved for the character and the throwable coconuts,
  where it can be seen.

## Slice 3 — Jelly sea

- **Fixed 1/120 s step + accumulator.** The wave sim is stable and
  frame-rate independent. Variable dt would have made firmness feel
  different at different frame rates.
- **Equilibrium plane derived from the rotation matrix.** The water's rest
  plane is `tide + wEqA·x + wEqB·z` where the coefficients come from the
  diorama's actual rotation — so tilting the block genuinely sloshes the
  sea, and the terrain waterline follows the same plane.
- **Surface mesh at cell centres.** Vertices sit at the sim's cell centres,
  so the rendered surface matches the physics exactly — the surfer's
  footprint average and the visible waves agree.
- **Pointer handler in capture phase, before OrbitControls.** Stir/tilt
  decisions must win over orbiting. A bubble-phase handler would have
  fought the controls.

## Slice 4 — Fur shader

- **Shell fur, 10 shells, strand discard.** One program, cached materials
  per (color, shell, len, rep, grav). Cheaper than geometry strands, and
  the discard pattern gives real strand separation.
- **Bake transforms into geometry; never scale a fur group.** Non-uniform
  group scale would squash the shader's normal displacement. Every fur
  part's scale/rotation lives in its geometry; groups only translate.
- **Only the base shell casts shadows.** 10 shadow-casting shells per part
  would have multiplied the shadow pass for no visible gain.
- **Max shell 0.9, not 1.0.** Tips stay sparse instead of ending in a hard
  empty ring.

## Slice 5 — Joe's body, legs, surfboard

- **Hierarchy `surfer > boardTilt > rooster > bodyGroup`.** The surfer rides
  in diorama-local space (tilt carries him); `boardTilt` takes the physics
  orientation; `bodyGroup` sways with its origin at the feet so the feet
  stay planted.
- **Rooster at y = 0.037.** Toe bottoms sit at rooster-local 0.014, so
  0.037 puts them exactly on the board top (0.045). Eyeballed placement
  would have floated or sunk the feet.
- **Legs are felt, not fur.** At r=0.028 the tubes are too thin for strands
  to read; felt keeps the silhouette clean.

## Slice 6 — Head, eyes, beak, comb, mane, wings, tail

- **Head pivots at the neck top.** Nodding, cocking, and looking rotate
  around the neck joint, not the feet — a head pivot at the origin would
  have swung the whole bird.
- **Eyes bulge outside the head surface.** Eye centres sit 0.170 from the
  head centre against a 0.15 head radius + 0.03 fur, so the white cap
  pokes through the fur instead of being buried in it. Buried eyes lose
  the lower white — the first thing that reads as "sleepy".
- **Lids are felt caps + rim tori, not fur.** Fur on the lids would have
  fuzzed the edge that makes the expression; the darker rim torus gives
  the lid a clean drawn line.
- **Comb lobes merged into one fur part.** Merging keeps draw calls down,
  at the cost of individual lobe flop: the comb flops as a rigid unit with
  a phase lag, while the wattles (separate pivots) flop individually.
- **Mane merged into gold + orange.** ~47 cones become 2 fur parts, roots
  buried inside the neck so no seams show.
- **Wing fingers merged per wing.** 5 fingers become 1 fur part per wing.
  Shoulder pivots use rotation order ZYX so the twist (shaka wiggle) reads
  around the arm axis.

## Slice 7 — Surfing physics, groove, blink

- **Footprint-averaged surface (centre ×2, ±0.55 along heading, ±0.22
  across, /6).** A single centre sample would have let the board clip wave
  crests and hover over troughs; the average matches what the board
  actually sits on.
- **Spring to 0.01 above + velocity eased toward surface speed + glue to
  dropping faces.** The three terms together track the surface without
  oscillation or float: spring for position, easing for velocity matching,
  glue so a falling face doesn't leave the board behind.
- **Hard clamps −0.04 / +0.16, airborne above 0.08.** Guarantees the
  headline target (median ≈ 0.01, max ≤ 0.16) by construction, not by
  tuning luck.
- **Gravity ×1.8 in the air, upward velocity capped at 2.2.** Airtime reads
  snappy rather than floaty at this scene scale.
- **Groove at beat `t·2.4`, everything phase-lagged.** Hips on the
  half-beat, head nodding 0.6 rad behind, comb/wattles a further 0.6 rad
  behind the head. Phase lags are what make it feel like a body, not a
  metronome.
- **Shaka blends with `calm`, not a switch.** The right wing eases into
  the pose as the water settles, so it never pops.

## Slice 8 — Pebbles, coconuts, splash, counters, grab + throw

- **Pebbles sink, coconuts float.** The contrast is the toy: one goes down,
  one bobs. Both share the splash / roll / ashore / refloat machinery.
- **State machines, not flags.** `air / sinking / afloat / sunk / ashore /
  grabbed` keeps the transitions (entry, grounding, tide refloat) in one
  place each.
- **Grab takes priority over stir/tilt.** A raycast hit on a prop wins;
  otherwise the pointer stirs or tilts. Props are small, so the raycast
  has to come first or they'd be un-grabbable.
- **Throw velocity from the last 120 ms of pointer motion, clamped to 3.**
  A flick throws; a slow release drops. No velocity history, no throw.
- **Counters update only on change.** Avoids DOM churn every frame.

## Slice 9 — Polish + verification

- **Runtime check in headless Chromium.** Static checks prove structure;
  only a real render proves zero console errors, the eyes reading, and
  the gap target under aggressive stirring.

## Jitter fix (post-ship)

- **Render interpolation for the water.** The sim runs at fixed 1/120 s
  steps but the mesh used to jump to the post-step state once per frame —
  at low frame rates the surface moved in visible steps. Now the ticker
  snapshots the heightfield before each frame's steps and renders
  `prev + (current − prev) × alpha`, so the water glides between steps.
  Physics still reads the raw latest state; the visual lag is under one
  sim step.
- **Pixel ratio cap 2 → 1.5, shadow map 2048 → 1024.** On Retina, a cap
  of 2 costs 4× the pixels for the fragment-heavy fur + transmission;
  1.5 keeps it sharp and buys back ~44% of the fragment work. The
  2048 shadow map cost the shadow pass dearly; 1024 is plenty for this
  diorama.
