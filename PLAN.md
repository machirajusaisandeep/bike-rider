# Bike Rider Project Plan

## Goal

Build a browser-based Three.js riding experience where the player controls a Royal Enfield Scram 411 White Flame style bike with arrow keys or WASD. The first screen should be the playable experience, not a marketing landing page.

## References

- Royal Enfield Scram 411/Scram 440 digital quickstart: https://www.royalenfield.com/in/en/support/digital-quickstart/scram411/explore/
- ThreeUI browse page for visual direction: https://threeui.com/browse
- Three.js docs: https://threejs.org/docs/
- Three.js GLTFLoader docs: https://threejs.org/docs/pages/GLTFLoader.html

## Key Product Requirements

- Player can ride with `WASD` and arrow keys.
- Bike appears as close as possible to the Royal Enfield Scram 411 White Flame.
- Scene renders smoothly in modern browsers that support WebGL.
- UI should feel like a polished game/tool surface: compact HUD, speed/gear indicators, control icons, pause/reset, camera mode, and settings.
- The app should be responsive across desktop and mobile browser sizes.
- Final work should be committed and pushed to `https://github.com/machirajusaisandeep/bike-rider`.

## Technical Stack

- Vite + TypeScript for the frontend project.
- Three.js for rendering.
- `GLTFLoader` for loading `.glb` / `.gltf` bike assets.
- Optional helpers:
  - `lil-gui` only for dev tuning, removed or hidden in production.
  - `stats.js` or a tiny custom FPS monitor for development.
  - `@react-three/fiber` only if the project becomes React-based; otherwise use direct Three.js for a smaller game loop.

## Asset Strategy

1. Investigate the Royal Enfield quickstart page with browser/network tooling to see whether the 3D preview uses a reusable `.glb`, `.gltf`, texture atlas, or compressed model asset.
2. Confirm asset licensing before copying any Royal Enfield-hosted model into this repo.
3. If the official asset is not legally reusable, use one of these fallbacks:
   - Create a custom Scram 411-inspired model using Blender from owner references.
   - Buy or use a properly licensed motorcycle model and customize geometry/materials/textures.
   - Use a temporary placeholder bike model during development and swap it later.
4. Recreate the White Flame styling with PBR materials/textures:
   - White tank/body base.
   - Flame graphics as decals or texture maps.
   - Black frame, seat, tires, fork details, exhaust, mirrors, and headlight assembly.
5. Optimize the final model:
   - Prefer a single `.glb`.
   - Draco or Meshopt compression if needed.
   - Texture sizes capped for web performance.
   - Separate high/medium/low quality options if the model is heavy.

## Game Design

### Core Loop

- Player starts on a scenic route with the bike centered in a third-person chase camera.
- `W` / `ArrowUp`: accelerate.
- `S` / `ArrowDown`: brake/reverse.
- `A` / `ArrowLeft`: steer left.
- `D` / `ArrowRight`: steer right.
- Space: quick brake.
- `R`: reset bike position.
- `C`: switch camera mode.

### Movement Model

- Start with arcade bike handling instead of full physics.
- Use velocity, acceleration, drag, steering angle, lean angle, and wheel rotation.
- Add visual bike lean while turning.
- Add camera smoothing and speed-based field of view.
- Keep collision simple for the first version: route bounds, reset zones, and optional obstacles.

### World

- First milestone world: endless stylized road/trail loop.
- Terrain: asphalt/gravel blend suitable for a Scram-style bike.
- Environment: roadside terrain, signs, distant hills, sky, lighting, shadows.
- Add day/dusk lighting variants once the base ride is solid.

## UI / Aesthetic Direction

- Use ThreeUI as inspiration for crisp Three.js-heavy interfaces: immersive scene first, restrained overlays, polished controls, and interactive shader accents.
- HUD elements:
  - Speed.
  - Gear/state.
  - Mini controls strip.
  - Camera mode.
  - Reset/pause/settings icon buttons.
- Avoid card-heavy marketing sections. This is a game screen, so the 3D canvas should dominate.
- Include a WebGL unsupported fallback screen with clear browser/GPU guidance.

## Browser Compatibility Plan

- Target current stable Chrome, Edge, Firefox, and Safari.
- Use WebGLRenderer first for broad support.
- Detect WebGL availability before creating the scene.
- Show a lightweight fallback if WebGL is unavailable.
- Avoid requiring WebGPU for MVP.
- Test desktop and mobile viewport sizes.
- Keep model and shader complexity adjustable for lower-end GPUs.

## Implementation Phases

### Phase 1: Project Setup

- Create Vite + TypeScript project structure.
- Add linting/formatting.
- Add Three.js dependencies.
- Create `src/main.ts`, scene bootstrap, renderer resize handling, animation loop, and asset folders.

### Phase 2: Base Riding Prototype

- Add road plane, basic lighting, and placeholder bike mesh.
- Implement keyboard input manager.
- Implement arcade movement, steering, braking, and reset.
- Add chase camera with smoothing.
- Add basic HUD.

### Phase 3: Scram 411 Model Pipeline

- Investigate official quickstart model source and license.
- Import temporary or licensed `.glb`.
- Normalize scale, pivot, orientation, and shadows.
- Add wheel spin and steering transforms if model hierarchy allows it.
- Apply White Flame materials/textures.

### Phase 4: Visual Polish

- Improve road/trail environment.
- Add sky, fog, lighting, shadows, and shader accents.
- Add speed effects: subtle camera FOV shift, motion streaks/dust, engine vibration.
- Make UI responsive and visually aligned with ThreeUI-style polish.

### Phase 5: Performance And Compatibility

- Optimize model and textures.
- Add quality setting.
- Add WebGL support detection.
- Test in Chrome, Safari, Firefox, and mobile-sized viewports.
- Fix layout overflow and canvas sizing issues.

### Phase 6: Repository And Release

- Add README with setup, controls, asset/license notes, and deployment instructions.
- Commit project files.
- Add GitHub remote:
  - `git remote add origin https://github.com/machirajusaisandeep/bike-rider`
- Push:
  - `git push -u origin main`

## Definition Of Done

- App starts locally with one command.
- Bike is controllable with WASD and arrow keys.
- Scram 411 White Flame visual target is represented by a licensed or original asset.
- UI renders cleanly at desktop and mobile sizes.
- WebGL unsupported browsers receive a fallback message.
- README documents controls and asset provenance.
- Code is committed and pushed to the GitHub repo.

## Open Questions

- Can the Royal Enfield-hosted 3D model be legally reused, or should the project use an original/licensed model?
- Should the first route feel like city asphalt, mountain roads, or a mixed Scram-style trail?
- Should mobile touch controls be part of MVP or a follow-up?
