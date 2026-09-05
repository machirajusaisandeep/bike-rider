# Bike Rider — Roadmap to a shippable, shareable game

_Last updated: 2026-09-05. Companion to `PLAN.md` (which covers the original free-ride build)._

## Status (2026-09-05)

| Phase               | State                 | Notes                                                                                                                  |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0 Foundation        | **Done**              | Vitest, analytics sink, run state machine, seeds, perf chip, Pages workflow, public-build flag                         |
| 1 Make it a game    | **Done**              | Traffic + hazards, collision, scoring/combos, health from gear, crash slide, summary, retry, onboarding hint           |
| 2 Share and compete | **Done** (needs keys) | Result card, seed links, daily challenge + streaks, Supabase client + schema, ghosts. Set `VITE_SUPABASE_*` to go live |
| 3 Retention         | **Done**              | 48 missions, coins + upgrades + bikes, monsoon/fog/snow, photo mode                                                    |
| 4 Indian angle      | **Done** (v1)         | Six named routes with gates and dhabas, 5-language UI, replay clip, group-ride ghosts on the daily                     |
| 5 Distribution      | **Ready**             | Portal SDK adapter (Poki / CrazyGames), itch zip script, OG tags, `docs/LAUNCH.md`. Submissions are a human step       |

Not built yet: real-time multiplayer, open world, wheelies/horn (backlog by design).

## Where we are

Bike Rider today is a polished free-ride sandbox: six Indian scenes, a real Scram 411 loaded
locally, rider gear with a protection score, day/dusk lighting, HUD, touch controls. It has **no
goal, no failure state, no score and nothing to share**. Every breakout game in this genre
(Traffic Rider, Hill Climb Racing, PolyTrack, Slow Roads) has all four.

The plan below turns the sandbox into a game in five phases. Each phase ships on its own and is
gated by a measurable outcome, not a feature count.

### Guiding rules

1. **One run, one number, retry.** Everything in Phase 1 serves a 60–90 s run that ends in a
   score and a one-key restart.
2. **Free Ride stays.** The current experience becomes a mode, not a casualty.
3. **Deterministic worlds.** Every run has a seed (`seededRandom` in `src/world/roadPath.ts`
   already exists). Seeds power daily challenges, share links, ghosts and leaderboards.
4. **Mobile first for performance.** Poki/CrazyGames traffic is majority phone. Budget: first
   frame < 3 s on a mid-range Android, 30 fps minimum on Low quality with traffic on.
5. **Pure logic gets tests.** Scoring, damage, missions and economy are pure TS modules covered
   by Vitest. Rendering is verified with the existing headless Playwright capture workflow.
6. **The RE model never ships publicly.** The public build uses the procedural bike
   (`Bike.external === false`). Keep "inspired by" language, no Royal Enfield logos, until there
   is written permission.

---

## Phase 0 — Foundation (≈ 1 week)

**Goal:** the game can be deployed publicly, measured, and safely extended.

| Item               | Detail                                                                                                                                                                                                                      | Files                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Public deploy      | Vercel or GitHub Pages from `dist/`. Confirm the procedural bike renders correctly when `public/models/` is absent (it is gitignored). Add a `PUBLIC_BUILD` env flag that skips the external model fetch entirely.          | `vite.config.ts`, `src/game/Bike.ts`, `.github/workflows/` |
| Analytics          | Privacy-friendly events (Plausible or Umami, or PostHog free tier): `run_start`, `run_end{scene,score,distance,cause}`, `share`, `retry`. No cookies, no consent banner needed.                                             | new `src/core/analytics.ts`                                |
| Test harness       | Vitest + `npm test`. First tests: `protectionFor`, `RoadPath.centerX` determinism, `seededRandom`.                                                                                                                          | `package.json`, `src/**/*.test.ts`                         |
| Game mode plumbing | Introduce `GameMode = 'free' \| 'ride' \| 'daily'` and a `Run` state machine (`idle → countdown → riding → crashed → summary`). `Game.ts` currently mixes attract, pause and ride; the run state owns the loop's branching. | new `src/game/Run.ts`, `src/game/Game.ts`                  |
| Seeded runs        | Thread a `seed` into `World.load` and every procedural placement (vegetation already uses tile index; traffic will need it).                                                                                                | `src/world/World.ts`, `src/world/scenes.ts`                |
| Perf budget        | Add a `?perf` overlay that logs draw calls, triangles, frame time. Fix anything that keeps Low quality below 30 fps on a throttled Chrome (4× CPU slowdown).                                                                | `src/game/Game.ts`, `src/ui/Hud.ts`                        |

**Exit criteria:** public URL loads on a phone in < 3 s, analytics shows a `run_end` event, `npm test`
passes in CI.

---

## Phase 1 — Make it a game (≈ 2–3 weeks)

**Goal:** a stranger opens the link, plays three runs without being told how, and sees a score.

### 1.1 Traffic and hazards

Indian roads are the content. Procedural, instanced, low-poly, pooled per direction.

- **Vehicles:** auto-rickshaw, hatchback, Tata truck, KSRTC-style bus, tanker. Two lanes each way
  using `path.centerX(z) ± laneOffset`; oncoming traffic on the right-hand side of the road.
  Spawn inside the road tile window ahead of the bike, despawn behind. Speed per class with a
  small seeded jitter; buses and trucks occasionally straddle the centre line.
- **Static hazards per scene:** cows and speed breakers (Ooty, Wayanad), potholes and puddles
  (Wayanad monsoon), rock fall and army convoys (Ladakh), autos and a two-wheeler swarm
  (Bengaluru), sand drift and parked scooters (Varkala), tea-estate tractors (Munnar).
- **Collision:** the bike is a capsule (0.4 m radius, 2.1 m long) in road space (lateral, z).
  Vehicles are AABBs in the same space. 2D test per fixed step is plenty; the fixed step is
  already 120 Hz.
- **Near-miss detection:** passing a vehicle within 1.2 m lateral at > 60 km/h, once per vehicle.
  This is the mechanic Traffic Rider players cite most.

Files: new `src/world/Traffic.ts`, `src/world/Hazards.ts`, `src/world/vehicles.ts` (procedural
meshes like `Vegetation.ts`), `SceneDef.traffic` block in `scenes.ts`.

### 1.2 Scoring

Pure module, unit-tested.

```
score = distance_m × 1
      + Σ nearMiss  × (100 + 2 × speedKmh)
      + Σ seconds above 100 km/h × 20
      + clean-corner bonus (no brake through a bend with lateral > 0.5 × road width)
      × surface multiplier (gravel 1.3, off-road 1.5)
```

Combo meter: consecutive near-misses within 4 s multiply the next by 1.5, 2, 3. Any brake tap
resets it. Show the combo on the HUD; it is the moment-to-moment feedback loop.

Files: new `src/game/Scoring.ts`, `Hud.ts` (score, combo, near-miss toast).

### 1.3 Crash and health — make protection matter

The protection score exists but changes nothing. Make it the risk dial.

- `damage = clamp((relativeSpeedKmh − 15) / 90, 0, 1) × (1 − 0.75 × protection / 100)`.
- Health bar starts at 100. Damage below 0.15 is a wobble (camera shake, speed loss). Above that
  the rider slides, the run ends when health hits 0.
- **Consequence:** full gear survives two moderate hits; no helmet ends the run on the first.
  That gives the rider a real choice in the gear screen and something to talk about.
- Crash presentation: bike lowside slide along heading, dust burst (reuse `Dust`), slow-mo for
  0.8 s, cut to summary. No ragdoll needed.

Files: new `src/game/Health.ts`, `src/game/BikePhysics.ts` (crash state), `src/game/Game.ts`.

### 1.4 Run summary and instant retry

- Summary card: score, distance, top speed, near-misses, best combo, cause of death, personal
  best per scene (localStorage). New-best celebration.
- **Retry is one key (`R` / Space / tap) and under 500 ms.** Reuse the loaded world, reseed
  traffic only.
- Countdown 3-2-1 with the engine idling, then a "Go" that lets the player launch.

Files: new `src/ui/Summary.ts`, `src/game/Run.ts`.

### 1.5 Onboarding

- First run shows three hints only: steer, gas, "pass close for points". Nothing else.
- Menu gets a big **Ride** button; Free Ride becomes a secondary option.

**Exit criteria:** median session has ≥ 3 runs; ≥ 60 % of first-time players finish a run;
30 fps on Low quality with traffic on a mid-range phone.

---

## Phase 2 — Share and compete (≈ 1–2 weeks)

**Goal:** every run can leave the tab.

| Feature         | Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Files                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Result card     | Render a 1200×630 PNG on an OffscreenCanvas: scene still (from `public/previews`), score, distance, gear silhouette, seed link. Mobile: `navigator.share({ files })`. Desktop: copy image + link to clipboard.                                                                                                                                                                                                                                                         | new `src/share/Card.ts`                   |
| Share links     | `?scene=munnar&seed=8837124&mode=ride` reproduces the exact run. Already have `?scene=` parsing in `Game.ts`.                                                                                                                                                                                                                                                                                                                                                          | `src/game/Game.ts`                        |
| Daily challenge | Seed = `YYYYMMDD` × scene index. One scene per day, rotating. Local streak counter. This is the Wordle mechanic and it works for racers.                                                                                                                                                                                                                                                                                                                               | `src/game/Run.ts`, `src/ui/Menu.ts`       |
| Leaderboards    | Supabase (free tier) table `runs(id, mode, scene, seed, score, distance_m, top_kmh, near_misses, gear, name, country, created_at)`. Boards: all-time per scene, today's daily. Name is a 3–12 char handle, no accounts. Plausibility check in a Postgres function: `score ≤ distance_m × 6`, `distance_m ≤ duration_s × 34`. Rate-limit by IP via Supabase edge function. Accept that web leaderboards get gamed; keep the daily board as the honest one and reset it. | new `src/net/leaderboard.ts`, `supabase/` |
| Ghost           | Record `(t, x, z, heading, lean)` at 10 Hz, ≈ 900 samples per run, gzipped to localStorage; top-1 ghost per daily seed stored in Supabase Storage. Render as a translucent procedural bike.                                                                                                                                                                                                                                                                            | new `src/game/Ghost.ts`                   |

**Exit criteria:** ≥ 5 % of finished runs trigger a share; daily board has ≥ 50 entries a day
after launch week.

---

## Phase 3 — Retention loop (≈ 3–4 weeks)

**Goal:** a reason to come back on day 2 and day 7.

### 3.1 Missions (data-driven)

```ts
interface Mission {
  id: string;
  scene: SceneId;
  title: string;
  type: 'distance' | 'nearMisses' | 'noBrake' | 'timeTrial' | 'deliver' | 'topSpeed' | 'survive';
  target: number;
  reward: number;
  unlocks?: string;
}
```

Start with 8 per scene (48 total). Examples: "Reach Khardung La top before dark" (timeTrial),
"Ride Munnar without touching the brakes for 2 km" (noBrake), "Deliver 3 parcels across
Bengaluru" (deliver: checkpoints), "Survive Wayanad monsoon 90 s" (survive).

Files: new `src/game/missions.ts`, `src/ui/Missions.ts`.

### 3.2 Economy and upgrades

- Coins = score ÷ 100, plus mission rewards.
- Upgrades as multipliers on `BIKE` config: power (+8 %/level), brakes, tyres (grip), suspension
  (off-road speed). Five levels each, costs escalate.
- Unlockable **original** bikes (not RE models): a 350 cc classic, a 450 cc adventure, a
  650 cc twin. Procedural like the current fallback, or licensed CC0 models.
- Gear gets stats: rain jacket +grip in monsoon, off-road boots +gravel speed, mesh jacket
  −protection +cooling (a cosmetic joke that costs nothing).

Files: new `src/game/economy.ts`, `src/game/upgrades.ts`, `src/core/settings.ts` (profile).

### 3.3 Weather and time unlocks

Existing: day, golden, night. Add monsoon (rain particles, wet-road reflection via roughness
map, reduced grip), ghat fog (denser `FogExp2`, headlights), Ladakh snow variant. Unlock with
missions.

Files: `src/world/Atmosphere.ts`, `src/world/Road.ts` (wet material), new `src/world/Weather.ts`.

### 3.4 Photo mode

Pause, free camera orbit, DoF slider, time-of-day slider, frame with a small logo, download or
share. The scenery is the best marketing asset; this makes players do the marketing.

Files: new `src/ui/PhotoMode.ts`, `src/postfx/PostFX.ts` (DoF).

**Exit criteria:** D1 retention ≥ 20 %, D7 ≥ 6 % (portal-typical benchmarks for casual racers).

---

## Phase 4 — The Indian angle (ongoing, start after Phase 2)

No popular riding game does India well. This is the wedge.

- **Named routes with checkpoints:** Manali → Leh (Rohtang, Baralacha, Khardung La), Bengaluru →
  Ooty (the 36 hairpins), Kochi → Munnar, Varkala coastal run. Route = ordered list of
  `SceneDef` segments and elevation profiles, so it is data, not new rendering.
- **Dhaba and chai stops** as mid-route save points and health top-ups. One 3D shack variant
  already exists (`shack` in `VegType`).
- **Language toggle:** Hindi, Kannada, Tamil, Malayalam for UI strings. Small `i18n.ts`, JSON
  per language, ~120 strings.
- **Clip export:** 10 s replay from the ghost buffer, rendered via `MediaRecorder` on the
  cinematic camera, shared with the result card.
- **Group ride (async):** ride alongside the ghosts of the last 3 riders on today's daily seed.
  Gives the RE-culture "group ride" feel with zero networking.

---

## Phase 5 — Distribution (runs in parallel from Phase 1)

A hit is mostly distribution. Features only make distribution possible.

| Channel                        | What it needs from us                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poki / CrazyGames**          | Score + retry loop, mobile controls, load < 5 MB initial, no external links, SDK hooks: `gameplayStart/Stop`, `commercialBreak` at run end, `rewardedBreak` for a continue. Both reject games without a fail state. Submit after Phase 1. |
| **itch.io**                    | Zip of `dist/`, three GIFs, one paragraph. Same day as Phase 1 ships.                                                                                                                                                                     |
| **Reddit**                     | r/WebGames, r/indianbikes, r/RoyalEnfield, r/india_gaming, r/bangalore. Post a 15 s clip, not a link; link in comments. Best times: Sat/Sun IST evening.                                                                                  |
| **Hacker News**                | "Show HN: A Three.js riding game through Indian hill roads" once the daily challenge exists. HN likes technical depth: procedural terrain, 6 kLOC, no engine.                                                                             |
| **Instagram / YouTube Shorts** | Photo-mode stills and clips; RE and touring communities live here.                                                                                                                                                                        |
| **RE outreach**                | Once traction exists, approach Royal Enfield with numbers for an official model licence. Until then the game is "inspired by".                                                                                                            |

---

## Metrics that decide the next phase

Instrument these from Phase 0:

| Metric                              | Phase 1 target | Phase 3 target |
| ----------------------------------- | -------------- | -------------- |
| Runs per session (median)           | ≥ 3            | ≥ 5            |
| First-run completion                | ≥ 60 %         | ≥ 70 %         |
| Share rate (shares ÷ finished runs) | —              | ≥ 5 %          |
| D1 / D7 retention                   | —              | 20 % / 6 %     |
| Median load to first frame (mobile) | < 3 s          | < 2.5 s        |

---

## Risks and how we handle them

1. **Royal Enfield IP.** Public builds use the procedural bike and "inspired by" wording. No
   RE logos, no "Royal Enfield" in the public title. The local fetch stays a dev convenience.
2. **Mobile performance with traffic.** Traffic is instanced and pooled; Low quality caps
   traffic density. Measure on a throttled Chrome every phase.
3. **Leaderboard cheating.** Plausibility checks plus a daily reset limit the damage; do not
   spend more than a day on anti-cheat.
4. **Scope creep.** Open world and real-time multiplayer are explicitly out until D7 retention
   is proven. Six scenes are enough.
5. **Solo bandwidth.** Phases 1 and 2 are the whole bet. If only one thing ships, it is a
   scored run with a share card.

---

## Suggested order of work (first 30 days)

1. Phase 0 in full.
2. Traffic + collision + crash (1.1, 1.3) — playable but unscored.
3. Scoring + summary + retry (1.2, 1.4) — ship to itch.io.
4. Result card + share links (Phase 2) — Reddit posts.
5. Daily challenge + leaderboard — Show HN.
6. Poki / CrazyGames submission.
7. Start missions and economy.

---

## Backlog (not scheduled)

- Steering wheel / gamepad support (`navigator.getGamepads`, trivial with the current `Input`).
- Wheelie and stoppie on throttle/brake at low speed (score bonus).
- Horn key. Cows move when honked. Players will love it more than any feature above.
- Cockpit-camera helmet visor overlay that fogs in rain.
- Save profile to Supabase behind an optional magic-link login.
- Real-time 2–4 player rooms (only after D7 targets are met).
