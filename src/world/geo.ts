import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small helpers for building low-poly props as ONE merged geometry with vertex colours, so a
 * whole vehicle or hazard is a single InstancedMesh draw. Shared by vehicles and hazards.
 *
 * Every colorized part also carries a `lampK` float attribute (0 = paint, 1 = lamp glass) so
 * headlights and tail lights can glow at night through `vehicleMat()` without a second draw.
 */

export function colorize(
  geo: BufferGeometry,
  hex: number | string,
  variance = 0,
  lamp = 0,
): BufferGeometry {
  const c = new Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  const lampArr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = 1 + (Math.random() - 0.5) * variance;
    arr[i * 3] = c.r * v;
    arr[i * 3 + 1] = c.g * v;
    arr[i * 3 + 2] = c.b * v;
    lampArr[i] = lamp;
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  geo.setAttribute('lampK', new BufferAttribute(lampArr, 1));
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

/** Shared switch for every vehicle material: 0 = lamps off, 1 = on (dusk / night). */
export const LAMPS = { value: 0 };

/**
 * Vertex-coloured PBR material whose `lampK` vertices emit their own colour when `LAMPS` is on.
 * One material per vehicle pool, one uniform for the whole fleet.
 */
export function vehicleMat(): MeshStandardMaterial {
  const mat = stdMat({ roughness: 0.55, metalness: 0.2 });
  mat.customProgramCacheKey = () => 'vehicle-lamps';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLamps = LAMPS;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float lampK;\nvarying float vLampK;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvLampK = lampK;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLampK;\nuniform float uLamps;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vLampK * uLamps * 1.3;',
      );
  };
  return mat;
}
