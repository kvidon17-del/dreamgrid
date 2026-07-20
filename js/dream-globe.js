/**
 * Dream Grid — Decorative Digital Globe (background visual for hero section)
 * ----------------------------------------------------------------------------
 * Чистый JS + Three.js через ES-модули с CDN (jsdelivr). Без npm, без сборки.
 * Это ДЕКОРАТИВНАЯ анимация — реальных данных о пользователях/мечтах здесь нет,
 * координаты городов используются только как визуальные "узлы" для дуг.
 *
 * Подключение (в index.html, перед </body>):
 *
 *   <script type="importmap">
 *   {
 *     "imports": {
 *       "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
 *       "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
 *     }
 *   }
 *   </script>
 *   <script type="module" src="/js/dream-globe.js"></script>
 *
 * И канвас внутри .hero (см. инструкцию отдельным сообщением):
 *   <canvas id="dream-globe-canvas"></canvas>
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ──────────────────────────────────────────────────────────────────────────
// 1. КОНФИГУРАЦИЯ — все визуальные параметры вынесены сюда
// ──────────────────────────────────────────────────────────────────────────
const CONFIG = {
  radius: 100,
  autoRotateSpeed: 0.055,        // рад/сек
  dragRotateDamping: 0.92,
  pointColor: '#c4b5fd',         // светлые точки материков
  pointColorBright: '#f9a8d4',   // яркие акцентные точки
  arcColor: '#a78bfa',
  arcColorBright: '#f472b6',
  backgroundOpacityOnDark: true, // фон делаем прозрачным — сайт уже тёмный
  atmosphereColor: '#7c5cf6',
  atmosphereIntensity: 0.55,
  bloomStrength: 0.9,
  bloomRadius: 0.55,
  bloomThreshold: 0.15,
  arcHeightFactor: 0.32,
  particleSpeed: 0.18,           // доля дуги в секунду
  arcCount: 16,
  twinkleSpeed: 1.4,
  twinkleAmount: 0.35,
};

// Уровни качества по ширине окна
function getQualityTier() {
  const w = window.innerWidth;
  if (w < 640) return { points: 6000, arcs: 8, bloom: false, pixelRatioCap: 1.5 };
  if (w < 1024) return { points: 16000, arcs: 12, bloom: true, pixelRatioCap: 1.75 };
  return { points: 30000, arcs: CONFIG.arcCount, bloom: true, pixelRatioCap: 2 };
}

const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ──────────────────────────────────────────────────────────────────────────
// 2. ГРУБЫЕ КОНТУРЫ МАТЕРИКОВ (упрощённые полигоны, только для декоративной
//    формы облака точек — не географически точные данные)
// ──────────────────────────────────────────────────────────────────────────
const CONTINENTS = [
  // Северная Америка
  [[-165,68],[-140,70],[-95,72],[-60,60],[-52,48],[-65,45],[-80,32],[-97,20],[-105,22],[-118,32],[-124,45],[-140,60],[-165,68]],
  // Южная Америка
  [[-80,10],[-60,10],[-35,-5],[-35,-23],[-58,-38],[-70,-52],[-75,-40],[-81,-5],[-80,10]],
  // Европа
  [[-10,36],[0,44],[10,54],[25,60],[40,65],[40,50],[28,42],[15,38],[-5,38],[-10,36]],
  // Африка
  [[-18,15],[10,37],[33,32],[44,12],[42,-5],[35,-25],[18,-35],[12,-18],[-10,5],[-18,15]],
  // Азия (без учёта перехода через 180° — упрощённо)
  [[28,42],[45,60],[70,68],[100,72],[140,68],[145,45],[130,32],[110,20],[95,8],[75,10],[60,25],[45,30],[28,42]],
  // Индия
  [[68,24],[80,28],[88,22],[80,8],[72,10],[68,24]],
  // Юго-Восточная Азия / Индонезия
  [[95,20],[110,22],[122,18],[125,5],[105,-8],[95,5],[95,20]],
  // Австралия
  [[113,-12],[130,-11],[145,-17],[153,-28],[145,-38],[130,-32],[115,-25],[113,-12]],
  // Гренландия
  [[-55,60],[-40,68],[-25,75],[-45,83],[-60,70],[-55,60]],
];

function pointInPolygon(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isLand(lon, lat) {
  for (const poly of CONTINENTS) {
    if (pointInPolygon(lon, lat, poly)) return true;
  }
  return false;
}

// Некоторые "узлы" (реальные координаты городов используются только как
// визуальные якоря для дуг — никаких пользовательских данных).
const HUBS = [
  [-74, 40.7], [-0.1, 51.5], [2.35, 48.85], [13.4, 52.5], [37.6, 55.75],
  [139.7, 35.7], [116.4, 39.9], [77.2, 28.6], [103.8, 1.35], [151.2, -33.9],
  [-46.6, -23.5], [31.2, 30], [55.3, 25.2], [-99.1, 19.4], [28.9, 41.0],
  [4.9, 52.37],
];

// ──────────────────────────────────────────────────────────────────────────
// 3. УТИЛИТЫ
// ──────────────────────────────────────────────────────────────────────────
function latLonToVector3(lon, lat, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function checkWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4. ГЕНЕРАЦИЯ ТОЧЕК МАТЕРИКОВ (fibonacci sphere + фильтр по маске суши)
// ──────────────────────────────────────────────────────────────────────────
function generateLandPoints(count, radius) {
  const positions = [];
  const sizes = [];
  const brightness = [];
  const phases = [];

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let kept = 0;
  let tries = 0;
  const maxTries = count * 6;

  while (kept < count && tries < maxTries) {
    const y = 1 - (tries / (maxTries - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * tries;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    tries++;

    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = (Math.atan2(z, x) * (180 / Math.PI));

    if (!isLand(lon, lat)) continue;

    const v = new THREE.Vector3(x, y, z).multiplyScalar(radius);
    positions.push(v.x, v.y, v.z);
    sizes.push(1.2 + Math.random() * 2.0);
    brightness.push(0.55 + Math.random() * 0.45);
    phases.push(Math.random() * Math.PI * 2);
    kept++;
  }

  return {
    positions: new Float32Array(positions),
    sizes: new Float32Array(sizes),
    brightness: new Float32Array(brightness),
    phases: new Float32Array(phases),
    count: kept,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 5. ШЕЙДЕРНЫЙ МАТЕРИАЛ ТОЧЕК (мерцание + мягкое свечение точки)
// ──────────────────────────────────────────────────────────────────────────
const pointsVertexShader = `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aPhase;
  uniform float uTime;
  uniform float uTwinkleSpeed;
  uniform float uTwinkleAmount;
  uniform float uPixelRatio;
  varying float vBrightness;
  void main() {
    float twinkle = 1.0 + sin(uTime * uTwinkleSpeed + aPhase) * uTwinkleAmount;
    vBrightness = aBrightness * twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (220.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const pointsFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uColorBright;
  varying float vBrightness;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d);
    vec3 color = mix(uColor, uColorBright, clamp(vBrightness - 0.6, 0.0, 1.0) * 2.0);
    gl_FragColor = vec4(color * vBrightness, alpha * vBrightness);
  }
`;

// ──────────────────────────────────────────────────────────────────────────
// 6. АТМОСФЕРА (мягкое свечение по краю сферы, fresnel-like)
// ──────────────────────────────────────────────────────────────────────────
const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const atmosphereFragmentShader = `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    float rim = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
    gl_FragColor = vec4(uColor, rim * uIntensity);
  }
`;

// ──────────────────────────────────────────────────────────────────────────
// 7. ОСНОВНОЙ КЛАСС
// ──────────────────────────────────────────────────────────────────────────
class DreamGlobe {
  constructor(canvas) {
    this.canvas = canvas;
    this.tier = getQualityTier();
    this.clock = new THREE.Clock();
    this.isDragging = false;
    this.dragVelocity = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.autoRotateResumeTimeout = null;
    this.paused = false;

    if (!checkWebGL()) {
      this.canvas.style.display = 'none';
      return; // фон сайта (градиенты/orb-элементы) остаётся как запасной вариант
    }

    this._initScene();
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildArcs();
    this._bindEvents();
    this._observeVisibility();
    this._onResize();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 280);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);

    this.group = new THREE.Group();
    this.group.rotation.x = 0.28;
    this.scene.add(this.group);

    if (this.tier.bloom && !prefersReducedMotion) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        CONFIG.bloomStrength,
        CONFIG.bloomRadius,
        CONFIG.bloomThreshold
      );
      this.composer.addPass(this.bloomPass);
    }
  }

  _buildGlobe() {
    const data = generateLandPoints(this.tier.points, CONFIG.radius);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(data.brightness, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(data.phases, 1));

    this.pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(CONFIG.pointColor) },
        uColorBright: { value: new THREE.Color(CONFIG.pointColorBright) },
        uTwinkleSpeed: { value: prefersReducedMotion ? 0 : CONFIG.twinkleSpeed },
        uTwinkleAmount: { value: prefersReducedMotion ? 0 : CONFIG.twinkleAmount },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, this.tier.pixelRatioCap) },
      },
      vertexShader: pointsVertexShader,
      fragmentShader: pointsFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.pointsMesh = new THREE.Points(geometry, this.pointsMaterial);
    this.group.add(this.pointsMesh);

    // Тонкая тёмная сфера-ядро, чтобы точки не "просвечивали" насквозь
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.radius * 0.985, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x05070f, transparent: true, opacity: 0.55 })
    );
    this.group.add(core);
  }

  _buildAtmosphere() {
    const geometry = new THREE.SphereGeometry(CONFIG.radius * 1.15, 48, 48);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(CONFIG.atmosphereColor) },
        uIntensity: { value: CONFIG.atmosphereIntensity },
      },
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(geometry, material);
    this.group.add(this.atmosphere);
  }

  _buildArcs() {
    this.arcs = [];
    const arcCount = prefersReducedMotion ? 0 : this.tier.arcs;
    const usedPairs = new Set();

    for (let i = 0; i < arcCount; i++) {
      const a = HUBS[Math.floor(Math.random() * HUBS.length)];
      let b = HUBS[Math.floor(Math.random() * HUBS.length)];
      let guard = 0;
      while ((b === a || usedPairs.has(a + '-' + b)) && guard < 10) {
        b = HUBS[Math.floor(Math.random() * HUBS.length)];
        guard++;
      }
      usedPairs.add(a + '-' + b);

      const start = latLonToVector3(a[0], a[1], CONFIG.radius);
      const end = latLonToVector3(b[0], b[1], CONFIG.radius);
      const dist = start.distanceTo(end);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(CONFIG.radius + dist * CONFIG.arcHeightFactor);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(48);
      const lineGeom = new THREE.BufferGeometry().setFromPoints(points);

      const colors = new Float32Array(points.length * 3);
      const c1 = new THREE.Color(CONFIG.arcColor);
      for (let p = 0; p < points.length; p++) {
        const t = p / (points.length - 1);
        const fade = Math.sin(t * Math.PI); // ярче в середине, тускнеет к краям
        colors[p * 3] = c1.r * fade;
        colors[p * 3 + 1] = c1.g * fade;
        colors[p * 3 + 2] = c1.b * fade;
      }
      lineGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(lineGeom, lineMaterial);
      this.group.add(line);

      // Летящая по дуге частица
      const particleGeom = new THREE.SphereGeometry(1.6, 8, 8);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: CONFIG.arcColorBright,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(particleGeom, particleMaterial);
      this.group.add(particle);

      this.arcs.push({
        curve,
        particle,
        offset: Math.random(),
      });
    }
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      clearTimeout(this.autoRotateResumeTimeout);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.dragVelocity.x = dx * 0.005;
      this.dragVelocity.y = dy * 0.005;
      this.group.rotation.y += this.dragVelocity.x;
      this.group.rotation.x = THREE.MathUtils.clamp(
        this.group.rotation.x + this.dragVelocity.y,
        -1.1,
        1.1
      );
    });
    window.addEventListener('pointerup', () => {
      this.isDragging = false;
      this.autoRotateResumeTimeout = setTimeout(() => {}, 1200);
    });

    window.addEventListener('resize', () => this._onResize());
  }

  _observeVisibility() {
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            this.paused = !entry.isIntersecting || document.hidden;
          });
        },
        { threshold: 0.05 }
      );
      observer.observe(this.canvas);
    }
  }

  _onResize() {
    const parent = this.canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pr = Math.min(window.devicePixelRatio, this.tier.pixelRatioCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    if (this.composer) this.composer.setSize(width, height);
    if (this.pointsMaterial) this.pointsMaterial.uniforms.uPixelRatio.value = pr;
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.paused) return;

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.pointsMaterial) this.pointsMaterial.uniforms.uTime.value = elapsed;

    if (!this.isDragging && !prefersReducedMotion) {
      this.group.rotation.y += CONFIG.autoRotateSpeed * delta;
      // затухание инерции после отпускания
      this.dragVelocity.x *= CONFIG.dragRotateDamping;
      this.group.rotation.y += this.dragVelocity.x * 0.3;
    }

    for (const arc of this.arcs) {
      arc.offset = (arc.offset + delta * CONFIG.particleSpeed) % 1;
      const pos = arc.curve.getPointAt(arc.offset);
      arc.particle.position.copy(pos);
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 8. ИНИЦИАЛИЗАЦИЯ
// ──────────────────────────────────────────────────────────────────────────
function init() {
  const canvas = document.getElementById('dream-globe-canvas');
  if (!canvas) return;
  new DreamGlobe(canvas);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
