/**
 * Dream Grid — Decorative Digital Globe v3 (background visual for hero section)
 * ----------------------------------------------------------------------------
 * Чистый JS + Three.js через ES-модули с CDN (jsdelivr). Без npm, без сборки.
 * ДЕКОРАТИВНАЯ анимация — координаты городов используются только как визуальные
 * "узлы" для дуг и очагов света, реальных пользовательских данных здесь нет.
 *
 * v3: расширенный список городов-узлов (~42), процедурный слой облаков
 * (генерируется на canvas, без внешних текстур), "тёплые" световые очаги
 * вокруг крупных городов (имитация ночных огней мегаполисов).
 *
 * Подключение в index.html не меняется (уже сделано ранее):
 *   importmap с three + three/addons/, canvas#dream-globe-canvas,
 *   <script type="module" src="/js/dream-globe.js"></script>
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

// ──────────────────────────────────────────────────────────────────────────
// 1. КОНФИГУРАЦИЯ
// ──────────────────────────────────────────────────────────────────────────
const CONFIG = {
  radius: 100,
  autoRotateSpeed: 0.05,
  dragRotateDamping: 0.92,

  pointColor: '#c4b5fd',
  pointColorBright: '#f9a8d4',
  pointColorWarm: '#ffd39b',
  cityHotspotRadiusDeg: 7,
  cityHotspotBoost: 0.55,

  gridColor: '#7c9cf6',
  gridOpacity: 0.14,
  gridLatLines: 10,
  gridLonLines: 16,

  arcColor: '#8b6cf7',
  arcColorBright: '#f9a8d4',
  arcLineWidth: 2.2,
  arcHeightFactor: 0.34,
  arcCount: 20,
  particleSpeed: 0.16,

  hubGlowColor: '#c9b8ff',
  hubCoreColor: '#ffffff',
  hubGlowSizeMajor: 15,
  hubGlowSizeMinor: 9,
  hubPulseSpeed: 1.1,
  hubPulseAmount: 0.35,

  ringColors: ['#7c5cf6', '#f472b6'],
  ringTilts: [ [0.55, 0.15], [-0.35, 1.15] ],
  ringOpacity: 0.22,
  ringSpin: [0.02, -0.014],

  starFieldCount: 900,
  starFieldColor: '#bcd0ff',
  starFieldRadiusMin: 260,
  starFieldRadiusMax: 520,

  cloudOpacity: 0.28,
  cloudSpin: 0.012,

  atmosphereColor: '#7c5cf6',
  atmosphereIntensity: 0.5,

  bloomStrength: 1.15,
  bloomRadius: 0.65,
  bloomThreshold: 0.1,

  twinkleSpeed: 1.4,
  twinkleAmount: 0.35,
};

function getQualityTier() {
  const w = window.innerWidth;
  if (w < 640) return { points: 7000, arcs: 10, bloom: false, stars: 300, clouds: false, pixelRatioCap: 1.5, rings: false };
  if (w < 1024) return { points: 17000, arcs: 14, bloom: true, stars: 550, clouds: true, pixelRatioCap: 1.75, rings: true };
  return { points: 32000, arcs: CONFIG.arcCount, bloom: true, stars: CONFIG.starFieldCount, clouds: true, pixelRatioCap: 2, rings: true };
}

const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ──────────────────────────────────────────────────────────────────────────
// 2. Грубые контуры материков (упрощённые полигоны, только форма облака точек)
// ──────────────────────────────────────────────────────────────────────────
const CONTINENTS = [
  [[-165,68],[-140,70],[-95,72],[-60,60],[-52,48],[-65,45],[-80,32],[-97,20],[-105,22],[-118,32],[-124,45],[-140,60],[-165,68]],
  [[-80,10],[-60,10],[-35,-5],[-35,-23],[-58,-38],[-70,-52],[-75,-40],[-81,-5],[-80,10]],
  [[-10,36],[0,44],[10,54],[25,60],[40,65],[40,50],[28,42],[15,38],[-5,38],[-10,36]],
  [[-18,15],[10,37],[33,32],[44,12],[42,-5],[35,-25],[18,-35],[12,-18],[-10,5],[-18,15]],
  [[28,42],[45,60],[70,68],[100,72],[140,68],[145,45],[130,32],[110,20],[95,8],[75,10],[60,25],[45,30],[28,42]],
  [[68,24],[80,28],[88,22],[80,8],[72,10],[68,24]],
  [[95,20],[110,22],[122,18],[125,5],[105,-8],[95,5],[95,20]],
  [[113,-12],[130,-11],[145,-17],[153,-28],[145,-38],[130,-32],[115,-25],[113,-12]],
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
  for (const poly of CONTINENTS) if (pointInPolygon(lon, lat, poly)) return true;
  return false;
}

// Расширенный список городов-узлов (декоративные якоря для дуг/огней, ~42 города).
// tier: 1 = крупный мегаполис (больше свечение/ярче очаг), 2 = обычный узел.
const HUBS = [
  [-74.0, 40.7, 1],   // Нью-Йорк
  [-0.1, 51.5, 1],    // Лондон
  [2.35, 48.85, 1],   // Париж
  [13.4, 52.5, 2],    // Берлин
  [37.6, 55.75, 1],   // Москва
  [139.7, 35.7, 1],   // Токио
  [116.4, 39.9, 1],   // Пекин
  [121.5, 31.2, 1],   // Шанхай
  [77.2, 28.6, 1],    // Дели
  [72.85, 19.07, 2],  // Мумбаи
  [103.8, 1.35, 1],   // Сингапур
  [151.2, -33.9, 2],  // Сидней
  [-46.6, -23.5, 1],  // Сан-Паулу
  [-58.4, -34.6, 2],  // Буэнос-Айрес
  [31.2, 30.0, 2],    // Каир
  [55.3, 25.2, 1],    // Дубай
  [-99.1, 19.4, 1],   // Мехико
  [28.9, 41.0, 2],    // Стамбул
  [4.9, 52.37, 2],    // Амстердам
  [-3.7, 40.4, 2],    // Мадрид
  [12.5, 41.9, 2],    // Рим
  [18.06, 59.33, 2],  // Стокгольм
  [24.9, 60.2, 2],    // Хельсинки
  [30.5, 50.45, 2],   // Киев
  [126.98, 37.57, 2], // Сеул
  [100.5, 13.75, 2],  // Бангкок
  [106.85, -6.2, 2],  // Джакарта
  [153.02, -27.47, 2],// Брисбен
  [174.76, -36.85, 2],// Окленд
  [-79.4, 43.65, 2],  // Торонто
  [-122.4, 37.77, 1], // Сан-Франциско
  [-118.2, 34.05, 2], // Лос-Анджелес
  [-87.6, 41.88, 2],  // Чикаго
  [-43.2, -22.9, 2],  // Рио-де-Жанейро
  [-70.6, -33.45, 2], // Сантьяго
  [36.8, -1.29, 2],   // Найроби
  [28.05, -26.2, 2],  // Йоханнесбург
  [3.4, 6.45, 2],     // Лагос
  [15.5, -4.3, 2],    // Киншаса
  [46.7, 24.7, 2],    // Эр-Рияд
  [67.0, 24.86, 2],   // Карачи
  [90.4, 23.8, 2],    // Дакка
  [114.15, 22.28, 2], // Гонконг
];

// ──────────────────────────────────────────────────────────────────────────
// 3. Утилиты
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

function angularDistDeg(lon1, lat1, lon2, lat2) {
  // Приближённая (не большого круга, а плоская) угловая дистанция — этого достаточно
  // для декоративной подсветки очагов, высокая точность здесь не нужна.
  const dLon = Math.min(Math.abs(lon1 - lon2), 360 - Math.abs(lon1 - lon2));
  const dLat = Math.abs(lat1 - lat2);
  return Math.sqrt(dLon * dLon + dLat * dLat);
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

function makeGlowTexture(hex = '#ffffff') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, hex);
  gradient.addColorStop(0.25, hex);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Процедурная текстура облаков: равномерная (equirectangular) карта из мягких
// белых пятен, без внешних изображений — рисуется прямо на canvas.
function makeCloudTexture() {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';

  const blobCount = 220;
  for (let i = 0; i < blobCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.85 + h * 0.05; // избегаем полюсов
    const radius = 18 + Math.random() * 55;
    const alpha = 0.05 + Math.random() * 0.12;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    // рисуем зеркальную копию у левого/правого края для непрерывности по долготе
    if (x < radius) {
      ctx.beginPath();
      ctx.arc(x + w, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (x > w - radius) {
      ctx.beginPath();
      ctx.arc(x - w, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Генерация точек материков (fibonacci sphere + фильтр по маске суши +
//    "тёплые" очаги вокруг крупных городов)
// ──────────────────────────────────────────────────────────────────────────
function generateLandPoints(count, radius) {
  const positions = [];
  const sizes = [];
  const brightness = [];
  const phases = [];
  const warmth = [];

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
    const lon = Math.atan2(z, x) * (180 / Math.PI);

    if (!isLand(lon, lat)) continue;

    let localWarmth = 0;
    let localBoost = 0;
    for (const [hLon, hLat, tier] of HUBS) {
      const d = angularDistDeg(lon, lat, hLon, hLat);
      const hotRadius = CONFIG.cityHotspotRadiusDeg * (tier === 1 ? 1.5 : 1);
      if (d < hotRadius) {
        const falloff = 1 - d / hotRadius;
        const boost = falloff * CONFIG.cityHotspotBoost * (tier === 1 ? 1.3 : 1);
        if (boost > localBoost) localBoost = boost;
        if (falloff > localWarmth) localWarmth = falloff;
      }
    }

    const v = new THREE.Vector3(x, y, z).multiplyScalar(radius);
    positions.push(v.x, v.y, v.z);
    sizes.push(1.2 + Math.random() * 2.0 + localBoost * 1.5);
    brightness.push(Math.min(1, 0.5 + Math.random() * 0.4 + localBoost));
    phases.push(Math.random() * Math.PI * 2);
    warmth.push(Math.min(1, localWarmth));
    kept++;
  }

  return {
    positions: new Float32Array(positions),
    sizes: new Float32Array(sizes),
    brightness: new Float32Array(brightness),
    phases: new Float32Array(phases),
    warmth: new Float32Array(warmth),
    count: kept,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Шейдеры
// ──────────────────────────────────────────────────────────────────────────
const pointsVertexShader = `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aWarmth;
  uniform float uTime;
  uniform float uTwinkleSpeed;
  uniform float uTwinkleAmount;
  uniform float uPixelRatio;
  varying float vBrightness;
  varying float vWarmth;
  void main() {
    float twinkle = 1.0 + sin(uTime * uTwinkleSpeed + aPhase) * uTwinkleAmount;
    vBrightness = aBrightness * twinkle;
    vWarmth = aWarmth;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (220.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const pointsFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uColorBright;
  uniform vec3 uColorWarm;
  varying float vBrightness;
  varying float vWarmth;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d);
    vec3 color = mix(uColor, uColorBright, clamp(vBrightness - 0.6, 0.0, 1.0) * 2.0);
    color = mix(color, uColorWarm, vWarmth);
    gl_FragColor = vec4(color * vBrightness, alpha * vBrightness);
  }
`;
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
// 6. Основной класс
// ──────────────────────────────────────────────────────────────────────────
class DreamGlobe {
  constructor(canvas) {
    this.canvas = canvas;
    this.tier = getQualityTier();
    this.clock = new THREE.Clock();
    this.isDragging = false;
    this.dragVelocity = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.paused = false;
    this.arcs = [];
    this.hubSprites = [];
    this.rings = [];

    if (!checkWebGL()) {
      this.canvas.style.display = 'none';
      return;
    }

    this._initScene();
    this._buildGlobe();
    this._buildGrid();
    if (this.tier.clouds) this._buildClouds();
    this._buildAtmosphere();
    this._buildHubs();
    this._buildArcs();
    if (this.tier.rings) this._buildRings();
    this._buildStarField();
    this._bindEvents();
    this._observeVisibility();
    this._onResize();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
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

    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);

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
    geometry.setAttribute('aWarmth', new THREE.BufferAttribute(data.warmth, 1));

    this.pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(CONFIG.pointColor) },
        uColorBright: { value: new THREE.Color(CONFIG.pointColorBright) },
        uColorWarm: { value: new THREE.Color(CONFIG.pointColorWarm) },
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

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.radius * 0.985, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x05070f, transparent: true, opacity: 0.55 })
    );
    this.group.add(core);
  }

  _buildGrid() {
    const gridGroup = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(CONFIG.gridColor),
      transparent: true,
      opacity: CONFIG.gridOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const r = CONFIG.radius * 1.004;

    for (let i = 1; i < CONFIG.gridLatLines; i++) {
      const lat = -90 + (180 / CONFIG.gridLatLines) * i;
      const phi = (90 - lat) * (Math.PI / 180);
      const ringRadius = r * Math.sin(phi);
      const y = r * Math.cos(phi);
      const pts = [];
      const seg = 64;
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(ringRadius * Math.cos(a), y, ringRadius * Math.sin(a)));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      gridGroup.add(new THREE.LineLoop(geom, material));
    }

    for (let i = 0; i < CONFIG.gridLonLines; i++) {
      const lon = (360 / CONFIG.gridLonLines) * i - 180;
      const pts = [];
      const seg = 64;
      for (let s = 0; s <= seg; s++) {
        const lat = -90 + (180 / seg) * s;
        pts.push(latLonToVector3(lon, lat, r));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      gridGroup.add(new THREE.Line(geom, material));
    }

    this.group.add(gridGroup);
  }

  // Слой облаков — процедурная равномерная текстура на чуть большей сфере
  _buildClouds() {
    const texture = makeCloudTexture();
    const geometry = new THREE.SphereGeometry(CONFIG.radius * 1.02, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: CONFIG.cloudOpacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.clouds = new THREE.Mesh(geometry, material);
    this.group.add(this.clouds);
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

  _buildHubs() {
    const glowTex = makeGlowTexture(CONFIG.hubGlowColor);
    const coreTex = makeGlowTexture(CONFIG.hubCoreColor);

    for (const [lon, lat, tier] of HUBS) {
      const pos = latLonToVector3(lon, lat, CONFIG.radius * 1.01);
      const size = tier === 1 ? CONFIG.hubGlowSizeMajor : CONFIG.hubGlowSizeMinor;

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: tier === 1 ? 0.6 : 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(pos);
      glow.scale.setScalar(size);
      this.group.add(glow);

      const coreMaterial = new THREE.SpriteMaterial({
        map: coreTex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const core = new THREE.Sprite(coreMaterial);
      core.position.copy(pos);
      core.scale.setScalar(size * 0.28);
      this.group.add(core);

      this.hubSprites.push({ glow, core, baseSize: size, phase: Math.random() * Math.PI * 2 });
    }
  }

  _buildArcs() {
    const arcCount = prefersReducedMotion ? 0 : this.tier.arcs;
    const usedPairs = new Set();
    const c1 = new THREE.Color(CONFIG.arcColor);
    const c2 = new THREE.Color(CONFIG.arcColorBright);
    const glowTex = makeGlowTexture(CONFIG.arcColorBright);

    for (let i = 0; i < arcCount; i++) {
      const a = HUBS[Math.floor(Math.random() * HUBS.length)];
      let b = HUBS[Math.floor(Math.random() * HUBS.length)];
      let guard = 0;
      const keyOf = (p) => p[0] + ',' + p[1];
      while ((b === a || usedPairs.has(keyOf(a) + '-' + keyOf(b))) && guard < 10) {
        b = HUBS[Math.floor(Math.random() * HUBS.length)];
        guard++;
      }
      usedPairs.add(keyOf(a) + '-' + keyOf(b));

      const start = latLonToVector3(a[0], a[1], CONFIG.radius);
      const end = latLonToVector3(b[0], b[1], CONFIG.radius);
      const dist = start.distanceTo(end);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(CONFIG.radius + dist * CONFIG.arcHeightFactor);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(48);

      const positions = [];
      const colors = [];
      for (let p = 0; p < points.length; p++) {
        positions.push(points[p].x, points[p].y, points[p].z);
        const t = p / (points.length - 1);
        const fade = Math.pow(Math.sin(t * Math.PI), 0.8);
        const mixed = c1.clone().lerp(c2, 0.3);
        colors.push(mixed.r * fade, mixed.g * fade, mixed.b * fade);
      }

      const lineGeom = new LineGeometry();
      lineGeom.setPositions(positions);
      lineGeom.setColors(colors);

      const lineMaterial = new LineMaterial({
        linewidth: CONFIG.arcLineWidth,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        worldUnits: false,
      });
      lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

      const line = new Line2(lineGeom, lineMaterial);
      line.computeLineDistances();
      this.group.add(line);

      const particleMaterial = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particle = new THREE.Sprite(particleMaterial);
      particle.scale.setScalar(6.5);
      this.group.add(particle);

      this.arcs.push({ curve, particle, lineMaterial, offset: Math.random() });
    }
  }

  _buildRings() {
    CONFIG.ringTilts.forEach((tilt, idx) => {
      const color = CONFIG.ringColors[idx % CONFIG.ringColors.length];
      const r = CONFIG.radius * (1.55 + idx * 0.22);
      const pts = [];
      const seg = 128;
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: CONFIG.ringOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.LineLoop(geom, material);
      ring.rotation.x = tilt[0];
      ring.rotation.y = tilt[1];
      this.group.add(ring);
      this.rings.push({ mesh: ring, spin: CONFIG.ringSpin[idx % CONFIG.ringSpin.length] });
    });
  }

  _buildStarField() {
    const count = this.tier.stars;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = THREE.MathUtils.randFloat(CONFIG.starFieldRadiusMin, CONFIG.starFieldRadiusMax);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(CONFIG.starFieldColor),
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starField = new THREE.Points(geom, material);
    this.starGroup.add(this.starField);
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
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
    for (const arc of this.arcs) {
      arc.lineMaterial.resolution.set(width, height);
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.paused) return;

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.pointsMaterial) this.pointsMaterial.uniforms.uTime.value = elapsed;

    if (!this.isDragging && !prefersReducedMotion) {
      this.group.rotation.y += CONFIG.autoRotateSpeed * delta;
      this.dragVelocity.x *= CONFIG.dragRotateDamping;
      this.group.rotation.y += this.dragVelocity.x * 0.3;
    }

    for (const arc of this.arcs) {
      arc.offset = (arc.offset + delta * CONFIG.particleSpeed) % 1;
      const pos = arc.curve.getPointAt(arc.offset);
      arc.particle.position.copy(pos);
      const edgeProximity = Math.min(arc.offset, 1 - arc.offset);
      const burst = edgeProximity < 0.06 ? 1.6 : 1.0;
      arc.particle.scale.setScalar(6.5 * burst);
    }

    if (!prefersReducedMotion) {
      for (const hub of this.hubSprites) {
        const pulse = 1 + Math.sin(elapsed * CONFIG.hubPulseSpeed + hub.phase) * CONFIG.hubPulseAmount;
        hub.glow.scale.setScalar(hub.baseSize * pulse);
      }
      for (const ring of this.rings) {
        ring.mesh.rotation.z += ring.spin * delta;
      }
      if (this.clouds) this.clouds.rotation.y += CONFIG.cloudSpin * delta;
      if (this.starField) this.starGroup.rotation.y += 0.003 * delta;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Инициализация
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
