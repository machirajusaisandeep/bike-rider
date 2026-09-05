# Launch checklist

Everything the game needs to go from this repo to players. Work top to bottom; each block is
independent once the build is green.

## 0. Build variants

| Build                     | Command                                                    | Notes                                                         |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Local dev (real RE model) | `npm run fetch-model && npm run dev`                       | Model is gitignored, never deploy it.                         |
| Public web (GitHub Pages) | pushed to `main` → `.github/workflows/deploy.yml`          | Sets `VITE_PUBLIC_BUILD=1`, procedural bike only.             |
| itch.io zip               | `npm run zip:itch`                                         | Produces `bike-rider-itch.zip` with `index.html` at the root. |
| Poki                      | `VITE_PORTAL=poki VITE_PUBLIC_BUILD=1 npm run build`       | Loads the Poki SDK, enables commercial + rewarded breaks.     |
| CrazyGames                | `VITE_PORTAL=crazygames VITE_PUBLIC_BUILD=1 npm run build` | Same via the CrazyGames v3 SDK.                               |

Environment variables (all optional; the game degrades gracefully without them):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co     # leaderboards + shared ghosts
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ANALYTICS_ENDPOINT=https://.../collect    # or add a Plausible/Umami script tag to index.html
VITE_PORTAL=poki | crazygames                  # portal SDK
VITE_PUBLIC_BUILD=1                            # never reference the RE model
```

In GitHub Actions these come from repository **variables** `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`ANALYTICS_ENDPOINT`.

## 1. Backend (30 minutes, once)

1. Create a free Supabase project.
2. SQL editor → paste `supabase/schema.sql` → run. This creates `runs`, `ghosts`, the storage
   bucket, RLS policies and the server-side plausibility / rate-limit trigger.
3. Copy the project URL and anon key into the env / repo variables.
4. Verify: play a ride, the summary should read "Nth of M worldwide" instead of "on this device".

## 2. Analytics

Pick one:

- **Plausible** (paid) / **Umami** (self-hosted, free): add the script tag to `index.html`; the
  game detects `window.plausible` / `window.umami` automatically.
- **Any endpoint**: set `VITE_ANALYTICS_ENDPOINT`; events arrive as JSON
  `{ name, props, id, ts }` via `sendBeacon`.

Events: `app_open, run_start, run_end, retry, share, share_card, leaderboard_submit,
mission_complete, upgrade, photo, clip, mode_select, settings_change`.

The metrics that matter (from ROADMAP.md): runs per session ≥ 3, first-run completion ≥ 60 %,
share rate ≥ 5 %, D1 ≥ 20 %, D7 ≥ 6 %.

## 3. GitHub Pages

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Push to `main`. The workflow lints, tests, builds with `VITE_PUBLIC_BUILD=1` and deploys.
3. Update the `og:image` / `og:url` tags in `index.html` if the URL differs from
   `https://machirajusaisandeep.github.io/bike-rider/`.

## 4. itch.io (same day as the first public build)

1. `npm run zip:itch`.
2. New project → Kind: HTML → upload the zip → tick "This file will be played in the browser".
3. Viewport 1280×720, tick fullscreen + mobile friendly. Embed options: "Click to launch".
4. Three GIFs (near miss, crash, share card) and a one-paragraph description. Tags:
   `motorcycle, india, racing, endless, three.js`.

## 5. Poki / CrazyGames submission

Both portals review against roughly the same list. Before submitting, confirm:

- [ ] Loads in < 5 s on a throttled connection; first frame under 3 s on a mid-range phone.
- [ ] A score, a fail state and a one-tap retry (Ride mode does this).
- [ ] Touch controls on by default on phones; no keyboard needed.
- [ ] No external links / logos (the Share button uses the native share sheet only in portal
      builds; the "Beat it at" URL on the card is fine).
- [ ] `gameplayStart` / `gameplayStop` fire (they do: run riding ↔ summary / menu).
- [ ] Commercial break every third retry, muted; rewarded break offers a Continue after a crash.
- [ ] Sound off by default (it is) and muted during ads.
- [ ] No "Royal Enfield" wording in the public build title. The in-game copy says "Scram 411" in
      the menu heading; change `menu.scene.title` in `src/core/i18n.ts` to a generic line if a
      portal flags it.

Submit: Poki → https://developers.poki.com · CrazyGames → https://developer.crazygames.com

## 6. Distribution posts

- **Reddit**: r/WebGames, r/indianbikes, r/RoyalEnfield, r/india_gaming, r/bangalore, r/Kerala.
  Post a 15-second clip (the in-game Clip button produces one), link in the first comment.
  Weekend evening IST.
- **Hacker News**: "Show HN: A Three.js riding game through Indian hill roads (no engine, 8k LOC)".
  Wait until the daily challenge has a live board.
- **Instagram / Shorts**: photo-mode stills and clips. Tag riding communities.
- **Royal Enfield outreach**: once there are numbers, ask for an official model licence. Until
  then the public build stays "inspired by".

## 7. Day-one monitoring

- Watch `run_end` causes: if > 60 % are `lost` (off road), the first corners are too sharp for
  new players → lower `curviness` for the default scene.
- Watch `share_card` outcomes: if `failed` dominates on iOS, the clipboard path is being hit
  first; prefer the native share sheet.
- Watch the daily board for implausible scores; tighten `plausibleScore` and the SQL trigger
  together.
