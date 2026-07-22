/**
 * Dream Grid — Decorative Digital Globe (globe.gl edition)
 * ----------------------------------------------------------------------------
 * Библиотека globe.gl подключается через ES-модуль с CDN (jsdelivr). Без npm,
 * без сборки. ДЕКОРАТИВНАЯ анимация для главной страницы — координаты городов
 * используются только как визуальные "узлы", реальных данных о пользователях
 * здесь нет (для Explore Dreams с реальными мечтами будет отдельный файл).
 *
 * Подключение в index.html:
 *   <script type="importmap">
 *   { "imports": { "globe.gl": "https://cdn.jsdelivr.net/npm/globe.gl/+esm" } }
 *   </script>
 *   <div id="dream-globe-canvas"></div>  (не canvas! — обычный div-контейнер)
 *   <script type="module" src="/js/dream-globe.js"></script>
 */

import Globe from 'globe.gl';

// ── Палитра (фирменные цвета Dream Grid) ─────────────────────────────────
const PALETTE = {
  pointMajor: '#f472b6',
  pointMinor: '#38bdf8',
  landDust: '#3b4566',
  atmosphere: '#7c5cf6',
  border: 'rgba(124, 140, 180, 0.25)',
};

const LAND_DUST_COUNT = 16000;

// ── Города-узлы (декоративные якоря — не реальные данные пользователей) ──
const HUBS = [
  [-74.0, 40.7, 1],[-0.1, 51.5, 1],[2.35, 48.85, 1],[13.4, 52.5, 2],[37.6, 55.75, 1],
  [139.7, 35.7, 1],[116.4, 39.9, 1],[121.5, 31.2, 1],[77.2, 28.6, 1],[72.85, 19.07, 2],
  [103.8, 1.35, 1],[151.2, -33.9, 2],[-46.6, -23.5, 1],[-58.4, -34.6, 2],[31.2, 30.0, 2],
  [55.3, 25.2, 1],[-99.1, 19.4, 1],[28.9, 41.0, 2],[4.9, 52.37, 2],[-3.7, 40.4, 2],
  [12.5, 41.9, 2],[18.06, 59.33, 2],[24.9, 60.2, 2],[30.5, 50.45, 2],[126.98, 37.57, 2],
  [100.5, 13.75, 2],[106.85, -6.2, 2],[153.02, -27.47, 2],[174.76, -36.85, 2],[-79.4, 43.65, 2],
  [-122.4, 37.77, 1],[-118.2, 34.05, 2],[-87.6, 41.88, 2],[-43.2, -22.9, 2],[-70.6, -33.45, 2],
  [36.8, -1.29, 2],[28.05, -26.2, 2],[3.4, 6.45, 2],[15.5, -4.3, 2],[46.7, 24.7, 2],
  [67.0, 24.86, 2],[90.4, 23.8, 2],[114.15, 22.28, 2],
];

function init() {
  const container = document.getElementById('dream-globe-canvas');
  if (!container) return;

  const hubPoints = HUBS.map(([lng, lat, tier]) => ({ lat, lng, tier, kind: 'hub' }));

  const globe = new Globe(container)
    .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg')
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor(PALETTE.atmosphere)
    .atmosphereAltitude(0.14)

    .pointsData(hubPoints)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor(d => d.kind === 'land' ? PALETTE.landDust : (d.tier === 1 ? PALETTE.pointMajor : PALETTE.pointMinor))
    .pointAltitude(d => d.kind === 'land' ? 0.0005 : 0.006)
    .pointRadius(d => d.kind === 'land' ? 0.045 : (d.tier === 1 ? 0.55 : 0.34))
    .pointResolution(d => d.kind === 'land' ? 3 : 12)
    .pointsMerge(true)

    .width(container.clientWidth)
    .height(container.clientHeight);

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.45;
  globe.controls().enableZoom = false; // на главной странице зум не нужен — это декоративный фон
  globe.controls().enablePan = false;
  globe.controls().minDistance = 120;
  globe.controls().maxDistance = 500;
  globe.pointOfView({ lat: 25, lng: 20, altitude: 1.7 }, 0);

  // Настоящие границы стран (Natural Earth, открытые данные)
  fetch('https://cdn.jsdelivr.net/gh/vasturiano/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson')
    .then(res => res.json())
    .then(countries => {
      globe
        .polygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'))
        .polygonCapColor(() => 'rgba(0,0,0,0)')
        .polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonStrokeColor(() => PALETTE.border)
        .polygonAltitude(0.0015);
    })
    .catch(err => console.error('Dream Grid globe: не удалось загрузить границы стран', err));

  // Точки-"пыль" по настоящей маске суши/воды (покрывает материки и острова)
  loadLandMask('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png')
    .then(mask => {
      const landDust = generateLandDust(mask, LAND_DUST_COUNT);
      globe.pointsData([...landDust, ...hubPoints]);
    })
    .catch(err => console.error('Dream Grid globe: не удалось загрузить маску суши', err));

  window.addEventListener('resize', () => {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
  });
}

// ── Маска суши/воды: тёмный пиксель = суша, светлый = вода ───────────────
function loadLandMask(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      resolve({ data, width: canvas.width, height: canvas.height });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function isLandFromMask(mask, lon, lat) {
  const x = Math.floor(((lon + 180) / 360) * mask.width) % mask.width;
  const y = Math.min(mask.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * mask.height)));
  const idx = (y * mask.width + x) * 4;
  return mask.data[idx] < 128;
}

function generateLandDust(mask, count) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  let tries = 0;
  const maxTries = count * 5;
  while (pts.length < count && tries < maxTries) {
    const y = 1 - (tries / (maxTries - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * tries;
    const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
    tries++;
    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, x) * (180 / Math.PI);
    if (!isLandFromMask(mask, lon, lat)) continue;
    pts.push({ lat, lng: lon, kind: 'land' });
  }
  return pts;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
