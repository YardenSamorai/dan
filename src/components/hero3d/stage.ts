import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Renderer and light rig. One sun (the time of day), a soft sky fill and a
 * low-intensity studio environment for the gentle sheen on fabric and metal.
 */

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  sky: THREE.HemisphereLight;
  setSize(w: number, h: number, dpr: number): void;
  /** Keep the shadow map tight around what the camera is looking at. */
  focusShadow(at: THREE.Vector3, size: number): void;
  render(): void;
  dispose(): void;
}

export const GROUND = '#f6f6f4';

export function makeStage(canvas: HTMLCanvasElement, o: { shadows: number; antialias: boolean }): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: o.antialias, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = o.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

  const sky = new THREE.HemisphereLight('#fbf7f1', '#e4dad0', 1.1);
  scene.add(sky);

  const sun = new THREE.DirectionalLight('#fff1dc', 2.2);
  sun.castShadow = o.shadows > 0;
  sun.shadow.mapSize.set(o.shadows || 1, o.shadows || 1);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);

  return {
    renderer,
    scene,
    camera,
    sun,
    sky,
    setSize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    focusShadow(at, size) {
      const c = sun.shadow.camera;
      c.left = -size;
      c.right = size;
      c.top = size;
      c.bottom = -size;
      c.near = 0.5;
      c.far = 30;
      c.updateProjectionMatrix();
      const dir = sun.position.clone().sub(sun.target.position).normalize();
      sun.target.position.copy(at);
      sun.position.copy(at).addScaledVector(dir, 12);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
    },
  };
}
