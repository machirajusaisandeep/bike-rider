import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { SceneDef } from './scenes';

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
float wave(vec2 p, vec2 dir, float freq, float speed) { return sin(dot(p, dir) * freq + uTime * speed); }
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = 0.0;
  h += 0.35 * wave(wp.xz, normalize(vec2(1.0, 0.3)), 0.12, 0.9);
  h += 0.18 * wave(wp.xz, normalize(vec2(-0.4, 1.0)), 0.21, 1.3);
  h += 0.08 * wave(wp.xz, normalize(vec2(0.7, -0.8)), 0.45, 1.9);
  wp.y += h;
  // analytic-ish normal from finite differences
  float e = 1.5;
  float hx = 0.35 * wave(wp.xz + vec2(e, 0.0), normalize(vec2(1.0, 0.3)), 0.12, 0.9) + 0.18 * wave(wp.xz + vec2(e, 0.0), normalize(vec2(-0.4, 1.0)), 0.21, 1.3) + 0.08 * wave(wp.xz + vec2(e, 0.0), normalize(vec2(0.7, -0.8)), 0.45, 1.9);
  float hz = 0.35 * wave(wp.xz + vec2(0.0, e), normalize(vec2(1.0, 0.3)), 0.12, 0.9) + 0.18 * wave(wp.xz + vec2(0.0, e), normalize(vec2(-0.4, 1.0)), 0.21, 1.3) + 0.08 * wave(wp.xz + vec2(0.0, e), normalize(vec2(0.7, -0.8)), 0.45, 1.9);
  vNormalW = normalize(vec3(h - hx, e, h - hz));
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uDeep, uShallow, uSky, uSunColor, uSunDir, uFogColor;
uniform float uTime, uFogDensity;
varying vec3 vWorld;
varying vec3 vNormalW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  // small-scale ripple normal
  vec2 r = vWorld.xz * 0.35 + vec2(uTime * 0.05, -uTime * 0.04);
  float rip = (hash(floor(r)) - 0.5) * 0.06;
  vec3 N = normalize(vNormalW + vec3(rip, 0.0, -rip));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 base = mix(uDeep, uShallow, clamp(N.y * 0.6 + fres * 0.4, 0.0, 1.0) * 0.6);
  vec3 col = mix(base, uSky, 0.25 + fres * 0.7);
  vec3 H = normalize(V + normalize(uSunDir));
  float spec = pow(max(dot(N, H), 0.0), 240.0) * 2.2 + pow(max(dot(N, H), 0.0), 24.0) * 0.25;
  col += uSunColor * spec;
  // exp2 fog to match the scene
  float d = length(cameraPosition - vWorld);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Ocean {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;

  constructor(def: SceneDef) {
    const w = def.water!;
    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Color(w.deep) },
        uShallow: { value: new Color(w.shallow) },
        uSky: { value: new Color(0x9ec5e8) },
        uSunColor: { value: new Color(0xfff0d0) },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uFogColor: { value: new Color(def.fog.color) },
        uFogDensity: { value: def.fog.density },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new PlaneGeometry(4000, 4000, 160, 160), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = w.level;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
  }

  update(
    dt: number,
    cameraPos: Vector3,
    sunDir: Vector3,
    sky: Color,
    sun: Color,
    fog: Color,
    fogDensity: number,
  ): void {
    const u = this.mat.uniforms;
    u.uTime!.value += dt;
    (u.uSunDir!.value as Vector3).copy(sunDir);
    (u.uSky!.value as Color).copy(sky);
    (u.uSunColor!.value as Color).copy(sun);
    (u.uFogColor!.value as Color).copy(fog);
    u.uFogDensity!.value = fogDensity;
    this.mesh.position.x = cameraPos.x;
    this.mesh.position.z = cameraPos.z;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
