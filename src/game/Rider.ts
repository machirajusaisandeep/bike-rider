import {
  AnimationAction,
  AnimationMixer,
  Bone,
  Color,
  DoubleSide,
  Group,
  LoopOnce,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Texture,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACO_DECODER_PATH } from '../core/config';
import {
  browAlphaTexture,
  irisTexture,
  scleraTexture,
  strandTexture,
  textileTexture,
} from './RiderMaterials';
import {
  FACES,
  GEAR_BY_ID,
  HAIR_COLORS,
  HAIR_OUT,
  SKIN_TONES,
  TURBAN_COLORS,
  type BodyType,
  type RiderConfig,
} from './gear';

export type RiderPose = 'ride' | 'stand';

/** Gear item id -> mesh names inside the rider GLB. */
const GEAR_MESHES: Record<string, string[]> = {
  'lightwing-open': ['gear_helmet_open', 'gear_helmet_visor_open'],
  'lightwing-flame': ['gear_helmet_full', 'gear_helmet_visor_full', 'gear_helmet_checks'],
  'streetwind-full': ['gear_helmet_full', 'gear_helmet_visor_full', 'gear_helmet_rewing'],
  'streetwind-v2': ['gear_jacket_sw'],
  windfarer: ['gear_jacket_wf'],
  'explorer-v3': ['gear_jacket_ex'],
  intrepid: ['gear_gloves_intrepid'],
  cragsman: ['gear_gloves_cragsman'],
  stalwart: ['gear_gloves_stalwart'],
  'knox-elbow': ['gear_elbow'],
  'soft-knee': ['gear_knee_soft'],
  conqueror: ['gear_knee_shell'],
  'riding-sneakers': ['gear_boots_cabo'],
  'ankle-boots': ['gear_boots_marshall'],
  'adventure-boots': ['gear_boots_touring'],
};

const DEFAULT_IRIS = '#3a2010';
const BINDI_COLORS: Record<string, string> = { red: '#b3121b', black: '#141414' };

/** Material role: "<garment>.<role>" for baked product colours, else the material name. */
function roleOf(name: string): string {
  const dot = name.indexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : name;
}

interface Asset {
  scene: Group;
  meshes: Map<string, Object3D>;
  morphMeshes: Mesh[];
  mixer: AnimationMixer;
  actions: Record<RiderPose, AnimationAction>;
  head: Bone | null;
  chest: Bone | null;
  chestRestX: number;
  materials: Record<string, MeshStandardMaterial>;
}

/**
 * Realistic rider built from Blender Studio's CC0 Human Base Meshes (see scripts/blender).
 * One GLB per body type carries the skinned body with baked skin textures, eyes, face morph
 * targets (also on the brow / lash / kajal / beard shells), hair, turban, accents and every
 * gear shell; `apply()` toggles visibility, morphs and colours to match the config.
 */
export class Rider {
  readonly root = new Group();
  private assets = new Map<BodyType, Asset>();
  private active: Asset | null = null;
  private config: RiderConfig | null = null;
  private pose: RiderPose = 'ride';
  private headYaw = 0;
  private idleTime = 0;
  private textiles = {
    mesh: textileTexture('mesh'),
    weave: textileTexture('weave'),
    leather: textileTexture('leather'),
    denim: textileTexture('denim'),
  };
  private strand = strandTexture();
  private sclera = scleraTexture();
  private browAlpha = browAlphaTexture();
  private irises = new Map<string, Texture>();
  /** Fires after a body swap has finished loading. */
  onLoaded: (() => void) | null = null;

  constructor() {
    this.root.name = 'rider';
  }

  get current(): RiderConfig | null {
    return this.config;
  }

  get ready(): boolean {
    return this.active !== null;
  }

  /** Character screen: hide the lid on face / hair tabs so the head stays visible. */
  private showHelmet = true;

  setShowHelmet(on: boolean): void {
    this.showHelmet = on;
    if (this.config) this.applyLook(this.config);
  }

  apply(cfg: RiderConfig): void {
    const swap = !this.config || this.config.body !== cfg.body;
    this.config = cfg;
    if (swap) {
      void this.load(cfg.body).then(() => {
        if (this.config?.body === cfg.body) this.applyLook(this.config);
        this.onLoaded?.();
      });
      return;
    }
    this.applyLook(cfg);
  }

  setPose(pose: RiderPose): void {
    this.pose = pose;
    this.root.rotation.z = 0;
    if (pose === 'ride') this.root.position.y = 0;
    if (!this.active) return;
    for (const [k, a] of Object.entries(this.active.actions) as [RiderPose, AnimationAction][]) {
      a.enabled = k === pose;
      a.setEffectiveWeight(k === pose ? 1 : 0);
      a.paused = true;
      a.time = 0;
    }
    this.active.mixer.update(0);
    if (this.active.chest) this.active.chestRestX = this.active.chest.rotation.x;
  }

  /** Subtle life: head follows steering. Crash dumps the body with the lowside. */
  update(steerAngle: number, dt: number, crashed = false): void {
    this.idleTime += dt;
    if (this.pose === 'stand' && this.active?.chest) {
      this.active.chest.rotation.x = this.active.chestRestX + Math.sin(this.idleTime * 1.7) * 0.006;
    }
    if (this.active?.head) {
      const target =
        this.pose === 'ride' && !crashed
          ? -steerAngle * 0.8
          : Math.sin(this.idleTime * 0.4) * 0.035;
      this.headYaw += (target - this.headYaw) * Math.min(1, 6 * dt);
      this.active.head.rotation.y = this.headYaw;
    }
    const dump = crashed ? 0.55 : 0;
    const drop = crashed ? -0.15 : 0;
    this.root.rotation.z += (dump - this.root.rotation.z) * Math.min(1, 8 * dt);
    const y = this.root.position.y;
    const baseY = crashed ? drop : y > -0.01 ? y : 0;
    this.root.position.y += (baseY - this.root.position.y) * Math.min(1, 8 * dt);
    if (!crashed && this.pose === 'ride') {
      this.root.rotation.z += (0 - this.root.rotation.z) * Math.min(1, 8 * dt);
      if (this.root.position.y < -0.001)
        this.root.position.y += (0 - this.root.position.y) * Math.min(1, 8 * dt);
    }
  }

  private iris(hex: string): Texture {
    let tex = this.irises.get(hex);
    if (!tex) {
      tex = irisTexture(hex);
      this.irises.set(hex, tex);
    }
    return tex;
  }

  /** Replace a glTF material with the runtime look for its role. Returns the material to share. */
  private upgrade(std: MeshStandardMaterial): MeshStandardMaterial {
    const name = std.name;
    if (name.startsWith('skin')) {
      // Baked albedo (features, warmth, periorbital shading) multiplied by the swatch colour.
      // Sheen stands in for the soft sub-surface look without the cost of transmission.
      const phys = new MeshPhysicalMaterial({
        map: std.map,
        roughnessMap: std.roughnessMap,
        roughness: std.roughnessMap ? 1 : 0.62,
        metalness: 0,
        sheen: 0.18,
        sheenRoughness: 0.5,
        sheenColor: new Color('#b07a5a'),
        specularIntensity: 0.4,
      });
      phys.name = name;
      return phys;
    }
    if (name === 'sclera') {
      std.map = this.sclera;
      std.roughness = 0.4;
      std.color.set('#d9d1c8');
      return std;
    }
    if (name === 'iris') {
      std.map = this.iris(DEFAULT_IRIS);
      std.roughness = 0.6;
      std.color.set('#ffffff');
      return std;
    }
    if (name === 'cornea') {
      const cornea = new MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.03,
        metalness: 0,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        clearcoat: 0.5,
        clearcoatRoughness: 0.04,
        specularIntensity: 0.5,
      });
      cornea.name = name;
      return cornea;
    }
    if (name === 'hair') {
      // Strand tile for colour breakup and bump only: a roughness map made black hair read as
      // grey under the three studio lights. Sheen stays low and takes the hair colour.
      const hair = new MeshPhysicalMaterial({
        map: this.strand,
        bumpMap: this.strand,
        bumpScale: 0.0008,
        roughness: 0.92,
        metalness: 0,
        specularIntensity: 0.5,
        sheen: 0.12,
        sheenRoughness: 0.6,
        sheenColor: new Color('#3a2a20'),
      });
      hair.name = name;
      return hair;
    }
    if (name === 'brow') {
      std.alphaMap = this.browAlpha;
      std.alphaTest = 0.45;
      std.bumpMap = this.strand;
      std.bumpScale = 0.0004;
      std.roughness = 1;
      return std;
    }
    if (name === 'beard') {
      std.bumpMap = this.strand;
      std.bumpScale = 0.0006;
      std.roughness = 1;
      return std;
    }
    if (name === 'lash' || name === 'kajal') {
      std.roughness = 1;
      return std;
    }
    if (name === 'turban') {
      std.map = this.textiles.weave;
      std.bumpMap = this.textiles.weave;
      std.bumpScale = 0.0004;
      std.roughness = 0.92;
      return std;
    }
    if (name === 'visor') {
      const visor = new MeshPhysicalMaterial({
        color: '#aabac0',
        roughness: 0.08,
        metalness: 0.05,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        side: DoubleSide,
      });
      visor.name = name;
      return visor;
    }
    if (name === 'helmet' || name === 'helmet_graphic' || name === 'helmet_check') {
      const paint = new MeshPhysicalMaterial({
        color: std.color,
        roughness: name === 'helmet' ? 0.3 : 0.45,
        metalness: 0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
      });
      paint.name = name;
      return paint;
    }
    const role = roleOf(name);
    const textile = (map: Texture, bump: number, rough: number) => {
      std.map = map;
      std.bumpMap = map;
      std.bumpScale = bump;
      std.roughness = rough;
    };
    if (role === 'mesh' || role === 'mesh_black') textile(this.textiles.mesh, 0.0009, 0.97);
    else if (
      ['textile', 'cordura', 'trim', 'shirt', 'velcro', 'strap_black', 'lining'].includes(role)
    )
      textile(this.textiles.weave, 0.0003, 0.9);
    else if (role.startsWith('leather') || role === 'counter')
      textile(this.textiles.leather, 0.00035, 0.62);
    else if (role === 'pants') textile(this.textiles.denim, 0.0004, 0.92);
    return std;
  }

  private async load(body: BodyType): Promise<void> {
    let asset = this.assets.get(body);
    if (!asset) {
      const base = import.meta.env.BASE_URL;
      const draco = new DRACOLoader();
      draco.setDecoderPath(base + DRACO_DECODER_PATH);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      const gltf = await loader.loadAsync(`${base}models/rider_${body}.glb`);
      draco.dispose();
      const scene = gltf.scene;
      const meshes = new Map<string, Object3D>();
      const morphMeshes: Mesh[] = [];
      const materials: Record<string, MeshStandardMaterial> = {};
      let head: Bone | null = null;
      let chest: Bone | null = null;
      scene.traverse((o) => {
        if ((o as Bone).isBone && o.name === 'head') head = o as Bone;
        if ((o as Bone).isBone && o.name === 'chest') chest = o as Bone;
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
        if (m.morphTargetDictionary) morphMeshes.push(m);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const std = mat as MeshStandardMaterial;
          if (!std.name || materials[std.name]) continue;
          materials[std.name] = this.upgrade(std);
        }
      });
      // glTF can clone materials for different vertex layouts. Share each named role so
      // both visors and every boot component receive the selected colour and visibility.
      scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const resolved = mats.map((mat) => materials[mat.name] ?? mat);
        o.material = Array.isArray(o.material) ? resolved : resolved[0]!;
        // the transparent cornea draws after the iris behind it
        if (resolved.some((m) => m.name === 'cornea')) o.renderOrder = 2;
      });
      // Optional parts are the named children of the armature / scene root. A multi-material
      // part imports as a Group of meshes, so we key on the top-level node and toggle subtrees.
      const isPart = (n: string) =>
        n.startsWith('hair_') ||
        n.startsWith('gear_') ||
        n.startsWith('beard_') ||
        n.startsWith('accent_') ||
        n === 'brows' ||
        n === 'lashes';
      scene.traverse((o) => {
        if (o.name && isPart(o.name)) {
          const parentIsPart = !!o.parent && isPart(o.parent.name);
          if (!parentIsPart) meshes.set(o.name, o);
        }
      });
      const mixer = new AnimationMixer(scene);
      const actions = {} as Record<RiderPose, AnimationAction>;
      for (const clip of gltf.animations) {
        const key: RiderPose | null =
          clip.name === 'Ride' ? 'ride' : clip.name === 'Stand' ? 'stand' : null;
        if (!key) continue;
        const a = mixer.clipAction(clip);
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
        a.play();
        actions[key] = a;
      }
      asset = { scene, meshes, morphMeshes, mixer, actions, head, chest, chestRestX: 0, materials };
      this.assets.set(body, asset);
    }
    if (this.config?.body !== body) return;
    if (this.active) this.root.remove(this.active.scene);
    this.active = asset;
    this.root.add(asset.scene);
    this.setPose(this.pose);
  }

  private applyLook(cfg: RiderConfig): void {
    const a = this.active;
    if (!a) return;
    const show = (name: string, on: boolean) => {
      const o = a.meshes.get(name);
      if (!o) return;
      o.visible = on;
      o.traverse((c) => (c.visible = on));
    };
    // visibility: hide all optional shells first
    for (const name of a.meshes.keys()) show(name, false);
    const helmetId = this.showHelmet ? cfg.gear.helmet : null;
    const helmet = helmetId ? GEAR_BY_ID[helmetId] : null;
    const fullFace = helmet?.style === 'full';
    // The cap of a style (and the turban) never shows under a helmet; styles listed in HAIR_OUT
    // carry a second part below the helmet rim that stays visible.
    show(`hair_${cfg.hair}`, !helmet);
    show(`hair_${cfg.hair}_out`, HAIR_OUT.includes(cfg.hair));
    show('brows', !fullFace);
    show('lashes', !fullFace);
    show('accent_kajal', cfg.kajal && !fullFace);
    show('accent_bindi', cfg.bindi !== 'none' && !fullFace);
    show(`accent_earring_${cfg.earrings}`, cfg.earrings !== 'none' && !helmet);
    if (cfg.body === 'male' && cfg.beard !== 'none') show(`beard_${cfg.beard}`, !fullFace);
    for (const [slot, id] of Object.entries(cfg.gear)) {
      if (!id) continue;
      if (slot === 'helmet' && !this.showHelmet) continue;
      for (const name of GEAR_MESHES[id] ?? []) show(name, true);
    }
    // morphs: the body and every face shell carry the same target names
    const face = FACES[cfg.body].find((f) => f.id === cfg.face) ?? FACES[cfg.body][0]!;
    for (const m of a.morphMeshes) {
      const dict = m.morphTargetDictionary!;
      const infl = m.morphTargetInfluences!;
      for (const [name, idx] of Object.entries(dict)) infl[idx] = face.morphs[name] ?? 0;
    }
    // colours
    const skin = SKIN_TONES.find((s) => s.id === cfg.skin)?.hex ?? '#bb885c';
    const hairHex = HAIR_COLORS.find((c) => c.id === cfg.hairColor)?.hex ?? '#15110f';
    const set = (mat: string, hex: string | undefined, rough?: number) => {
      const m = a.materials[mat];
      if (!m || !hex) return;
      m.color = new Color(hex);
      if (rough !== undefined) m.roughness = rough;
    };
    // The baked albedo is authored high-key (mean ~0.8 linear). Under the studio key the lit
    // cheek still reads ~1.3x the swatch, so a small calibration factor brings it back to ~1.1x.
    for (const name of ['skin', 'skin_feet', 'skin_hands', 'skin_arms']) {
      set(name, skin);
      a.materials[name]?.color.multiplyScalar(0.88);
    }
    if (a.materials.skin_feet) a.materials.skin_feet.visible = !cfg.gear.boots;
    if (a.materials.skin_hands) a.materials.skin_hands.visible = !cfg.gear.gloves;
    if (a.materials.skin_arms) a.materials.skin_arms.visible = !cfg.gear.jacket;
    set('hair', hairHex);
    const hairMat = a.materials.hair as MeshPhysicalMaterial | undefined;
    if (hairMat?.sheenColor) hairMat.sheenColor.set(hairHex).lerp(new Color('#ffffff'), 0.12);
    set('brow', new Color(hairHex).lerp(new Color(skin), 0.12).getStyle(), 1);
    set('beard', hairHex);
    set('lash', '#14100e');
    set('turban', TURBAN_COLORS.find((c) => c.id === cfg.turbanColor)?.hex ?? '#e8730a');
    set('bindi', BINDI_COLORS[cfg.bindi] ?? BINDI_COLORS.red);
    const irisMat = a.materials.iris;
    if (irisMat) irisMat.map = this.iris(face.iris ?? DEFAULT_IRIS);
    // Garment colours are baked per product in the GLB; only the helmet paint is configurable.
    if (a.materials.shirt) a.materials.shirt.visible = !cfg.gear.jacket;
    const matt = helmet?.colorway?.toLowerCase().includes('matt') ?? false;
    set('helmet', helmet?.color, matt ? 0.62 : 0.28);
    set('helmet_graphic', helmet?.accent ?? '#a62630');
    // Shirt: off-white cotton for men, pale blue for women when no jacket. Real cotton sits at
    // ~0.6 linear albedo; a near-1.0 "white" blew out and tripped bloom under the sun.
    set('shirt', cfg.body === 'female' ? '#aebbca' : '#cfc8b8', 0.92);
    set('pants', '#303d48', 0.95);
  }
}

export function isSkinned(o: Object3D): o is SkinnedMesh {
  return (o as SkinnedMesh).isSkinnedMesh === true;
}
