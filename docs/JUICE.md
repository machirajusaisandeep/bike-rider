# Juice pass

_Companion to `ROADMAP.md`. Last updated 2026-09-05._

Turn the inspiration list into shippable slices on top of the current game. This is not a new product. The scored run, daily, missions, garage, ghosts, and six scenes stay. We add **feel, traffic personality, presentation, and a few cheap verbs**. Horn, wheelie, gamepad, and visor move here from the old unscheduled backlog.

**Baseline:** the garage showroom, chassis-per-bike, traffic filter/lane-change, night lamps, metro piers, and scene visual pass are already in the tree. Juice slices start *after* that, and must not rebuild it.

## Constraints (do not break)

- Arcade bicycle model, fixed 120 Hz step, no physics engine, no ragdoll.
- Worlds stay seeded (`Traffic` already uses `seededRandom`). Horn reactions must be **deterministic given seed + horn times**, or purely local (cows walk off-road after a honk; they do not change the spawn stream).
- Public builds never ship the RE GLB.
- Mobile-first: Low quality must stay ≥ 30 fps. New particles/meshes must pool and cap.
- Pure logic gets Vitest. Rendering is verified by the existing Playwright capture workflow, not new visual-regression infrastructure.
- Out of scope (keep rejecting): kart items, nitro as a resource, Road Rash combat, open world / OSM, real-time multiplayer, fuel meter, full rider IK rebuild in Blender (v1 is procedural offsets on the existing GLB).

## What already exists (do not rebuild)

From HEAD plus the current working tree:

| Wanted | Already there |
| --- | --- |
| Chase / cockpit / cinematic + speed FOV | `ChaseCamera`, `CAMERA.fovSpeedGain`, focus `screenLift` / `fov` |
| Dust on gravel / brake | `Dust` in `Game.step` |
| Player brake lights | `Bike.setLights` |
| Ghost record / local PB / daily group ghosts | `Ghost.ts`, `saveGhost` / `loadGhost`, `src/net/ghosts.ts` |
| Garage as 3D showroom | Bottom sheet + `frameGarageBike`, family silhouettes, `Bike.setLook` / `setPaint` / `setTankLabel` / `setFamily`, chassis-per-bike, twin engine detune |
| First-run quality guess | `autoQuality()` |
| Honest perf chip | `PostFX.sceneInfo` + HUD `drawCalls` / `triangles` |
| Portal rewarded continue | `Game.continueRun` + `Summary.canContinue` |
| Weather + wet road | `Weather`, `World.roadIsWet` |
| Route gates + dhaba heal | `routes.ts`, `Gates.ts`, `DHABA_HEAL` |
| Traffic personality | Lane change (`laneChange`), two-wheeler `filterLat`, heavy vehicles on bends, `bike` + `tempo` kinds, metro `pier` median |
| Night vehicle lamps | `geo.vehicleMat` + `LAMPS` uniform, lamp vertices on every vehicle |
| Spawn in the left lane | `World.spawnAt` (avoids Bengaluru piers) |
| Rider head follows steer | `Rider.update(steerAngle, dt)` |
| HUD hidden behind menu | `.hud.menu-open` only keeps sound/settings |

### Do not redo in juice slices

- `Traffic.update` car-following / filter / lane-change / bend braking
- `vehicles.ts` meshes, region bus liveries, lamp glass
- `City.ts` metro deck (paired with `METRO_PIER_Z`)
- Garage layout / bike catalog / `bikes.ts` chassis
- Road / vegetation / scene visual pass currently in the working tree

## Architecture

Keep `Game.step` as the only place that composes systems. New work plugs in as small classes, same pattern as `Dust` / `Traffic` / `EngineAudio`.

```
Input ──► BikePhysics (120 Hz) ──► Bike / Rider visuals
                │
                ├── Traffic.honk / shove / brake-lights
                ├── Scoring (near-miss, wheelie, draft)
                ├── GhostRecorder + split vs PB
                └── AudioBus (engine, horn, wind, place)

Render (display rate): ChaseCamera, Dust, Skids, visor overlay, quality governor
```

Determinism rule: horn and traffic *reactions* mutate live vehicle/hazard poses only. They must not reseed `rnd` or change `targetCount`. Daily share links still reproduce the spawn layout; they will not replay exact horn timings (same as current player input).

---

## Slice 0 — This document

**Done.** `docs/JUICE.md` + juice section in `ROADMAP.md`.

---

## Slice 1 — Horn + reactive traffic

Traffic already *lives*: scooters filter, Bengaluru lane-changes, heavies brake for bends, night lamps glow. This slice only adds a **player verb** and per-instance light state.

### Horn input

- `src/core/Input.ts`: add `horn: boolean` to `InputState`; map `KeyH` (and a touch button on the right cluster in `Hud.ts`). Edge-trigger in `Game.step` (honk on rising edge, 0.35 s cooldown).
- i18n: `hud.hint.ride` adds “H horn”. Onboarding hint in `Game.beginRun` stays three items; add horn to the *second* run or a status toast, not the first-run overlay.

### Traffic reactions — `Traffic.honk(bikeLat, bikeZ)`

New method on `src/world/Traffic.ts`. For each obstacle within ~18 m ahead:

| Kind | Reaction |
| --- | --- |
| `cow` / `goat` | Walk `lat` toward the shoulder over 1.2 s. Animate `lat` + yaw via the existing hazard `place()` path. Once off the asphalt they stay. |
| `auto` / `scooter` / `bike` | Set `filterLat` away from the player (reuse two-wheeler filter, 0.4 s) or a 0.4–0.8 m flinch for autos. |
| `hatch` / `suv` / `tempo` | `cruise *= 0.7` for 0.6 s (car-following already drops speed; this is an extra brake). |
| `truck` / `bus` / `tanker` | Ignore motion; only a 0.1 s tail blink. |
| `pier` | Never. |

Add `reactUntil` / `reactCruise` on `Vehicle` and a `scareLat` on `Hazard`. Drive them inside the existing `update()` loop. `shove` already exists for hit recovery.

**Do not** consume `this.rnd` or `this.behaviourRnd` in `honk` (lane-change stream is seeded on `seed ^ 0xbeef`; extra draws would desync daily traffic). Hash `obstacle.id` if you need a magnitude.

### Brake lights + high-beam flash (extend `vehicleMat`, do not add a second mesh)

Night glow is already a fleet-wide `LAMPS` uniform on lamp vertices. Per-instance brake/flash cannot use that uniform.

Add two `InstancedBufferAttribute`s on each vehicle pool (`brakeK`, `flashK`) and sample them in `vehicleMat` next to `lampK`:

```
emissive += tailColor * brakeK   // when speed < cruise * 0.92 or horn-brake
emissive += headColor * flashK   // oncoming pulse
```

`Traffic.place` already writes matrices every frame; write the two floats there too.

Oncoming flash: if the rider’s `lat` is on the oncoming side and an oncoming vehicle is within 40 m, pulse `flashK` 0.15 s every 0.7 s.

Do **not** invent `buildBrakeLights` geometry — tails/heads are already in `buildVehicle`.

### Audio

- Extend `EngineAudio` (or a thin `AudioBus` in the same file) with `honk()`: short square + noise burst ~420 Hz, 180 ms, independent of the engine gain.
- Respect `settings.sound`.

### Tests

- New `src/world/traffic.test.ts` (or `src/game/horn.test.ts`) for a **pure** helper `hornTargets(obstacles, bikeLat, bikeZ)` → which ids react and how. Keep Three.js out of the test; extract the reaction policy from `Traffic`.
- Existing `Scoring` tests unchanged.

### Touch

One extra circular button `H` in `Hud`’s right touch group, same pattern as existing gas/brake.

**Done when:** honking a cow on Ooty moves it off the line; a hatch shows red tails when it slows; first-run still has three hints.

---

## Slice 2 — Rider body, visor, skid marks

### Rider (no new GLB)

`Rider` is parented to `bike.lean`, so the body already rolls with the bike. `update` currently only yaws the `head` bone.

Extend `Rider.update(steer, lean, crashed, dt)`:

- Head yaw stays; add a little extra look-into-turn (`-steer * 0.8`).
- Crash: when `crashed`, lerp `root.rotation.z` extra and `root.position.y` down 0.15 m so the rider dumps with the lowside. Reset on `setPose('ride')` / run start.
- Optional later: a `Crash` clip in `scripts/blender/build_rider.py`. Not required for this slice.

### Helmet visor (cockpit only)

CSS overlay in `Hud`, not a Three.js pass (survives Low quality with PostFX off):

- `.visor` full-screen inset shadow + slight green tint, visible iff `cameraMode === 'cockpit'`.
- `.visor.fog` when `weather` is `rain` or `fog`: extra opacity + a looping CSS droplet (or a tiny canvas of 12 drops). Unlock-gated weather already exists.

`Game.step` already knows camera + weather. Toggle classes; no new render path.

### Skid marks

New `src/world/Skids.ts`, same pooling idea as `Dust`:

- Recycled ribbon of ~120 quads (`PlaneGeometry` or a single `BufferGeometry` strip).
- Emit when braking or high lean on asphalt/wet, `speed > 8`, not crashed.
- Stamp at rear-tyre contact using `heightAt` + road heading, y += 0.02.
- Fade alpha by age; hide on Low quality (or cap at 40 quads).

Call from `Game.step` next to `dust.update`. Clear on `reset` / scene change.

**Done when:** cockpit in monsoon shows a visor; a hard brake on Bengaluru leaves two black lines that fade; a crash dumps the rider with the bike.

---

## Slice 3 — Layered audio + place beds

`EngineAudio` is still a thumper (saw + square) with a **twin detune** (`setEngine`). Keep that as the core; wrap it.

New `src/game/AudioBus.ts` (EngineAudio can move inside it or stay as a delegate):

| Voice | Source | When |
| --- | --- | --- |
| Engine | existing osc/sub/filter | always if sound on |
| Wind | filtered white noise | `speedRatio` |
| Gear thunk | 40 ms noise burst | `physics.gear` changes |
| Horn | slice 1 | rising edge |
| Place bed | very quiet noise + sparse one-shots | scene id |
| Dhaba radio | 2 s pentatonic loop, ducked | passing a `kind === 'dhaba'` gate |

Place beds (all synthesized, no files):

- `bengaluru` — distant horn chirps (reuse honk at low gain, random 4–8 s)
- `varkala` — low-pass noise (surf)
- `munnar` / `wayanad` — sparse high ticks (insects)
- `ladakh` — broadband wind, already partly covered by the wind layer
- `ooty` — same as munnar, quieter

`Game.step` already calls `audio.update(rpm, throttle, paused)`. Add `gear`, `speedRatio`, `sceneId`, `dhabaNear`.

Mute path for portal ads already goes through `audio.setEnabled` — keep a single enable flag on the bus.

No Vitest (AudioContext). Manual: toggle sound, shift through gears, pass Keylong dhaba on Manali → Leh.

**Done when:** you can tell Bengaluru from Varkala with eyes closed, and a gear change has a thunk.

---

## Slice 4 — Race yesterday (ghost splits)

Recording and local PB ghosts already work (`bike-rider.ghosts.v1`). What is missing is **feedback**.

### Split helper (pure)

New functions in `Ghost.ts` (or `src/game/splits.ts`):

```ts
ghostTimeAtZ(data: Float32Array, z: number): number | null
```

Walk samples (z is monotonic-ish toward −∞). Used at route gates and, if no route, every 500 m.

### HUD

- On gate pass (`Game.updateRoute`), compare `run.stats.durationS` vs ghost time at that z.
- Toast: `+0.4` / `−1.2` (green/red). i18n `ghost.split`.
- Small persistent chip: `PB  −0.8` while a ghost is loaded.
- Countdown copy when a ghost exists: “Beat your 12,400”.

### Rubber-band group ghosts

`GhostRider.update(t)` currently plays wall-clock time. Add optional `followZ(playerZ)` that searches the sample with z closest to `playerZ` and clamps the time offset to ±2.5 s so daily pack-mates stay in frame. Apply only to `this.others`, not the PB ghost (the PB must stay honest).

### Seed mismatch

`saveGhost` stores `seed`. If the current run seed ≠ stored seed (retry on Ride mode), still show the ghost — it is “your line”, not a physics twin. Daily seeds match by construction.

### Tests

`Ghost` / splits: synthetic samples, `ghostTimeAtZ` at known z, interpolation bounds.

**Done when:** a second Ride on Munnar shows a translucent you and gate splits; daily group bikes stay nearby.

---

## Slice 5 — Livery + orbit + test ride

The garage **is** a showroom now: bottom sheet, 3D bike, family extras, live chassis, SVG cards. Do not restyle it. Remaining identity:

### Paint / plate (profile)

Extend `Profile`:

```ts
liveries: Record<string, { paint: string; accent: string; plate: string }>;
```

Defaults fall back to `BikeDef.paint` / `accent`. `loadProfile` already merges missing keys.

`Bike.setPaint` and `setTankLabel` already exist — call them from `applyGarage` with the livery override. Cap plate at 8 chars, uppercase. `setPaint` already no-ops on the RE GLB.

Garage UI: a row of 6–8 swatches + an `<input maxlength=8>` on the existing `.panel-card` (do not grow the sheet past ~38vh).

### Orbit

The overlay is `pointer-events: none` except the sheet, so the canvas is already free. Pointer/touch drag while `garage.visible` adjusts `ChaseCamera` focus yaw. `Game` already zeros drive input in the garage.

### Test ride

Button on the sheet: `beginRun({ mode: 'free', scene, seed })` with a 20 s cap, then `openGarage()` again. Status toast “Test ride”.

**Done when:** you can paint the twin, set `KA 01 AB`, orbit it, test-ride, and see the paint on the next scored run.

---

## Slice 6 — Auto quality governor

`autoQuality()` runs once on first launch. The perf chip now reports real scene draw calls (PostFX `sceneInfo`) — use that in `?perf`, not as the governor input. Add a **closed loop** that holds a frame budget without rebuilding vegetation every frame (`World.setQuality` still disposes Vegetation).

### Settings

`Quality` stays `'low' | 'medium' | 'high'`. Add `qualityMode: 'auto' | Quality` (or treat a new `'auto'` as the stored choice and keep an internal `effectiveQuality`). HUD settings: Auto / Low / Medium / High.

### Governor (`src/core/governor.ts`)

- Ring buffer of 40 frame times (the raw `clock.getDelta()` in `Game.frame`, not the clamped sim dt).
- Median (not mean) so one GC pause does not drop a tier.
- Targets: 22 ms (high), 28 ms (medium), else low. Hysteresis: 90 frames before promoting, 45 before demoting.
- On change, call existing `applyQuality`. Also `traffic.setDensity` (already exists) before rebuilding veg: first drop **pixel ratio and PostFX**, then shadows, then traffic density, then quality tier (veg rebuild).

Never change quality mid-countdown in a way that hitch-stalls; apply on the next `idle`/`summary` if a veg rebuild is needed. DPR / PostFX / traffic density can change live.

### Tests

Pure median + hysteresis in `governor.test.ts`.

**Done when:** Auto on a throttled CPU walks High → Medium → Low and the ride stays controllable; manual High still overrides.

---

## Slice 7 — Wheelie spice + gamepad

### Wheelie / stoppie (arcade, not DankNooner)

Add to `BikePhysics` (not a second sim):

- `wheelie` 0..1, `stoppie` 0..1.
- Wheelie: throttle = 1, speed 12–55 km/h, |steer| < 0.2, hold 0.35 s → pitch visual +0.18 rad via existing `pitch` (additive, still sampled from terrain). Scale the hold by `chassis.accel` so the Adventure pops easier than the Retro 350.
- Hold > 1.4 s or steer out → `impulse` wobble; if still holding, small health tick (reuse `Health`).
- Stoppie: handbrake / full brake, speed > 25 km/h, 0.25 s → nose-down pitch.
- Visual: `Game.syncBikeTransform` already applies `physics.pitch`.

Scoring: `Scoring.trick('wheelie' | 'stoppie', duration)` — 80–200 pts, **does not reset combo**, toast “Wheelie”. Braking still resets combo except during a stoppie window (otherwise stoppies would always kill combo). Tests in `Scoring.test.ts` and a small physics test for the hold thresholds.

### Gamepad

`Input.update`: if `navigator.getGamepads()[0]`,

- left stick X → `steer` (already analog)
- RT / R2 → `throttle`, LT / L2 → `brake`
- A / Cross → handbrake (Space)
- B / Circle → horn (slice 1)
- Y / Triangle → camera (already a key listener; also poll)

Do not fight keyboard: gamepad wins a channel if |axis| > 0.08.

### Haptics

`navigator.vibrate(12)` on near-miss; `vibrate(30)` on rumble strip (`effect === 'bump'`). No-op if missing. Gate on a settings toggle default on for coarse pointers.

**Done when:** a DualShock can ride a full run; a short wheelie off a breaker pops a toast; a long wheelie wobbles.

---

## Slice 8 — Indian wedge (after 1–7)

Do not start this until slices 1–4 are in. The current working tree already did the **look** of India (metro piers, denser Bengaluru mix, region buses, road/veg/city pass). This slice is **route storytelling and HUD**, not another scenery rewrite.

### 8a. Weather and time as a route story

`Checkpoint` gains optional `weather?: WeatherId` and `time?: TimeOfDay`. `Game.updateRoute` calls `world.setWeather` / `setTimeOfDay` on pass. Manali → Leh: start clear/day → Rohtang fog → Baralacha snow → finish golden.

`Atmosphere.apply` is already discrete; that is enough. Grip follows `roadIsWet` / existing snow as gravel-ish if needed (snow currently visual-only — map snow → `grip` 0.8 if it feels like ice).

### 8b. Landmark per gate

`Gates.ts` already builds posts + a banner. Add one hero mesh per `kind`: dhaba shack (reuse `Vegetation` shack), pass cairn/chorten, view overlook rail, town arch. One extra mesh per checkpoint (routes have ≤ 6). Data on `Checkpoint` (`prop?: 'shack' | 'chorten' | 'rail' | 'arch'`).

Do **not** add more metro piers here — `pier` hazards + `City` deck already own that.

### 8c. Slipstream

Two-wheelers already filter past blockers. Draft is the *player* bonus: if a same-direction vehicle is 4–10 m ahead and `|dLat| < 1.1`, extra accel (`draft = 1.08`) and a HUD chip “Draft”. Scoring: +10 / s, does not reset combo. Pure helper + test. Use `Traffic`’s live vehicle list; no new spawn logic.

### 8d. Minimap + tank cam + share crop

- Minimap: 96 px canvas in `Hud`, road polyline from `path.centerX` ± 180 m, dots for bike / ghost / next gate. Hide on Low if it costs (it should not).
- Camera mode `'tank'` (handlebar, slightly above tank). Add to `CAMERA_MODES`.
- Photo mode: 9:16 export option in `PhotoMode` / `Card.ts` for stories. Reuse OffscreenCanvas.

### 8e. Continue copy

`Summary` already has a continue button. Change the label to “Stop at a dhaba · +50% health” so the portal ad is diegetic. No logic change (`continueRun` already restores 0.5 hp and snaps to the road).

---

## File ownership (to keep PRs from colliding)

| Slice | Touches |
| --- | --- |
| 0 | `ROADMAP.md`, `docs/JUICE.md` |
| 1 | `Input.ts`, `Hud.ts`, `Traffic.ts`, `geo.ts` (`vehicleMat` instance attrs), `EngineAudio.ts`, `Game.ts`, `i18n.ts`, new traffic policy test |
| 2 | `Rider.ts`, `Hud.ts` + `style.css`, new `Skids.ts`, `Game.ts` |
| 3 | new `AudioBus.ts`, `EngineAudio.ts`, `Game.ts`, `routes.ts` (dhaba proximity only) |
| 4 | `Ghost.ts`, `Game.ts` (`updateRoute`, `loadOthers`), `Hud.ts` |
| 5 | `profile.ts`, `Garage.ts` (swatches/plate/test-ride only), `Bike.ts` (call existing setters), `Game.ts` (orbit) |
| 6 | `settings.ts`, new `governor.ts`, `Game.ts`, `Hud.ts` |
| 7 | `BikePhysics.ts`, `Scoring.ts`, `Input.ts`, `Game.ts`, `settings.ts` |
| 8 | `routes.ts`, `Gates.ts`, `Atmosphere`/`Weather` via `Game.updateRoute`, `ChaseCamera.ts`, `PhotoMode.ts` |

`Game.ts` is on every slice. Keep each slice’s `Game.ts` diff under ~80 lines by pushing logic into the new modules.

## Suggested PR order and size

1. Slice 0 (docs)
2. Slice 1 (horn + instance brake/flash) — the one that changes the trailer. Assumes the working-tree traffic/lamp pass is already in.
3. Slice 2 (rider / visor / skids)
4. Slice 3 (audio)
5. Slice 4 (ghost splits)
6. Slice 6 (governor) — do this before adding more particles if mobile hitch shows up
7. Slice 5 (garage)
8. Slice 7 (wheelie + gamepad)
9. Slice 8 in three PRs: 8a+8e, 8b+8c, 8d

Slices 1, 2, 3 can overlap once 1 has landed `Traffic.honk` and the audio bus stub.

## Tests and verification

- Vitest: horn target policy, `ghostTimeAtZ`, scoring tricks/draft, governor hysteresis, profile livery merge, physics wheelie hold.
- `npm test && npm run build` on every slice.
- Browser (required for UI slices): Ride Ooty (cows), Bengaluru night (oncoming flash), cockpit + monsoon (visor), garage paint, gamepad if present, Auto quality with Chrome 4× CPU throttle.
- Playwright audit scripts in `audit/` are optional; do not block on them.

## Explicitly not in this pass

- Real-time multiplayer, OSM India, infinite highway.
- Nitro / mini-turbo / item boxes.
- Full ragdoll; keep the lowside.
- New Blender rider clips (except a later optional Crash pose).
- Layered RPM *samples* (San Verde’s 6 WAVs) — stay synthesized.
- Gear-stat coupling (rain jacket +wet grip) — still a ROADMAP Phase 3.2 leftover; do it as a tiny follow-up after slice 7 if paint/livery is done.
