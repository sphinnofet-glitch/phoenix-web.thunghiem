// =====================================================================
// public/js/main.js
// Điểm vào: nạp thư viện và module (thanh tiến trình thật), dựng renderer dùng chung, intro,
// router, điều hướng bằng wheel/vuốt/bàn phím, chuyển cảnh, dự phòng khi không có WebGL.
// Chỉ import tĩnh config.js và utils.js; mọi thứ còn lại nạp động để lỗi tải hiện thông báo thân thiện.
// =====================================================================
import { CONFIG } from './config.js';
import { announce, detectTier, detectWebGL, disposeObject, el, hasCoarsePointer, isTypingTarget, onReducedMotionChange, prefersReducedMotion, safeSession } from './utils.js';

const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const loaderEls = {
  root: $('loader'),
  fill: $('loader-fill'),
  bar: $('loader-bar'),
  text: $('loader-text'),
  error: $('loader-error'),
  errorText: $('loader-error-text'),
  retry: $('loader-retry')
};

// ---------- Loading ----------
let progress = 0;
function setProgress(p) {
  progress = Math.max(progress, Math.min(1, p));
  if (loaderEls.fill) loaderEls.fill.style.transform = `scaleX(${progress.toFixed(3)})`;
  if (loaderEls.bar) loaderEls.bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  const msgs = CONFIG.loader.messages;
  if (loaderEls.text) loaderEls.text.textContent = msgs[Math.min(msgs.length - 1, Math.floor(progress * msgs.length))];
}

function showLoadError(err) {
  console.error('[boot]', err);
  if (loaderEls.text) loaderEls.text.hidden = true;
  if (loaderEls.error) loaderEls.error.hidden = false;
  if (loaderEls.errorText) loaderEls.errorText.textContent = CONFIG.loader.errorText;
  if (loaderEls.retry) {
    loaderEls.retry.textContent = CONFIG.loader.retryLabel;
    loaderEls.retry.onclick = () => window.location.reload();
  }
}

function hideLoader() {
  loaderEls.root.classList.add('is-done');
  document.body.classList.remove('is-loading');
  window.setTimeout(() => {
    loaderEls.root.hidden = true;
  }, 800);
}

// ---------- Dự phòng CSS 3D khi không có WebGL ----------
function buildFallback() {
  const host = $('fallback');
  if (!host) return;
  host.textContent = '';
  const ring = el('div', { class: 'fallback__ring' });
  const n = 12;
  for (let i = 0; i < n; i++) {
    const feather = el('div', { class: 'fallback__feather' });
    feather.style.transform = `rotateY(${(360 / n) * i}deg) translateZ(110px) rotateX(${i % 2 ? 12 : -12}deg)`;
    ring.append(feather);
  }
  host.append(ring);
  host.hidden = false;
}

function hideFallback() {
  const host = $('fallback');
  if (host) host.hidden = true;
}

// ---------- Intro (một lần mỗi phiên) ----------
function playIntro(gsap) {
  return new Promise((resolve) => {
    const intro = $('intro');
    const skip = $('intro-skip');
    if (!intro || safeSession('pw_intro') === '1' || prefersReducedMotion()) {
      safeSession('pw_intro', '1');
      resolve();
      return;
    }
    safeSession('pw_intro', '1');
    skip.textContent = CONFIG.loader.skipLabel;
    intro.hidden = false;
    const sparkHost = $('intro-spark');
    const sparks = [];
    const R = Math.max(window.innerWidth, window.innerHeight) * 0.6;
    for (let i = 0; i < 36; i++) {
      const s = el('span');
      Object.assign(s.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '6px',
        height: '6px',
        marginLeft: '-3px',
        marginTop: '-3px',
        borderRadius: '50%',
        background: i % 3 === 0 ? '#ffd166' : i % 3 === 1 ? '#ff8a00' : '#ff5a1f',
        boxShadow: '0 0 12px 3px rgba(255,138,0,0.8)',
        opacity: '0'
      });
      sparkHost.append(s);
      sparks.push(s);
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      tl.kill();
      document.removeEventListener('keydown', onKey);
      gsap.to(intro, {
        opacity: 0,
        duration: 0.45,
        onComplete: () => {
          intro.hidden = true;
          intro.style.opacity = '';
          sparkHost.textContent = '';
          resolve();
        }
      });
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') finish();
    };
    document.addEventListener('keydown', onKey);
    skip.onclick = finish;
    const tl = gsap.timeline({ onComplete: finish });
    tl.set(intro, { opacity: 1 });
    sparks.forEach((s, i) => {
      const a = (i / sparks.length) * Math.PI * 2 + Math.random() * 0.4;
      tl.fromTo(
        s,
        { x: Math.cos(a) * R, y: Math.sin(a) * R, opacity: 0, scale: 0.4 },
        { x: 0, y: 0, opacity: 1, scale: 1.4, duration: 1.2, ease: 'power3.in' },
        i * 0.015
      );
    });
    tl.to(sparks, { opacity: 0, scale: 3, duration: 0.3 }, 1.35);
    tl.fromTo('.intro__brand', { opacity: 0, scale: 0.8, letterSpacing: '0.4em' }, { opacity: 1, scale: 1, letterSpacing: '0.02em', duration: 1.0, ease: 'power3.out' }, 1.3);
    tl.to({}, { duration: 0.5 }, 2.3);
    skip.focus({ preventScroll: true });
  });
}

// ---------- Khởi động ----------
async function boot() {
  const watchdog = window.setTimeout(() => showLoadError(new Error('timeout')), 25000);
  try {
    setProgress(0.03);
    const modules = {};
    const jobs = [
      ['three', () => import('three')],
      ['gsap', () => import('gsap')],
      ['sceneManager', () => import('./scene-manager.js')],
      ['input', () => import('./input.js')],
      ['router', () => import('./router.js')],
      ['phoenix', () => import('./phoenix.js')],
      ['page1', () => import('./page1-welcome.js')],
      ['page2', () => import('./page2-services.js')],
      ['page3', () => import('./page3-contact.js')]
    ];
    let done = 0;
    await Promise.all(
      jobs.map(async ([name, load]) => {
        modules[name] = await load();
        done += 1;
        setProgress(0.05 + (done / jobs.length) * 0.85);
      })
    );

    const THREE = modules.three;
    const { gsap } = modules.gsap;
    const factories = { 1: modules.page1.createScene, 2: modules.page2.createScene, 3: modules.page3.createScene };
    let page4Promise = null;
    const loadPage4 = () => {
      if (!page4Promise) page4Promise = import('./page4-about.js').then((m) => m.createScene);
      return page4Promise;
    };

    // ----- Renderer dùng chung -----
    const canvas = $('gl');
    const stage = $('stage');
    const rail = $('rail');
    const tier = detectTier();
    const input = new modules.input.Input($('cursor'));
    let headless = !detectWebGL();
    let sm = null;
    if (!headless) {
      try {
        sm = new modules.sceneManager.SceneManager({ THREE, gsap, canvas, input, tier });
      } catch (err) {
        console.warn('[boot] không khởi tạo được WebGL, dùng bản dự phòng:', err);
        headless = true;
      }
    }
    if (headless) {
      html.classList.add('no-webgl');
      canvas.hidden = true;
      buildFallback();
      sm = new modules.sceneManager.SceneManager({ THREE, gsap, canvas: null, input, tier, headless: true });
    }
    sm.on('contextlost', () => buildFallback());
    sm.on('contextrestored', () => hideFallback());

    const ctx = {
      CONFIG,
      THREE,
      gsap,
      sm,
      input,
      stage,
      gl: !headless,
      get reduced() {
        return prefersReducedMotion();
      },
      announce,
      router: null,
      go: (page, params) => ctx.router.go(page, params)
    };

    input.start();
    sm.addFrame((dt) => input.update(dt));
    sm.setFade(1);
    sm.setTheme(1, 0);
    sm.setRig({ pos: [0, 0.2, 9], look: [0, 0.6, 0], fov: 50 }, 0);

    // ----- Điều hướng giữa các cảnh -----
    let active = null; // { page, scene }
    let removeUpdate = null;

    const updateRail = (page) => {
      for (const link of rail.querySelectorAll('.rail__link')) {
        const on = Number(link.dataset.page) === page;
        link.classList.toggle('is-active', on);
        if (on) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      $('app').dataset.page = String(page);
      const label = CONFIG.nav.find((n) => n.page === page);
      if (label) {
        document.title = `${label.label} - ${CONFIG.site.name}`;
        announce(label.label);
      }
    };

    const destroyActive = () => {
      if (!active) return;
      if (removeUpdate) removeUpdate();
      removeUpdate = null;
      const { scene } = active;
      try {
        if (scene.onLeave) scene.onLeave();
        scene.dispose();
      } catch (err) {
        console.error('[scene:dispose]', err);
      }
      disposeObject(scene.group);
      sm.world.remove(scene.group);
      if (scene.root.isConnected) scene.root.remove();
      active = null;
    };

    const showSceneError = () => {
      stage.textContent = '';
      stage.append(
        el('section', { class: 'scene', role: 'alert' }, [
          el('p', { class: 'scene__lead', text: CONFIG.loader.errorText }),
          el('a', { class: 'btn btn--primary', href: '#/1', text: CONFIG.loader.retryLabel, onClick: () => window.location.reload() })
        ])
      );
    };

    const swapTo = (to, params, factory, first) => {
      destroyActive();
      sm.resetCameraOffsets();
      let scene;
      try {
        scene = factory(ctx);
      } catch (err) {
        console.error('[scene:create]', err);
        showSceneError();
        return;
      }
      stage.append(scene.root);
      sm.world.add(scene.group);
      scene.mount(params);
      sm.setRig(scene.rig(sm.width / sm.height), 0);
      sm.setTheme(to, first ? 0 : 1);
      active = { page: to, scene };
      removeUpdate = sm.addFrame((dt, t) => scene.update && scene.update(dt, t));
      if (scene.resize) scene.resize(sm.width, sm.height);
      updateRail(to);
      if (!first) {
        const target = scene.focusEl || stage;
        target.focus({ preventScroll: true });
      }
      Promise.resolve(scene.enter ? scene.enter(params, { first }) : null).catch((err) => console.error('[scene:enter]', err));
    };

    const router = new modules.router.Router({
      pages: 4,
      async onNavigate({ to, params, dir, first, same }) {
        if (same && active) {
          if (active.scene.setParams) active.scene.setParams(params);
          return;
        }
        let factory;
        try {
          factory = factories[to] || (await loadPage4());
        } catch (err) {
          console.error('[page-load]', err);
          showSceneError();
          return;
        }
        if (first) {
          swapTo(to, params, factory, true);
          return;
        }
        if (active && active.scene.onLeave) active.scene.onLeave();
        const kind = to % 2 === 0 ? 'gate' : 'sweep';
        await sm.transition(kind, () => swapTo(to, params, factory, false), dir);
      }
    });
    ctx.router = router;

    // ----- Đầu vào: wheel, vuốt, bàn phím -----
    let wheelAcc = 0;
    let wheelAt = 0;
    let wheelLock = 0;

    const atEdge = (el_, dy) => {
      const top = el_.scrollTop <= 1;
      const bottom = el_.scrollTop + el_.clientHeight >= el_.scrollHeight - 2;
      return dy > 0 ? bottom : top;
    };

    input.on('wheel', (ev) => {
      if (!active) return false;
      const target = ev.target;
      if (target && target.closest && target.closest('.detail__panel')) return false;
      if (router.busy) return true;
      const scene = active.scene;
      if (scene.onWheel && scene.onWheel(ev) === true) return true;
      if (target && target.closest && target.closest('textarea, select')) return false;
      const now = performance.now();
      if (now < wheelLock) return true;
      let threshold = 90;
      if (scene.scrollEl) {
        if (!atEdge(scene.scrollEl, ev.dy)) {
          wheelAcc = 0;
          return false; // cuộn nội dung như bình thường
        }
        threshold = 260; // đang ở mép: cần thêm chủ ý rõ ràng mới chuyển trang
      }
      if (now - wheelAt > 200) wheelAcc = 0;
      wheelAt = now;
      wheelAcc += ev.dy;
      if (Math.abs(wheelAcc) >= threshold) {
        const dir = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        wheelLock = now + 1300;
        if (dir > 0) router.next();
        else router.prev();
      }
      return scene.scrollEl ? false : true;
    });

    input.on('swipe', (ev) => {
      if (!active || router.busy || !active.scene.swipeNav) return false;
      if (ev.target && ev.target.closest && ev.target.closest('.detail, .filters, input, textarea, select')) return false;
      if (ev.dir === 'up') router.next();
      else if (ev.dir === 'down') router.prev();
      return false;
    });

    input.on('key', (ev) => {
      if (!active) return false;
      const scene = active.scene;
      if (scene.onKey && scene.onKey(ev) === true) return true;
      if (isTypingTarget(ev.target)) return false;
      if (ev.target && ev.target.closest && ev.target.closest('.detail')) return false;
      if (router.busy) return false;
      const key = ev.key;
      if (/^[1-4]$/.test(key)) {
        router.go(Number(key));
        return true;
      }
      if (key === 'Home') {
        router.go(1);
        return true;
      }
      if (key === 'End') {
        router.go(4);
        return true;
      }
      const scroller = scene.scrollEl;
      if (key === 'PageDown' || key === 'PageUp') {
        const dy = key === 'PageDown' ? 1 : -1;
        if (scroller && !atEdge(scroller, dy)) return false;
        if (dy > 0) router.next();
        else router.prev();
        return true;
      }
      if (!scroller && (key === 'ArrowDown' || key === 'ArrowUp')) {
        if (key === 'ArrowDown') router.next();
        else router.prev();
        return true;
      }
      if (active.page === 1 && (key === 'ArrowRight' || key === 'ArrowLeft')) {
        if (key === 'ArrowRight') router.next();
        else router.prev();
        return true;
      }
      return false;
    });

    // ----- Resize, con quay, giảm chuyển động -----
    sm.on('resize', ({ width, height, aspect }) => {
      if (!active) return;
      if (active.scene.resize) active.scene.resize(width, height);
      sm.setRig(active.scene.rig(aspect), 0);
    });
    sm.on('quality', () => {
      if (active && active.scene.onQuality) active.scene.onQuality(sm.quality);
    });
    onReducedMotionChange(() => sm.resize());

    const gyroBtn = $('gyro-btn');
    if (gyroBtn && input.needsGyroPermission() && hasCoarsePointer() && !prefersReducedMotion()) {
      gyroBtn.hidden = false;
      gyroBtn.onclick = async () => {
        const ok = await input.enableGyro();
        if (ok) gyroBtn.hidden = true;
      };
    }

    // Phần nặng của trang 4 được nạp sẵn khi trình duyệt rảnh.
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1500));
    idle(() => loadPage4().catch(() => {}));

    // ----- Xong: ẩn loading, chạy intro rồi vào trang -----
    sm.start();
    setProgress(1);
    window.clearTimeout(watchdog);
    window.setTimeout(hideLoader, 250);
    await playIntro(gsap);
    router.start();
  } catch (err) {
    window.clearTimeout(watchdog);
    showLoadError(err);
  }
}

window.addEventListener('unhandledrejection', (event) => {
  if (progress < 1) showLoadError(event.reason);
});

boot();
