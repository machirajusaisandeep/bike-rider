import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import type { Checkpoint } from '../game/routes';
import type { HeightField } from './heights';

const KIND_COLOR: Record<Checkpoint['kind'], string> = {
  pass: '#ffb428',
  dhaba: '#7ee08a',
  town: '#6fd3ff',
  view: '#f2f3f5',
  finish: '#ff5a1f',
};

function landmark(kind: Checkpoint['prop'] | null): Group | null {
  if (!kind) return null;
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
  const stone = new MeshStandardMaterial({ color: 0x9a9488, roughness: 0.85 });
  const white = new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 });
  if (kind === 'shack') {
    const hut = new Mesh(new BoxGeometry(3.2, 2.2, 2.6), wood);
    hut.position.y = 1.1;
    const roof = new Mesh(
      new BoxGeometry(3.8, 0.16, 3.1),
      new MeshStandardMaterial({ color: 0xc45a2a, roughness: 0.8 }),
    );
    roof.position.y = 2.3;
    roof.rotation.z = 0.08;
    g.add(hut, roof);
  } else if (kind === 'chorten') {
    const base = new Mesh(new BoxGeometry(1.6, 0.5, 1.6), white);
    base.position.y = 0.25;
    const spire = new Mesh(new CylinderGeometry(0.12, 0.45, 2.4, 8), white);
    spire.position.y = 1.6;
    g.add(base, spire);
  } else if (kind === 'rail') {
    for (const x of [-1.2, 1.2]) {
      const p = new Mesh(new CylinderGeometry(0.06, 0.07, 1.1, 6), stone);
      p.position.set(x, 0.55, 0);
      g.add(p);
    }
    const rail = new Mesh(new BoxGeometry(2.6, 0.08, 0.08), stone);
    rail.position.y = 1.05;
    g.add(rail);
  } else if (kind === 'arch') {
    const left = new Mesh(new BoxGeometry(0.35, 3.2, 0.35), stone);
    left.position.set(-1.6, 1.6, 0);
    const right = left.clone();
    right.position.x = 1.6;
    const beam = new Mesh(new BoxGeometry(3.6, 0.3, 0.4), stone);
    beam.position.y = 3.3;
    g.add(left, right, beam);
  }
  g.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

function bannerTexture(c: Checkpoint): CanvasTexture {
  const w = 1024;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = KIND_COLOR[c.kind];
  ctx.fillRect(0, 0, w, 22);
  ctx.fillRect(0, h - 22, w, 22);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 96px Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(c.name.toUpperCase(), w / 2, h / 2 - (c.note ? 22 : 0));
  if (c.note) {
    ctx.fillStyle = KIND_COLOR[c.kind];
    ctx.font = '600 44px Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(c.note, w / 2, h / 2 + 62);
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Checkpoint gates for a route: two posts and a banner across the road at each checkpoint.
 * A handful per route, so plain meshes are fine.
 */
export class Gates {
  readonly group = new Group();
  private disposables: { dispose(): void }[] = [];

  constructor(hf: HeightField, checkpoints: Checkpoint[]) {
    const path = hf.path;
    const postGeo = new CylinderGeometry(0.09, 0.11, 5.2, 10);
    const postMat = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7, metalness: 0.4 });
    const beamGeo = new BoxGeometry(1, 0.16, 0.16);
    this.disposables.push(postGeo, postMat, beamGeo);
    for (const c of checkpoints) {
      const z = -c.at;
      const cx = path.centerX(z);
      const halfW = path.width / 2 + path.shoulder + 0.3;
      const gate = new Group();
      gate.position.set(cx, hf.height(cx, z), z);
      gate.rotation.y = path.heading(z);
      for (const side of [-1, 1]) {
        const post = new Mesh(postGeo, postMat);
        post.position.set(side * halfW, 2.6, 0);
        post.castShadow = true;
        gate.add(post);
      }
      const beam = new Mesh(beamGeo, postMat);
      beam.scale.x = halfW * 2 + 0.2;
      beam.position.set(0, 5.1, 0);
      gate.add(beam);
      const tex = bannerTexture(c);
      const bannerMat = new MeshStandardMaterial({
        map: tex,
        roughness: 0.8,
        metalness: 0,
        side: DoubleSide,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.35,
      });
      const bannerW = Math.min(halfW * 2 - 0.6, 8);
      const banner = new Mesh(new BoxGeometry(bannerW, bannerW / 4, 0.05), bannerMat);
      banner.position.set(0, 5.1 - bannerW / 8 - 0.18, 0);
      banner.castShadow = true;
      gate.add(banner);
      this.disposables.push(tex, bannerMat, banner.geometry);
      const hero = landmark(
        c.prop ??
          (c.kind === 'dhaba'
            ? 'shack'
            : c.kind === 'pass'
              ? 'chorten'
              : c.kind === 'view'
                ? 'rail'
                : null),
      );
      if (hero) {
        hero.position.set(halfW + 2.2, 0, 0);
        gate.add(hero);
        hero.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) {
            this.disposables.push(m.geometry);
            if (!Array.isArray(m.material)) this.disposables.push(m.material);
          }
        });
      }
      this.group.add(gate);
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}
