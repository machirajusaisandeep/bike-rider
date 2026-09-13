import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** A fitting bay keeps skin and catalogue colours consistent across roads and weather. */
export class RiderStudio {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.05, 30);
  private controls: OrbitControls;
  private focus: 'face' | 'hair' | 'gear' = 'face';
  private width = 0;
  private height = 0;
  private environment;
  private floorTexture: CanvasTexture;

  constructor(private renderer: WebGLRenderer) {
    // Dealership fitting bay: neutral mid-grey walls, a warm key from the front-left, a cool
    // fill, and two rims so black textiles and helmet paint keep an edge against the backdrop.
    this.scene.background = new Color('#6d726f');
    const generator = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.environment = generator.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    room.dispose();
    generator.dispose();
    this.scene.add(new HemisphereLight('#e8eef2', '#3f423f', 0.75));
    const key = new DirectionalLight('#fff0dc', 3.1);
    key.position.set(-2.6, 4.2, 4.2);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
    key.shadow.camera.right = key.shadow.camera.top = 2.5;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 12;
    key.shadow.normalBias = 0.012;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
    const fill = new DirectionalLight('#cfe0ee', 1.0);
    fill.position.set(3.2, 2.2, 2.2);
    this.scene.add(fill);
    const rim = new DirectionalLight('#ffffff', 2.6);
    rim.position.set(1.4, 3.2, -3.2);
    this.scene.add(rim);
    const rim2 = new DirectionalLight('#ffe2c4', 1.2);
    rim2.position.set(-2.4, 2.4, -2.6);
    this.scene.add(rim2);

    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const ctx = tile.getContext('2d')!;
    const pixels = ctx.createImageData(256, 256);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const v = 160 + (seed / 4294967296) * 22;
      pixels.data.set([v, v + 2, v, 255], i);
    }
    ctx.putImageData(pixels, 0, 0);
    this.floorTexture = new CanvasTexture(tile);
    this.floorTexture.wrapS = this.floorTexture.wrapT = RepeatWrapping;
    this.floorTexture.repeat.set(8, 8);
    this.floorTexture.colorSpace = SRGBColorSpace;
    const floor = new Mesh(
      new PlaneGeometry(40, 40),
      new MeshStandardMaterial({
        map: this.floorTexture,
        color: '#5e6663',
        roughness: 0.62,
        metalness: 0.02,
        bumpMap: this.floorTexture,
        bumpScale: 0.01,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wall = new Mesh(
      new BoxGeometry(18, 7, 0.15),
      new MeshStandardMaterial({ color: '#6e7773', roughness: 1 }),
    );
    wall.position.set(0, 3.4, -3.5);
    this.scene.add(wall);
    const shutter = new MeshStandardMaterial({
      color: '#5b6561',
      roughness: 0.7,
      metalness: 0.1,
    });
    const rib = new BoxGeometry(3.2, 0.068, 0.016);
    for (let i = 0; i < 48; i++) {
      const m = new Mesh(rib, shutter);
      m.position.set(2.9, 0.1 + i * 0.075, -3.36);
      this.scene.add(m);
    }
    const baseboard = new Mesh(
      new BoxGeometry(18, 0.24, 0.08),
      new MeshStandardMaterial({ color: '#363d3a', roughness: 0.9 }),
    );
    baseboard.position.set(0, 0.12, -3.37);
    this.scene.add(baseboard);
    // A painted stripe along the wall at rider height, the dealership's signature band.
    const stripe = new Mesh(
      new BoxGeometry(18, 0.06, 0.02),
      new MeshStandardMaterial({ color: '#7a2a2a', roughness: 0.85 }),
    );
    stripe.position.set(0, 0.62, -3.41);
    this.scene.add(stripe);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minPolarAngle = 0.85;
    this.controls.maxPolarAngle = 1.7;
    this.controls.rotateSpeed = 0.65;
    this.controls.enabled = false;
  }

  show(rider: Group): void {
    this.scene.add(rider);
    rider.position.set(0, 0, 0);
    rider.rotation.set(0, 0, 0);
    this.controls.enabled = true;
    this.setFocus(this.focus);
  }

  hide(): void {
    this.controls.enabled = false;
  }

  setFocus(tab: 'face' | 'hair' | 'gear'): void {
    this.focus = tab;
    const head = tab !== 'gear';
    this.controls.target.set(0, head ? 1.43 : 0.9, 0);
    this.camera.position
      .copy(this.controls.target)
      .add(new Vector3(head ? -0.36 : -0.85, head ? 0.06 : 0.18, head ? 1.45 : 3.55));
    this.controls.minDistance = head ? 0.85 : 2.3;
    this.controls.maxDistance = head ? 2.6 : 5.3;
    this.controls.update();
  }

  turn(delta: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new Vector3(0, 1, 0), delta);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  render(width: number, height: number): void {
    const mobile = width <= 900;
    const stageHeight = mobile ? Math.round(height * 0.43) : height;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.camera.aspect = width / stageHeight;
      this.camera.clearViewOffset();
      if (!mobile)
        this.camera.setViewOffset(width, height, -Math.min(270, width * 0.21), 0, width, height);
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    const exposure = this.renderer.toneMappingExposure;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setViewport(0, height - stageHeight, width, stageHeight);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.toneMappingExposure = exposure;
  }

  dispose(): void {
    this.controls.dispose();
    this.environment.dispose();
    this.floorTexture.dispose();
    this.scene.traverse((obj) => {
      if (!(obj instanceof Mesh) || obj.parent !== this.scene) return;
      obj.geometry.dispose();
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
        material.dispose();
    });
  }
}
