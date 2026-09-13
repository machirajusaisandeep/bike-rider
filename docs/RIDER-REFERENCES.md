# Rider fitting bay

Reference pass: 6 September 2026. The GLBs are original, rigged reconstructions from
Blender Studio's CC0 Human Base Meshes. They are not Royal Enfield CAD, scans, or
official product assets. Product silhouettes, garment panels and materials are
approximations built from published product descriptions and reviews; the catalogue
links below are the source of product facts. Official store pages block automated
readers, so facts were cross-checked against retailer listings and press reviews. Where
a detail could not be verified (exact graphic placement, strap counts, sole colours) the
model uses a plausible reading and it is marked below.

## How garments are built

`scripts/blender/rider_wardrobe.py` wraps each garment around the actual body: for a
stack of rings along the torso, arm, shin or foot it measures the body's largest radius
in every angular sector, adds a fabric ease, and smooths the outline like tensioned cloth
while never dipping below the body. Torso and sleeve rings exclude each other's vertices
by testing against the arm axis, so the jacket has real shoulders instead of a tube and the
same code fits both bodies. Each product is a separate mesh with its panel layout and
colours baked into `<garment>.<role>` materials; the runtime adds only textures per role.

Helmets follow a measured profile: an ellipsoid cap, cheeks that taper under the ears, a
forward chin bar on the full face and a jet rim on the open face, a rectangular eye port
with a rubber gasket, a curved polycarbonate visor on side pivots, three intake vents,
one exhaust, and separate colourway appliques so a graphic change is a mesh toggle.

## References and applied details

| Item                          | Reference                                                                                                                  | Modelled                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lightwing Rewing, grey        | [Royal Enfield](https://royalenfield.store/in/en/lwing-ff-rewing-i-abs-gi-grey-xl620), ZigWheels and Autocar India reviews | Full-face ABS shell, three closable intake vents and one exhaust, clear visor, sun-visor lever on the left cheek, chin vent grille, wordmark on the chin bar, rear badge, winged red / white stripe pair (placement approximate) |
| Lightwing Checks, black / red | [Royal Enfield](https://royalenfield.store/in/en/lwing-f-f-helmet-checks-matred-xl-62-cm-matt-black-red)                   | Same shell in matt black (matt roughness at runtime) with a chequered red / white band low on the sides and back (band placement unverified)                                                                                     |
| Jet MLG Neo, black / red      | [Royal Enfield open-face helmets](https://royalenfield.store/in/en/helmets/open-face-helmets), Gearzone listing            | Jet shell with a cheek-following rim, long clear visor on external pivots, MLG 1901 roundel and wordmark at the back                                                                                                             |
| Streetwind V2, black          | [Royal Enfield](https://store.royalenfield.com/en/streetwind-v2-jacket-black), Vroomhead review                            | Near-total black mesh, 600D shoulders and elbows, two zipped hand pockets, reflective shoulder piping, left-chest badge, back wordmark, bicep / forearm / waist adjusters, black zips. Armour internal                           |
| Windfarer V2, green / black   | [Royal Enfield](https://royalenfield.store/in/en/windfarer-v2-green-3xl-48-cm-green), Autocar India review                 | Olive mesh body, black Cordura yoke, shoulders and elbow patches, black hem and collar, red zip pulls, reflective piping, deep waist pockets, adjusters. Ergo Pro-Tech armour internal                                           |
| Explorer V3, grey             | [Royal Enfield](https://store.royalenfield.com/en/exp-v3-riding-jkt-grey-3xl-48-cm-grey), BikeWale review                  | Grey 600D shell, mesh chest, inner-arm and back panels, darker Cordura shoulders and elbows, chest pocket zip, reflective badge, five pockets. Modelled with armour fitted; shell-only SKUs exclude protectors                   |
| Intrepid gloves               | Royal Enfield riding gloves, retailer listings                                                                             | Short cuff, olive camo back, black palm, padded low-profile knuckle, TPR wrist tab                                                                                                                                               |
| Cragsman gloves               | Royal Enfield riding gloves, Store4Riders listing                                                                          | Black leather with brown palm, hard knuckle, longer gauntlet cuff                                                                                                                                                                |
| Stalwart, black / olive       | [Royal Enfield](https://royalenfield.store/in/en/stalwart-gloves-black-olive-2xl-24cm-black-olive)                         | Black perforated leather, olive palm panel, hard Knox knuckle, TPR wrist strap (which side is olive is unverified)                                                                                                               |
| Knox Challenger, grey / black | [Royal Enfield](https://store.royalenfield.com/en/re-knox-external-knee-armour-l1-grey-black)                              | Single grey LDPE plate wrapped around the knee with perforations, dark backing, two elasticated straps                                                                                                                           |
| Knox Conqueror                | [Knox](https://www.planet-knox.com/ro/ce-certified-knox-royal-enfield-conqueror-knee-guard/), Bike India, evo India        | Longer black plate over knee and upper shin, perforations, three straps (count unverified), Knox mark                                                                                                                            |
| Cabo WP                       | [Royal Enfield riding footwear](https://royalenfield.store/in/en/riding/shoes), IAMABIKER first look                       | Black laced ankle sneaker boot wrapped around the foot, toe and heel counters, moulded sole, eyelets, reflective pull loop                                                                                                       |
| Marshall                      | [Royal Enfield riding footwear](https://royalenfield.store/in/en/riding/shoes), Store4Riders listing                       | Tan leather lace boot, toe and heel counters, toe shift patch on the left boot, grooved sole, rear loop                                                                                                                          |

The universal elbow guards and tall touring boots remain generic and are identified as
such. Prices are omitted. Game loadout points are separate from certification and do not
estimate real injury protection. Equipment IDs are unchanged so saved configurations
still load.

The female fit adapts the same reference garments to the female rig; it is not a claim
about an official women's SKU. Long hair is tucked to collar height so it does not pass
through jackets. Faces are stylized, not scanned human likenesses.

## Faces, skin, eyes, hair (13 September 2026 pass)

The riders are built to read as Indian riders rather than generic mannequins:

- **Face shape keys** (`scripts/blender/rider_face.py`): fourteen analytic fields
  (`face_round`, `face_long`, `jaw_wide`, `jaw_narrow`, `cheekbones_high`, `cheeks_full`,
  `brow_heavy`, `nose_broad`, `nose_bridge`, `nose_tip_down`, `lips_full`, `eyes_large`,
  `eyes_almond`, `lids_heavy`). `nose_bridge`, `face_long` and `eyes_large` are bipolar. The
  same fields are baked as shape keys on the brow, lash, kajal and beard shells, so every face
  part follows the preset. Eight presets per body in `src/game/rider-presets.json` cover
  north, south, east / north-east and west looks; ids of the original six are unchanged.
- **Skin**: a Cycles bake of per-vertex features (lip colour and vermilion border, cheek and
  nose-tip warmth, periorbital shading, under-brow shading, darker knuckles / elbows / knees,
  lighter palms and soles) with fine noise and pores from texture nodes, into a 2048 albedo
  and 512 roughness image embedded in the GLB as JPEG. The bundle's 9 x 2 UDIM layout is
  repacked into the unit square first (the head keeps 56 % of the width). The texture is
  authored high-key (mean ~0.8 linear) so the swatch colour multiplies it at runtime.
- **Eyes**: sclera sphere with a corneal opening, recessed iris disc with planar UVs, cornea
  cap, upper lashes; the runtime adds sclera, iris and cornea materials from canvas textures.
  The bundle's lids stare, so the lids are settled onto the eyeball before morphs are authored.
- **Hair** (`scripts/blender/rider_hair.py`): shaped volumes cut from the scalp with a natural
  hairline (per-style temple recession, low nape), straightened and rounded rims, displacement
  for volume, strand-oriented UVs and a runtime strand tile. Men: crop, side part, slick back,
  undercut, curly, quiff, buzz, long, turban, shaved. Women: long (centre parting, neck sides),
  braid (choti), low bun, bob, low ponytail, curly, side, crop, buzz. Styles that hang below the
  helmet rim export a second `hair_<id>_out` part that stays visible with a helmet.
- **Turban (pagri)**: dome plus seven flattened wrapped layers whose alternating tilt forms the
  front V, with a tucked end across the crown. It is a hair option, recoloured from
  `turbanColors`, and hidden whenever a helmet is shown so it can never clip one.
- **Accents**: kajal (both bodies, on by default for women), bindi (red / black) and earrings
  (studs / jhumka) for women. All are meshes toggled by `Rider.ts`.
- **Thumbnails** (`scripts/blender/rider_thumbs.py`): EEVEE renders lit like the fitting bay,
  with the armature forced to its rest position (the depsgraph otherwise evaluated some head
  parts with the Ride pose, which is what displaced the old female thumbnails).

## Rendering and interaction

- Independent fitting-bay scene: neutral walls, warm key, cool fill, two rims, soft
  shadows and a low painted band. Road weather no longer changes inspection colours.
- Baked product colours plus shared air-mesh, ripstop, leather and denim textures.
- Helmet paint uses a clearcoat material; matt colourways switch to a matt roughness.
- Mouse/touch orbit, zoom, rotation buttons, reset, separate head/full-body views,
  and subtle idle breathing.

## Rebuilding

Download [Blender Studio's CC0 bundle](https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip).
Use Blender 5.2 and run for each `male` / `female` body:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b human_base_meshes_bundle.blend \
  --python scripts/blender/build_rider.py -- male public/models/rider_male.glb \
  src/game/rider-presets.json public/previews/rider
```

`rider_wardrobe.py` is loaded by the builder with the normalized body landmarks and
rig. To inspect a loadout without the browser:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/render_rider.py -- \
  public/models/rider_male.glb out/ \
  hair_crop,gear_helmet_full,gear_helmet_visor_full,gear_helmet_rewing,gear_jacket_wf,gear_gloves_stalwart,gear_knee_shell,gear_boots_marshall \
  quarter,head,headside,feet
```

Mesh names: `gear_helmet_{open,full}`, `gear_helmet_visor_{open,full}`, `gear_helmet_{checks,rewing}`,
`gear_jacket_{sw,wf,ex}`, `gear_gloves_{intrepid,stalwart,cragsman}`, `gear_elbow`,
`gear_knee_{soft,shell}`, `gear_boots_{cabo,marshall,touring}`, `hair_<style>` and
`hair_<style>_out`, `brows`, `lashes`, `beard_{stubble,moustache,full}`, `accent_kajal`,
`accent_bindi`, `accent_earring_{studs,jhumka}`, `Eye.{L,R}`, `Iris.{L,R}`, `Cornea.{L,R}`.
A fifth argument `src/game/rider-presets.json:<faceId>` applies that preset's morphs to every
shape-keyed mesh. The build writes baked textures to `$RIDER_SCRATCH` (default
`<out dir>/.rider-bake`); build into a scratch directory and only copy `rider_*.glb` and the
previews into `public/` once the head renders look right. Then bump `RIDER_ASSET_VERSION` in
`src/core/config.ts`: the files keep their names, and the query string is what stops browsers
from serving a cached model from an earlier deploy (which showed up as gear missing after a
body swap).

## Verification

Run `npm run build`, `npm run lint`, `npm test`, and (with Vite on port 5199)
`node audit/rider-review.mjs`. The browser audit writes current screenshots,
canvas-pixel measurements, render statistics and interaction assertions to
`audit-output/rider-review/`. It covers both bodies, gear variants, facial hair,
skin and hair changes, desktop/laptop/phone framing, orbit controls, the road
menu, and a ride using real keyboard input. Screenshots are reviewed manually;
no pixel-perfect screenshot baseline is imposed on the animated scene.
