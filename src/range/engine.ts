import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { countsToDegrees } from "../lib/sensitivity.ts";

const DIST = 10;
const EYE = 1.62;
const ORIGIN_Z = 4.2;

export type TargetKind = "speed" | "precision" | "track";

type Shard = { mesh: Mesh; vel: Vector3; life: number };

export class RangeEngine {
  readonly canvas: HTMLCanvasElement;
  readonly failed: boolean;
  onShoot: (() => void) | null = null;
  onFrame: ((dt: number) => void) | null = null;

  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private target: Mesh;
  private idle = new Group();
  private taskGlow: MeshStandardMaterial;
  private raycaster = new Raycaster();
  private center = new Vector2(0, 0);
  private shards: Shard[] = [];
  private geos: BufferGeometry[] = [];
  private materials: Material[] = [];
  private textures: Texture[] = [];
  private yaw = 0;
  private pitch = 0;
  private dpi = 800;
  private cm = 40;
  private hfov = 103;
  private kind: TargetKind = "speed";
  private raf = 0;
  private last = 0;
  private running = false;
  private disposed = false;
  private observer: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.camera = new PerspectiveCamera(70, 1, 0.08, 180);
    this.camera.position.set(0, EYE, ORIGIN_Z);
    this.camera.rotation.order = "YXZ";
    this.taskGlow = new MeshStandardMaterial({
      color: "#d7fdff",
      emissive: "#14e7ff",
      emissiveIntensity: 2.6,
      roughness: 0.28,
      metalness: 0.04,
      toneMapped: false,
    });
    this.materials.push(this.taskGlow);
    this.target = this.makeBall(this.taskGlow, 0.5);
    this.target.visible = false;

    try {
      this.renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      this.failed = true;
      return;
    }
    this.failed = false;
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.setClearColor(new Color("#070b14"));

    this.scene.background = new Color("#070b14");
    this.scene.add(this.buildSky());
    this.scene.add(this.buildRoom());
    this.scene.add(new AmbientLight("#d5e2f0", 1.45));
    const key = new DirectionalLight("#f7fbff", 1.8);
    key.position.set(-3, 8, 4);
    this.scene.add(key);
    const glow = new PointLight("#b8fbff", 30, 16, 2);
    glow.position.set(0, 2.4, -2);
    this.scene.add(glow);

    this.scene.add(this.target);

    this.idle = this.buildIdle();
    this.scene.add(this.idle);

    this.camera.add(this.buildGun());
    const lamp = new PointLight("#ffffff", 6, 4, 2);
    lamp.position.set(0.15, 0.05, 0.3);
    this.camera.add(lamp);
    this.scene.add(this.camera);

    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);

    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.tick = this.tick.bind(this);
    document.addEventListener("mousemove", this.onMove);
    document.addEventListener("mousedown", this.onDown);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  setSensitivity(dpi: number, cm: number) {
    this.dpi = dpi;
    this.cm = Math.max(cm, 1);
  }

  setHfov(degrees: number) {
    this.hfov = Math.min(120, Math.max(60, degrees));
    this.resize();
  }

  getView() {
    return {
      yaw: -MathUtils.radToDeg(this.yaw),
      pitch: MathUtils.radToDeg(this.pitch),
    };
  }

  resetView() {
    this.yaw = 0;
    this.pitch = 0;
    this.applyLook();
  }

  showIdle() {
    this.target.visible = false;
    this.idle.visible = true;
  }

  showTarget(yawDeg: number, pitchDeg: number, kind: TargetKind) {
    this.kind = kind;
    const radius = kind === "precision" ? 0.95 : kind === "track" ? 2.15 : 2.85;
    const worldRadius = Math.tan(MathUtils.degToRad(radius)) * DIST;
    this.target.scale.setScalar(worldRadius / 0.5);
    const yaw = MathUtils.degToRad(yawDeg);
    const pitch = MathUtils.degToRad(pitchDeg);
    this.target.position.set(
      Math.sin(yaw) * Math.cos(pitch) * DIST,
      EYE + Math.sin(pitch) * DIST,
      ORIGIN_Z - Math.cos(yaw) * Math.cos(pitch) * DIST,
    );
    this.idle.visible = false;
    this.target.visible = true;
    this.paintTarget(false);
  }

  hideTarget() {
    this.target.visible = false;
  }

  setOnTarget(on: boolean) {
    this.paintTarget(on);
  }

  shootHit() {
    if (!this.target.visible || !this.renderer) return false;
    this.raycaster.setFromCamera(this.center, this.camera);
    return this.raycaster.intersectObject(this.target, false).length > 0;
  }

  burst() {
    if (!this.renderer) return;
    const origin = this.target.position.clone();
    for (let index = 0; index < 8; index += 1) {
      const geo = new SphereGeometry(0.07, 6, 5);
      const material = new MeshBasicMaterial({ color: index % 2 ? "#e8fdff" : "#3df0ff" });
      this.geos.push(geo);
      this.materials.push(material);
      const mesh = new Mesh(geo, material);
      mesh.scale.set(1, 0.28, 0.62);
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      this.shards.push({
        mesh,
        life: 0.36,
        vel: new Vector3((Math.random() - 0.5) * 3.4, 0.6 + Math.random() * 2.2, (Math.random() - 0.5) * 3.4),
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("mousedown", this.onDown);
    this.renderer?.dispose();
    for (const material of this.materials) material.dispose();
    for (const geo of this.geos) geo.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private onMove(event: MouseEvent) {
    if (document.pointerLockElement !== this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const degX = countsToDegrees(event.movementX * dpr, this.dpi, this.cm);
    const degY = countsToDegrees(event.movementY * dpr, this.dpi, this.cm);
    this.yaw -= MathUtils.degToRad(degX);
    this.pitch -= MathUtils.degToRad(degY);
    const limit = Math.PI / 2 - 0.05;
    this.pitch = Math.min(limit, Math.max(-limit, this.pitch));
    this.applyLook();
  }

  private onDown(event: MouseEvent) {
    if (event.button !== 0 || document.pointerLockElement !== this.canvas) return;
    this.onShoot?.();
  }

  private applyLook() {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private tick(now: number) {
    if (!this.running || this.disposed || !this.renderer) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    for (const shard of this.shards) {
      shard.life -= dt;
      shard.mesh.position.addScaledVector(shard.vel, dt);
      shard.vel.y -= dt * 7;
      shard.mesh.visible = shard.life > 0;
    }
    this.shards = this.shards.filter((shard) => {
      if (shard.life > 0) return true;
      this.scene.remove(shard.mesh);
      return false;
    });
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  }

  private resize() {
    if (!this.renderer) return;
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    const vertical = 56;
    const horizontal = MathUtils.radToDeg(
      2 * Math.atan(Math.tan(MathUtils.degToRad(vertical) / 2) * this.camera.aspect),
    );
    this.camera.fov =
      horizontal > this.hfov
        ? MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(this.hfov) / 2) / this.camera.aspect))
        : vertical;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private makeBall(material: MeshStandardMaterial, radius: number) {
    const geo = new SphereGeometry(radius, 28, 20);
    this.geos.push(geo);
    return new Mesh(geo, material);
  }

  private buildIdle() {
    const glow = new MeshStandardMaterial({
      color: "#d7fdff",
      emissive: "#14e7ff",
      emissiveIntensity: 2.2,
      roughness: 0.22,
      metalness: 0.04,
      toneMapped: false,
    });
    this.materials.push(glow);
    const group = new Group();
    const spots = [
      { x: -1.65, y: 1.05, z: -5.5, r: 0.28 },
      { x: 0.2, y: 1.65, z: -4.7, r: 0.4 },
      { x: 1.55, y: 1.15, z: -5.9, r: 0.22 },
    ];
    for (const spot of spots) {
      const ball = this.makeBall(glow, spot.r);
      ball.position.set(spot.x, spot.y, spot.z);
      group.add(ball);
    }
    return group;
  }

  private buildRoom() {
    const group = new Group();
    const grid = this.gridTexture();
    const wall = new MeshStandardMaterial({ map: grid, color: "#ffffff", roughness: 0.9, metalness: 0.02 });
    const floorMat = new MeshStandardMaterial({ map: grid, color: "#ffffff", roughness: 0.82, metalness: 0.05 });
    this.materials.push(wall, floorMat);

    const floor = new Mesh(new PlaneGeometry(28, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 2;
    this.geos.push(floor.geometry);
    group.add(floor);

    const sideGeo = new PlaneGeometry(24, 5.6);
    const endGeo = new PlaneGeometry(28, 5.6);
    this.geos.push(sideGeo, endGeo);
    const back = new Mesh(endGeo, wall);
    back.position.set(0, 2.8, -10);
    const front = new Mesh(endGeo, wall);
    front.position.set(0, 2.8, 14);
    front.rotation.y = Math.PI;
    const left = new Mesh(sideGeo, wall);
    left.position.set(-14, 2.8, 2);
    left.rotation.y = Math.PI / 2;
    const right = new Mesh(sideGeo, wall);
    right.position.set(14, 2.8, 2);
    right.rotation.y = -Math.PI / 2;
    group.add(back, front, left, right);

    const trimMat = new MeshBasicMaterial({ color: "#3df0ff" });
    this.materials.push(trimMat);
    const trimZ = new BoxGeometry(28.08, 0.04, 0.04);
    const trimX = new BoxGeometry(0.04, 0.04, 24.08);
    this.geos.push(trimZ, trimX);
    for (const z of [-10, 14]) {
      const edge = new Mesh(trimZ, trimMat);
      edge.position.set(0, 5.55, z);
      group.add(edge);
    }
    for (const x of [-14, 14]) {
      const edge = new Mesh(trimX, trimMat);
      edge.position.set(x, 5.55, 2);
      group.add(edge);
    }

    const ring = new Mesh(new TorusGeometry(0.62, 0.028, 8, 40), trimMat);
    this.geos.push(ring.geometry);
    ring.position.set(0, 3.7, -9.92);
    group.add(ring);
    return group;
  }

  private buildSky() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.textures.push(texture);
    if (context) {
      context.fillStyle = "#070b16";
      context.fillRect(0, 0, 1024, 512);
      const nebula = context.createRadialGradient(680, 160, 10, 680, 190, 300);
      nebula.addColorStop(0, "rgba(58, 78, 160, 0.5)");
      nebula.addColorStop(0.5, "rgba(18, 36, 84, 0.22)");
      nebula.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = nebula;
      context.fillRect(0, 0, 1024, 512);
      const wash = context.createRadialGradient(280, 110, 8, 260, 130, 200);
      wash.addColorStop(0, "rgba(36, 170, 180, 0.2)");
      wash.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = wash;
      context.fillRect(0, 0, 1024, 512);
      context.fillStyle = "#d7e6ff";
      for (let index = 0; index < 90; index += 1) {
        const x = (index * 97) % 1024;
        const y = (index * 53) % 340;
        const size = index % 9 === 0 ? 2 : 1;
        context.fillRect(x, y, size, size);
      }
      texture.needsUpdate = true;
    }
    const material = new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false });
    this.materials.push(material);
    const geo = new SphereGeometry(90, 28, 16);
    this.geos.push(geo);
    const sky = new Mesh(geo, material);
    sky.position.y = 4;
    return sky;
  }

  private buildGun() {
    const metal = new MeshStandardMaterial({ color: "#d5dee6", metalness: 0.55, roughness: 0.32 });
    const dark = new MeshStandardMaterial({ color: "#5c6770", metalness: 0.4, roughness: 0.45 });
    const skin = new MeshStandardMaterial({ color: "#c4896c", roughness: 0.7 });
    const lensMat = new MeshBasicMaterial({ color: "#10141c" });
    this.materials.push(metal, dark, skin, lensMat);
    const gun = new Group();
    const grip = box(0.03, 0.09, 0.046, dark, 0.11, -0.24, 0.04);
    grip.rotation.x = 0.5;
    const lens = new Mesh(new PlaneGeometry(0.03, 0.02), lensMat);
    lens.position.set(0.03, -0.1, -0.2);
    const parts: Mesh[] = [
      box(0.056, 0.062, 0.3, metal, 0.11, -0.17, -0.1),
      box(0.02, 0.02, 0.4, dark, 0.11, -0.145, -0.4),
      box(0.04, 0.038, 0.18, dark, 0.11, -0.185, -0.28),
      box(0.044, 0.05, 0.15, metal, 0.11, -0.16, 0.14),
      box(0.028, 0.1, 0.04, dark, 0.11, -0.25, -0.05),
      grip,
      box(0.038, 0.034, 0.07, dark, 0.03, -0.1, -0.16),
      box(0.05, 0.03, 0.06, skin, 0.13, -0.21, -0.02),
      box(0.042, 0.026, 0.07, skin, 0.12, -0.2, -0.24),
      lens,
    ];
    for (const part of parts) {
      this.geos.push(part.geometry);
      gun.add(part);
    }
    gun.position.set(0.02, -0.1, -0.42);
    gun.scale.setScalar(1.35);
    return gun;
  }

  private gridTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(6, 6);
    this.textures.push(texture);
    if (!context) return texture;
    context.fillStyle = "#3c4046";
    context.fillRect(0, 0, 512, 512);
    context.strokeStyle = "#7d838c";
    context.lineWidth = 2;
    for (let line = 0; line <= 512; line += 64) {
      context.beginPath();
      context.moveTo(line, 0);
      context.lineTo(line, 512);
      context.moveTo(0, line);
      context.lineTo(512, line);
      context.stroke();
    }
    texture.needsUpdate = true;
    return texture;
  }

  private paintTarget(on: boolean) {
    if (this.kind === "track") {
      this.taskGlow.color.set(on ? "#4dabf7" : "#ff6b6b");
      this.taskGlow.emissive.set(on ? "#1c7ed6" : "#e03131");
      this.taskGlow.emissiveIntensity = on ? 2.4 : 1.7;
      return;
    }
    if (this.kind === "speed") {
      this.taskGlow.color.set("#ffe066");
      this.taskGlow.emissive.set("#fcc419");
      this.taskGlow.emissiveIntensity = 2.2;
      return;
    }
    this.taskGlow.color.set("#7af0ff");
    this.taskGlow.emissive.set("#22d3ee");
    this.taskGlow.emissiveIntensity = 2.4;
  }
}

function box(
  width: number,
  height: number,
  depth: number,
  material: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}
