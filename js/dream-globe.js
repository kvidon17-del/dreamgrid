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
 *
 * ── Переход глобус → плоская карта (добавлено) ───────────────────────────
 * Пока пользователь скроллит секцию .hero, камера глобуса программно
 * "приближается" (altitude 1.7 → 0.32), из-за чего кривизна сферы визуально
 * почти исчезает — иллюзия того, что шар превращается в плоскость. Одновременно
 * canvas глобуса плавно теряет непрозрачность в последней трети скролла — это
 * страховка на стыке: к моменту, когда hero уходит за верх экрана, глобус уже
 * не виден, и плоская карта (.map-wrap) снизу подхватывает взгляд без хлопка.
 * Уважает prefers-reduced-motion — при этой настройке анимация зума/фейда
 * отключается, глобус остаётся в статичном виде.
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

// ── Настройки перехода глобус → карта ─────────────────────────────────────
const TRANSITION = {
  altitudeStart: 1.7,   // исходная точка обзора (как сейчас на проде)
  altitudeEnd: 0.32,    // "почти вплотную" — сфера визуально выглядит плоской
  fadeStart: 0.55,      // с какой доли скролла по hero начинает угасать opacity
  homeLat: 25,
  homeLng: 20,
};

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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
  globe.controls().enableZoom = false; // на главной странице зум мышью не нужен — это декоративный фон
  globe.controls().enablePan = false;
  globe.controls().minDistance = 120;
  globe.controls().maxDistance = 500;
  globe.pointOfView({ lat: TRANSITION.homeLat, lng: TRANSITION.homeLng, altitude: TRANSITION.altitudeStart }, 0);

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

  // Точки-"пыль" — тот же предвычисленный набор координат, что уже используется
  // на Explore Grid (/dust-points.json). Раньше здесь при каждой загрузке страницы
  // скачивалась картинка-маска суши/воды и в браузере пересчитывались координаты
  // для 16 000 точек (getImageData + до 80 000 попыток сэмплирования) — это и было
  // главной причиной задержки в несколько секунд. Теперь просто подгружаем готовый
  // компактный JSON и парсим его — без единого пикселя decode на клиенте.
  fetch('/dust-points.json')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(compact => {
      const landDust = compact.map(([lat, lng]) => ({ lat, lng, kind: 'land' }));
      globe.pointsData([...landDust, ...hubPoints]);
    })
    .catch(err => console.error('Dream Grid globe: не удалось загрузить пыль', err));

  window.addEventListener('resize', () => {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
  });

  initScrollTransition(globe, container);
}

// ── Переход глобус → карта по скроллу ─────────────────────────────────────
function initScrollTransition(globe, container) {
  const heroEl = document.querySelector('.hero');
  if (!heroEl) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // оставляем статичный глобус как есть, без анимации по скроллу

  let ticking = false;
  let lastProgress = -1;

  function computeProgress() {
    const heroHeight = heroEl.offsetHeight || window.innerHeight;
    const scrolled = window.scrollY;
    return Math.min(1, Math.max(0, scrolled / heroHeight));
  }

  function applyProgress(progress) {
    const eased = easeInOutCubic(progress);
    const altitude = TRANSITION.altitudeStart + (TRANSITION.altitudeEnd - TRANSITION.altitudeStart) * eased;
    globe.pointOfView({ lat: TRANSITION.homeLat, lng: TRANSITION.homeLng, altitude }, 0);

    // Замораживаем авто-вращение, как только начался скролл — иначе оно "борется"
    // с программным pointOfView и камера дёргается. Возвращаем вращение у самого верха.
    globe.controls().autoRotate = progress < 0.02;

    // Угасание в последней части скролла — страховка на стыке с плоской картой снизу
    const fadeProgress = Math.max(0, (progress - TRANSITION.fadeStart) / (1 - TRANSITION.fadeStart));
    container.style.opacity = String(1 - easeInOutCubic(Math.min(1, fadeProgress)));
  }

  function onScrollFrame() {
    ticking = false;
    const progress = computeProgress();
    if (Math.abs(progress - lastProgress) < 0.001) return;
    lastProgress = progress;
    applyProgress(progress);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScrollFrame(); // применяем сразу — на случай, если страница загрузилась не с самого верха
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
