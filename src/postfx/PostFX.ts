import {
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const GRADE = new ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.04 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uWarm: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uContrast, uGrain, uTime, uWarm;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // saturation
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      // contrast around mid grey (linear space, pre tone-map)
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      // subtle warm/cool split toning
      c.rgb += vec3(0.02, 0.008, -0.015) * uWarm;
      // vignette
      vec2 q = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 0.95, length(q) * 1.25);
      c.rgb *= mix(1.0, v, uVignette);
      // grain
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0) - 0.5;
      c.rgb += g * uGrain * (0.4 + 0.6 * (1.0 - l));
      gl_FragColor = c;
    }`,
});

/** Bloom + colour grade + tone-mapped output. Disabled entirely on Low quality. */
export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private target: WebGLRenderTarget;

  constructor(
    private renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
  ) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    // Half-float for HDR bloom; anti-aliasing via SMAA rather than MSAA, which some GPUs/drivers
    // refuse on float targets.
    this.target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType });
    this.composer = new EffectComposer(renderer, this.target);
    this.composer.addPass(new RenderPass(scene, camera));
    // High threshold: only the sun disc, headlights, windows and specular hits bloom, not the sky.
    this.bloom = new UnrealBloomPass(size, 0.22, 0.45, 1.6);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }
  private smaa: SMAAPass;

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  /** Tune the look per scene / time. */
  setLook(o: {
    bloom?: number;
    bloomThreshold?: number;
    warm?: number;
    saturation?: number;
    vignette?: number;
  }): void {
    if (o.bloom !== undefined) this.bloom.strength = o.bloom;
    if (o.bloomThreshold !== undefined) this.bloom.threshold = o.bloomThreshold;
    const u = this.grade.uniforms;
    if (o.warm !== undefined) u.uWarm!.value = o.warm;
    if (o.saturation !== undefined) u.uSaturation!.value = o.saturation;
    if (o.vignette !== undefined) u.uVignette!.value = o.vignette;
  }

  render(dt: number): void {
    this.grade.uniforms.uTime!.value += dt;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.target.dispose();
  }
}
