import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

export interface SkyPreset {
  top: number;
  horizon: number;
  bottom: number;
  sun: number;
  sunDir: Vector3;
}

const VERT = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vWorldDir;
void main() {
  vec3 d = normalize(vWorldDir);
  float h = d.y;
  vec3 col;
  if (h > 0.0) {
    float t = pow(h, 0.55);
    col = mix(uHorizon, uTop, t);
  } else {
    col = mix(uHorizon, uBottom, clamp(-h * 6.0, 0.0, 1.0));
  }
  float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(sunAmt, 900.0) * 3.0 + pow(sunAmt, 24.0) * 0.35 + pow(sunAmt, 4.0) * 0.08);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uBottom: { value: new Color() },
        uSun: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1000, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  apply(p: SkyPreset): void {
    const u = this.mat.uniforms;
    (u.uTop!.value as Color).setHex(p.top);
    (u.uHorizon!.value as Color).setHex(p.horizon);
    (u.uBottom!.value as Color).setHex(p.bottom);
    (u.uSun!.value as Color).setHex(p.sun);
    (u.uSunDir!.value as Vector3).copy(p.sunDir);
  }

  update(cameraPos: Vector3): void {
    this.mesh.position.copy(cameraPos);
  }
}
