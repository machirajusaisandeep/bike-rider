# Bike Rider Audit for Claude/Fable

Date: 2026-09-05
Local URL tested: `http://127.0.0.1:5174/` because port `5173` was already in use.

## Executive Summary

The game is feature-rich for a browser Three.js prototype: rider creator, gear protection,
routes, missions, garage/upgrades, scoring, traffic, hazards, weather, camera modes, photo/share,
ghost/leaderboard plumbing, and multiple Indian biomes are all present.

Visually, it makes sense as a stylized low-poly arcade game. It does not yet approach realistic
GTA 5/GTA 6 feeling. The main gap is not a single shader or texture. The gap is the whole realism
pipeline: real-world road geometry, high-fidelity PBR assets, dense local props, believable traffic
behavior, richer animation, weather integration, soundscape, and streaming/LOD discipline.

Highest-priority issues:

1. `npm run build` fails because `src/game/upgrades.test.ts` imports `MISSIONS` but does not use it.
2. Runtime render stats are misleading on High because `Game.stats` reads `renderer.info` after the
   post-processing output pass, reporting `drawCalls: 1` and `triangles: 1`.
3. The rider creator renders the rider over-bright/washed out, especially the white shirt.
4. HUD controls are visible behind the menu/onboarding UI, which looks unfinished.
5. Scenes are recognizable by theme, but most assets read as procedural placeholders.
6. Bengaluru ORR is the most reality-mismatched: it lacks congestion, service roads, flyovers,
   metro works, road damage, lane chaos, tech-park edges, and pedestrian/parking clutter.
7. The route/location names are ambitious but compressed into short game loops without enough
   landmark staging to sell the illusion.

## Evidence Collected

Screenshots:

- `audit-output/01-menu-rider.png`
- `audit-output/02-menu-roads.png`
- `audit-output/03-routes-panel.png`
- `audit-output/scene-select-munnar.png`
- `audit-output/scene-select-ladakh.png`
- `audit-output/scene-select-wayanad.png`
- `audit-output/scene-select-ooty.png`
- `audit-output/scene-select-varkala.png`
- `audit-output/scene-select-bengaluru.png`
- `audit-output/runtime/*-ride.png`
- `audit-output/runtime/mobile-menu-scene.png`

Temporary audit scripts:

- `audit/playwright-audit.mjs`
- `audit/runtime-audit.mjs`

## Test Results

Commands:

- `npm test`: passed, 7 files / 40 tests.
- `npm run build`: failed.

Build failure:

```text
src/game/upgrades.test.ts(4,1): error TS6133: 'MISSIONS' is declared but its value is never read.
```

Browser/runtime:

- Headed Chromium, High quality, Bengaluru autodrive:
  - First sample: about 83.8 FPS, phase `riding`, speed 48 km/h, traffic 28.
  - Second sample: about 120 FPS, phase `riding`, speed 97 km/h, traffic 28.
  - Render stats invalid because post-processing makes `drawCalls` and `triangles` report as `1`.
- Headed Chromium, Low quality, Bengaluru autodrive:
  - About 120 FPS.
  - `post: false`.
  - Draw calls: 353-354.
  - Triangles: about 403k-405k.
  - Traffic: 17.
- Headless Chromium is not representative for play performance:
  - Reported only 1.8-3.6 FPS on scene rides.
  - Countdown advanced very slowly.
  - Screenshots still rendered, but canvas pixel readback returned blank because normal WebGL
    framebuffers are not reliable for post-frame readback without a dedicated capture path.

Console warnings:

- `THREE.Clock` is deprecated; use `THREE.Timer`.
- `THREE.WebGLShadowMap: PCFSoftShadowMap` is deprecated; Three falls back to `PCFShadowMap`.
- Headless readback caused GPU stall warnings. This came from audit probing, not normal gameplay.

## Feature Inventory

Observed or confirmed from UI/code:

- Rider creator: body, face, skin tone, beard, hair, hair color, gear.
- Gear protection model: body-zone score and exposed-zone readout.
- Road select: Ride, Daily challenge, Free ride.
- Six locations: Munnar, Leh-Ladakh, Wayanad, Ooty, Varkala, Bengaluru.
- Routes panel: six named routes with checkpoints and rewards.
- Missions panel: per-scene mission tiers.
- Garage panel: upgrades and multiple bikes.
- Ride HUD: speed, gear, distance, surface, health, score, camera, pause, reset, sound, settings.
- Gameplay systems: traffic, hazards, near-miss scoring, health, route gates, dhaba healing,
  weather, time of day, ghosts, leaderboards, share card, replay clip, photo mode.

Automation limitation:

- The initial panel sweep got stuck after the routes panel because the automated close/focus path
  was brittle. The panel itself rendered correctly in the screenshot. Verify Esc/click-close manually.

## Visual Read

What works:

- Overall UI structure is coherent.
- Route cards and scene cards are readable.
- The scene set has distinct silhouettes: tea hills, high desert, rainforest, pine hills, coast,
  city night.
- Low-poly style is internally consistent.
- Mobile road-select layout mostly adapts to a narrow viewport.

What does not work for realism:

- Procedural geometry dominates the visual identity. Trees, bushes, rocks, buildings, vehicles,
  chortens, shacks, and hills feel generated rather than observed.
- Materials are too simple: mostly vertex color/canvas textures, weak normal/detail maps, little
  grime, paint wear, dust accumulation, tire marks, puddle detail, or road repairs.
- Roads are too clean and mathematically smooth.
- Haze/fog often hides missing detail instead of creating physically grounded atmosphere.
- Rider lighting is inconsistent with the world; the white shirt is blown out in the creator and
  ride scenes.
- Menu has game HUD controls visible behind it, creating an unfinished overlay stack.
- Scene thumbnails repeat the same bike/rider composition and do not sell each place as strongly
  as real location imagery would.

## AI Slop Findings

Treat these as placeholder-quality items to replace:

- Low-poly green blobs for forests and tea bushes, especially when they repeat into obvious rows.
- Ladakh shrubs that look like bright green cuboids in a desert pass.
- Toy-like chorten/stupa mesh without prayer flags, stone base detail, weathering, or scale.
- Generic high-rise boxes in Bengaluru with repeated window grids.
- Generic Indian traffic labels without region-specific behavior, paint, buses, bikes, horns,
  parking, lane discipline, or road-edge life.
- Over-broad descriptions such as "Ride India on a Scram 411" while the bike is actually a
  procedural `Scram 440` in the HUD unless the unlicensed local GLB is available.
- Route compression is accepted for gameplay, but the current routes do not stage enough real
  checkpoint transitions to feel like the named roads.
- Garage/UI uses mixed polished controls and placeholder visual language.

## Scene-by-Scene Reality Gaps

Reference sources used:

- Munnar: https://www.keralatourism.org/destination/munnar/202/
- Wayanad Ghats: https://www.keralatourism.org/destination/wayanad-ghats/271/
- Varkala: https://www.keralatourism.org/destination/varkala-beach/328/
- Khardung La: https://leh.nic.in/tourist-place/khardung-la-pass/
- Ooty: https://www.tamilnadutourism.tn.gov.in/destinations/ooty
- Bengaluru ORR context:
  - https://btp.karnataka.gov.in/126/junction-improvement/en
  - https://timesofindia.indiatimes.com/city/bengaluru/outer-ring-road-from-hebbal-to-silk-board-in-bengaluru-31km-of-bumpy-rides-snarling-traffic/articleshow/121981599.cms

### Munnar

Current read: green hills, mist, tea-like rows. It is thematically correct but too smooth and
generic.

Improve:

- Use tighter contour tea rows that follow terrain, with visible cut lines and estate paths.
- Add tea estate worker huts, small shops, retaining walls, drainage channels, signboards,
  waterfalls, and electric poles.
- Use wet/cool mountain lighting with cloud shadows, not just white haze.
- Add Neelakurinji/Eravikulam/Anamudi references as distant landmarks or route signs.

### Leh-Ladakh / Khardung La

Current read: wide beige high desert with a simplified chorten. Good theme, weak reality.

Improve:

- Make the road narrower, rougher, and more exposed, with broken edges, gravel shoulders,
  switchbacks, cliff drop-offs, BRO milestone signs, army/checkpost elements, and warning boards.
- Replace smooth dune-like terrain with stratified rock, scree slopes, sharper ridges, and
  snow/ice patches at elevation.
- Add prayer flags as cloth strips/lines with wind animation.
- Add altitude effects: harsher light, lower vegetation, dusty wind gusts, cold color grading.

### Wayanad / Thamarassery Churam

Current read: green ghat road with rain/mist mood. Needs stronger rainforest and hairpin identity.

Improve:

- Build nine named hairpins into the route instead of generic curvy road.
- Add steep retaining walls, drainage, moss, wet asphalt reflections, waterfalls/streams, monkeys,
  dense canopy overhead, and viewpoint railings.
- Make road edges feel dangerous and narrow, with buses/trucks taking wide turns.

### Ooty / Nilgiris

Current read: pine/eucalyptus hills, but very clean and generic.

Improve:

- Mix tea gardens, eucalyptus, pine, wattle, shola patches, grassland slopes, colonial retaining
  walls, stone parapets, hairpin signs, and tourist traffic.
- Add the Nilgiri Mountain Railway as a distant/parallel landmark for selected stretches.
- Reduce giant-tree scale and make forest floors less flat.

### Varkala

Current read: coastal palms and straight road. It misses the cliff geometry.

Improve:

- Make the red laterite cliff a first-order feature: exposed cliff edge, drop to beach, stairs,
  railings, cafe frontage, surf below, and golden sand/turquoise water.
- Add Janardhana/Papanasam signage, yoga/cafe/shop frontage, parked scooters, pedestrians, and
  sunset crowd detail.
- Add ocean audio and stronger sea breeze effects.

### Bengaluru ORR

Current read: clean six-lane night boulevard with towers. It is visually coherent but least
realistic.

Improve:

- Add service roads, flyovers, metro piers/construction barricades, tech park gates, BMTC buses,
  autos, two-wheelers, waterlogging, broken lane paint, potholes, patched asphalt, illegal parking,
  bus stops, skywalks, and junction bottlenecks.
- Make traffic dense and messy: lane filtering, honking audio, buses stopping in lanes, scooters
  splitting gaps, cars changing lanes, U-turn conflicts.
- Use real ORR segment identities: Silk Board, Bellandur, Kadubeesanahalli, Marathahalli,
  KR Puram/Hebbal, with landmark signs and changing road profiles.

## Performance and Rendering Tasks

1. Fix build failure in `src/game/upgrades.test.ts`.
2. Fix render stats:
   - Capture renderer stats immediately after the scene render pass, before post-processing resets
     or overwrites values.
   - Expose both `sceneDrawCalls/sceneTriangles` and `postPasses`.
3. Add a debug overlay behind a URL flag:
   - FPS p50/p95/min.
   - Frame time p50/p95.
   - Draw calls, triangles, geometries, textures.
   - Active traffic/hazard counts.
   - Terrain/vegetation tile rebuild count.
4. Add an automated visual smoke test:
   - Use Playwright headed or browser-channel Chrome when available.
   - Capture screenshots via `page.screenshot`, not canvas readback.
   - Assert visible HUD/menu text and non-empty screenshot files.
5. Reduce High-quality cost where needed:
   - Audit terrain chunk resolution and vegetation density.
   - Add object LODs and impostors for far trees/buildings.
   - Avoid `frustumCulled = false` for all large instanced systems unless required.
   - Cache/reuse canvas textures aggressively.

## Realism Upgrade Roadmap

Quick wins, 1-3 days:

- Fix build failure.
- Hide HUD icon strip while menu/rider creator is open.
- Tone down rider overexposure and rebalance shirt/skin materials.
- Add per-scene road decals: cracks, tar patches, lane wear, dirt edges, puddles, speed-breaker
  paint, road reflectors.
- Add landmark signboards and small props per location.
- Improve route panel scroll affordance and ensure Esc/close is reliable.

Medium work, 1-3 weeks:

- Build a real asset kit per scene: 20-40 props each with LODs.
- Replace procedural placeholder vehicles with better Indian vehicle meshes and region paint.
- Add traffic behaviors: lane changes, scooter filtering, bus stops, oncoming overtakes,
  junction slowdowns.
- Add camera shake, suspension response, better rider lean/IK, hand position, crash animation.
- Add location-specific audio beds: horns/city, ocean/wind, rain forest, mountain wind, gravel.
- Add weather-specific materials and particles beyond global fog/rain/snow.

Large work, 1-3 months:

- Introduce a real world-building pipeline using GIS/OSM-derived road alignment, elevation data,
  hand-authored landmark chunks, and streamed segments.
- Move from purely procedural terrain colors to splat maps/PBR materials with normals,
  roughness, wetness, decals, and tire tracks.
- Add streaming and hierarchical LOD so dense scenes can exist without destroying frame time.
- Add cinematic time-of-day and volumetric atmosphere approximations.
- Add a curated reference board for every route segment before implementation.

GTA 5/GTA 6 range:

- This is not achievable by just tuning current procedural Three.js assets.
- A browser build can move toward a convincing stylized-realistic riding game, but GTA-level
  realism requires AAA asset production, scanning/photogrammetry, animation systems, traffic AI,
  audio, streaming, tooling, and probably an engine like Unreal/Unity unless the scope stays small.
- Best pragmatic target for this repo: "credible Indian road riding with strong art direction",
  not open-world AAA realism.

## Claude/Fable Work Queue

P0:

- Fix `npm run build`.
- Fix `Game.stats` so render metrics are real on High quality.
- Hide HUD controls behind menus.
- Fix rider material exposure.

P1:

- Add a `docs/references/locations.md` file with target visual traits and source links for each
  location.
- Create per-scene prop lists and implement first-pass props:
  - Munnar: estate paths, tea workers huts, waterfalls, estate signs.
  - Ladakh: BRO signs, prayer flags, army/checkpost props, rock strata.
  - Wayanad: retaining walls, waterfalls, monkeys, viewpoint railings.
  - Ooty: stone parapets, eucalyptus/pine mix, tea patches, railway glimpse.
  - Varkala: red cliff mesh, cafe shacks, stairs, surf/beach below.
  - Bengaluru: metro piers, barricades, service roads, flyover pieces, bus stops, tech signs.

P2:

- Replace traffic meshes with higher-fidelity LOD assets.
- Add traffic behavior by scene.
- Add real road-surface material system.
- Add per-scene audio and weather integration.

P3:

- Build GIS/OSM route import prototype for at least one route.
- Build an art-performance budget per quality level.
- Build screenshot regression tests for desktop and mobile.

