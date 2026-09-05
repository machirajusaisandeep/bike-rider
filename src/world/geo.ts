import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small helpers for building low-poly props as ONE merged geometry with vertex colours, so a
 * whole vehicle or hazard is a single InstancedMesh draw. Shared by vehicles and hazards.
 */

export function colorize(geo: BufferGeometry, hex: number | string, variance = 0): BufferGeometry {
  const c = new Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (Math.random() - 0.5) * variance;
    arr[i * 3] = c.r * v;
    arr[i * 3 + 1] = c.g * v;
    arr[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}

export function place(
  geo: BufferGeometry,
  x: number,
  y: number,
  z: number,
  s = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): BufferGeometry {
  geo.scale(s, s, s);
  geo.rotateX(rx);
  geo.rotateY(ry);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false);
  if (!out) throw new Error('geo: merge failed');
  out.computeBoundingSphere();
  return out;
}

export function stdMat(extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...extra });
}
