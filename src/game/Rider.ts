import {
  AnimationAction,
  AnimationMixer,
  Bone,
  Color,
  Group,
  LoopOnce,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACO_DECODER_PATH } from '../core/config';
import {
  FACES,
  GEAR_BY_ID,
  HAIR_COLORS,
  SKIN_TONES,
  type BodyType,
  type RiderConfig,
} from './gear';

export type RiderPose = 'ride' | 'stand';

/** Gear item id -> mesh names inside the rider GLB. */
const GEAR_MESHES: Record<string, string[]> = {
  'lightwing-open': ['gear_helmet_open'],
  'lightwing-flame': ['gear_helmet_open'],
  'streetwind-full': ['gear_helmet_full', 'gear_helmet_visor'],
  'streetwind-v2': ['gear_jacket'],
  windfarer: ['gear_jacket', 'gear_jacket_armour'],
  'explorer-v3': ['gear_jacket', 'gear_jacket_armour', 'gear_jacket_back'],
  intrepid: ['gear_gloves_short'],
  cragsman: ['gear_gloves_gauntlet'],
  stalwart: ['gear_gloves_gauntlet'],
  'knox-elbow': ['gear_elbow'],
  'soft-knee': ['gear_knee_soft'],
  conqueror: ['gear_knee_shell'],
  'riding-sneakers': ['gear_boots_sneaker'],
  'ankle-boots': ['gear_boots_ankle'],
  'adventure-boots': ['gear_boots_tall'],
};

interface Asset {
  scene: Group;
  meshes: Map<string, Object3D>;
  morphMeshes: Mesh[];
  mixer: AnimationMixer;
  actions: Record<RiderPose, AnimationAction>;
  head: Bone | null;
  materials: Record<string, MeshStandardMaterial>;
}

/**
 * Realistic rider built from Blender Studio's CC0 Human Base Meshes (see scripts/blender).
 * One GLB per body type carries the skinned body, face morph targets, hair / brow / beard shells
 * and every gear shell; `apply()` toggles visibility, morphs and colours to match the config.
 */
export class Rider {
  readonly root = new Group();
  private assets = new Map<BodyType, Asset>();
  private active: Asset | null = null;
  private config: RiderConfig | null = null;
  private pose: RiderPose = 'ride';
  private headYaw = 0;
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
    if (!this.active) return;
    for (const [k, a] of Object.entries(this.active.actions) as [RiderPose, AnimationAction][]) {
      a.enabled = k === pose;
      a.setEffectiveWeight(k === pose ? 1 : 0);
      a.paused = true;
      a.time = 0;
    }
    this.active.mixer.update(0);
  }

  /** Subtle life: head follows steering. Poses are static so we only touch the head bone. */
  update(steerAngle: number, dt: number): void {
    if (!this.active?.head) return;
    const target = this.pose === 'ride' ? -steerAngle * 0.5 : 0;
    this.headYaw += (target - this.headYaw) * Math.min(1, 6 * dt);
    this.active.head.rotation.y = this.headYaw;
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
      scene.traverse((o) => {
        if ((o as Bone).isBone && o.name === 'head') head = o as Bone;
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
        if (m.morphTargetDictionary) morphMeshes.push(m);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const std = mat as MeshStandardMaterial;
          if (std.name && !materials[std.name]) {
            // Upgrade skin to a physical material with sheen for a softer, less plastic look.
            if (std.name === 'skin') {
              const phys = new MeshPhysicalMaterial({
                color: std.color,
                roughness: 0.62,
                metalness: 0,
                sheen: 0.35,
                sheenRoughness: 0.6,
              });
              phys.name = 'skin';
              m.material = phys;
              materials.skin = phys;
              continue;
            }
            materials[std.name] = std;
          }
        }
      });
      // Optional parts are the named children of the armature / scene root. A multi-material
      // part imports as a Group of meshes, so we key on the top-level node and toggle subtrees.
      scene.traverse((o) => {
        if (
          o.name &&
          (o.name.startsWith('hair_') ||
            o.name.startsWith('gear_') ||
            o.name.startsWith('beard_') ||
            o.name === 'brows')
        ) {
          const parentIsPart =
            o.parent &&
            (o.parent.name.startsWith('hair_') ||
              o.parent.name.startsWith('gear_') ||
              o.parent.name.startsWith('beard_'));
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
      asset = { scene, meshes, morphMeshes, mixer, actions, head, materials };
      this.assets.set(body, asset);
    }
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
    for (const name of a.meshes.keys()) {
      if (name !== 'brows') show(name, false);
    }
    const helmetId = this.showHelmet ? cfg.gear.helmet : null;
    const helmet = helmetId ? GEAR_BY_ID[helmetId] : null;
    const fullFace = helmet?.style === 'full';
    // Hair hides under a helmet, except styles that hang out the back.
    const hairOut = cfg.hair === 'long' || cfg.hair === 'ponytail';
    show(`hair_${cfg.hair}`, !fullFace && (!helmet || hairOut));
    show('brows', !fullFace);
    if (cfg.body === 'male' && cfg.beard !== 'none') show(`beard_${cfg.beard}`, !fullFace);
    for (const [slot, id] of Object.entries(cfg.gear)) {
      if (!id) continue;
      if (slot === 'helmet' && !this.showHelmet) continue;
      for (const name of GEAR_MESHES[id] ?? []) show(name, true);
    }
    // morphs
    const face = FACES[cfg.body].find((f) => f.id === cfg.face) ?? FACES[cfg.body][0]!;
    for (const m of a.morphMeshes) {
      const dict = m.morphTargetDictionary!;
      const infl = m.morphTargetInfluences!;
      for (const [name, idx] of Object.entries(dict)) infl[idx] = face.morphs[name] ?? 0;
    }
    // colours
    const skin = SKIN_TONES.find((s) => s.id === cfg.skin)?.hex ?? '#c8916a';
    const hairHex = HAIR_COLORS.find((c) => c.id === cfg.hairColor)?.hex ?? '#15110f';
    const set = (mat: string, hex: string | undefined, rough?: number) => {
      const m = a.materials[mat];
      if (!m || !hex) return;
      m.color = new Color(hex);
      if (rough !== undefined) m.roughness = rough;
    };
    set('skin', skin);
    set('hair', hairHex);
    set('brow', hairHex);
    set('beard', hairHex);
    set('iris', cfg.body === 'female' ? '#3b2413' : '#2a170d');
    const jacket = cfg.gear.jacket ? GEAR_BY_ID[cfg.gear.jacket] : null;
    set('jacket', jacket?.color, jacket?.style === 'mesh' ? 0.95 : 0.65);
    set('jacket_accent', jacket?.accent ?? '#1f2226');
    const gloves = cfg.gear.gloves ? GEAR_BY_ID[cfg.gear.gloves] : null;
    set('gloves', gloves?.color);
    const knee = cfg.gear.knee ? GEAR_BY_ID[cfg.gear.knee] : null;
    set('knee', knee?.color, knee?.style === 'shell' ? 0.35 : 0.9);
    const boots = cfg.gear.boots ? GEAR_BY_ID[cfg.gear.boots] : null;
    set('boots', boots?.color);
    const elbow = cfg.gear.elbow ? GEAR_BY_ID[cfg.gear.elbow] : null;
    set('elbow', elbow?.color);
    set('helmet', helmet?.color, 0.3);
    // shirt colour: white tee for men, light blue for women when no jacket
    set('shirt', cfg.body === 'female' ? '#d8dfe8' : '#e8e3d6');
    set('pants', '#2b3a5a');
  }
}

export function isSkinned(o: Object3D): o is SkinnedMesh {
  return (o as SkinnedMesh).isSkinnedMesh === true;
}
