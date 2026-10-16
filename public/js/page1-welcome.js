// =====================================================================
// public/js/page1-welcome.js
// Trang 1 (#/1): phượng hoàng bay lượn trên nền trời đêm.
// Timeline: màn đen -> tia lửa tụ lại -> phượng hoàng xuất hiện -> tiêu đề hiện từng ký tự (chiều sâu 3D)
// -> khẩu hiệu -> nút kêu gọi -> gợi ý cuộn.
// =====================================================================
import { createDisposer, damp, disposeObject, el, magnetic, splitChars } from './utils.js';
import { createPhoenix, createSparks, loadPhoenixModel, randomCloud } from './phoenix.js';

export function createScene(ctx) {
  const { CONFIG, THREE, gsap, sm, input } = ctx;
  const C = CONFIG.hero;
  const D = createDisposer();
  const group = new THREE.Group();
  const state = { boost: 0, tl: null, destroyed: false, aspect: 1 };

  // ---------- DOM ----------
  const title = el('h1', { class: 'hero__title', id: 'hero-title' });
  const chars = splitChars(title, C.title);
  const tagline = el('p', { class: 'hero__tagline', text: C.tagline });
  const ctaPrimary = el('a', { class: 'btn btn--primary btn--3d', href: '#/2', text: C.ctaLabel });
  const ctaSecondary = el('a', { class: 'btn btn--ghost btn--3d', href: '#/3', text: C.ctaSecondaryLabel });
  const actions = el('div', { class: 'hero__actions' }, [ctaPrimary, ctaSecondary]);
  const hint = el('p', { class: 'hero__hint', text: C.hint });
  const copy = el('div', { class: 'hero__copy' }, [title, tagline, actions, hint]);
  const root = el('section', { class: 'scene hero', 'aria-labelledby': 'hero-title' }, [copy]);
  root.style.touchAction = 'none';
  D.add(magnetic(gsap, ctaPrimary, 0.25));
  D.add(magnetic(gsap, ctaSecondary, 0.2));

  // ---------- 3D ----------
  let phoenix = null;
  let sparks = null;
  let curve = null;
  const GL = ctx.gl;

  function buildPath(aspect) {
    const portrait = aspect < 0.9;
    const sx = portrait ? 0.42 : 1;
    const dy = portrait ? 1.4 : 0.6;
    const pts = [
      [-4.2, 1.6, -1],
      [-2.0, 2.6, 1.5],
      [1.0, 1.4, 2.5],
      [4.0, 2.2, 0.5],
      [3.2, 0.8, -2.5],
      [0.5, 2.0, -3.5],
      [-2.8, 0.6, -1.8]
    ].map(([x, y, z]) => new THREE.Vector3(x * sx, y + dy, z));
    return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  }

  if (GL) {
    phoenix = createPhoenix({ THREE, shared: sm.shared, quality: sm.quality, scale: 0.6 });
    group.add(phoenix.root);
    phoenix.bird.visible = false;
    curve = buildPath(sm.width / sm.height);
    phoenix.setPath(curve, { speed: 0.045, loop: true, u: 0 });
    loadPhoenixModel(phoenix);

    const n = Math.round(320 * sm.quality.particles);
    const targets = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2;
      targets[i * 3] = Math.cos(a) * r * 1.4;
      targets[i * 3 + 1] = 2.0 + Math.sin(a) * r;
      targets[i * 3 + 2] = Math.random() * 0.6;
    }
    sparks = createSparks({ THREE, shared: sm.shared, starts: randomCloud(n, [0, 1.5, 0], 11), targets, size: 0.16 });
    group.add(sparks.points);
  }

  // ---------- Tương tác ----------
  D.add(
    input.on('drag', (ev) => {
      if (!phoenix || !ev.target || !root.contains(ev.target)) return;
      if (ev.phase === 'move') state.boost = Math.min(1.2, state.boost + Math.abs(ev.dx) * 0.003);
    })
  );
  D.add(
    input.on('tap', (ev) => {
      if (!phoenix || !ev.target || !root.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('a, button')) return;
      phoenix.burst(26);
      state.boost = 1;
    })
  );

  // ---------- Vòng đời cảnh ----------
  const scene = {
    id: 1,
    root,
    group,
    scrollEl: null,
    swipeNav: true,
    focusEl: null,

    rig(aspect) {
      return aspect < 0.9
        ? { pos: [0, 0.4, 13.5], look: [0, 1.1, 0], fov: 50 }
        : { pos: [0, 0.2, 9], look: [0, 0.6, 0], fov: 50 };
    },

    resize(w, h) {
      state.aspect = w / h;
      if (!phoenix) return;
      const u0 = phoenix.state.u;
      curve = buildPath(state.aspect);
      phoenix.setPath(curve, { speed: 0.045, loop: true, u: u0 });
    },

    mount() {},

    enter() {
      return new Promise((resolve) => {
        const reduced = ctx.reduced;
        if (reduced || !GL) {
          gsap.set([tagline, actions, hint], { opacity: 1, y: 0 });
          gsap.set(chars, { opacity: 1 });
          if (phoenix) phoenix.bird.visible = true;
          if (sparks) sparks.uniforms.uAlpha.value = 0;
          sm.setFade(1);
          resolve();
          return;
        }
        gsap.set(chars, { opacity: 0, rotationX: -90, z: -220, y: 40 });
        gsap.set([tagline, actions, hint], { opacity: 0, y: 24 });
        sm.setFade(0);
        const fade = { v: 0 };
        const tl = gsap.timeline({ onComplete: resolve });
        state.tl = tl;
        tl.to(fade, { v: 1, duration: 1.3, ease: 'power1.inOut', onUpdate: () => sm.setFade(fade.v) }, 0);
        tl.to(sparks.uniforms.uProgress, { value: 1, duration: 1.6, ease: 'power2.inOut' }, 0.3);
        tl.call(() => {
          phoenix.bird.visible = true;
          phoenix.burst(40);
        }, null, 1.7);
        tl.fromTo(phoenix.bird.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 0.6, y: 0.6, z: 0.6, duration: 1.1, ease: 'back.out(1.6)' }, 1.7);
        tl.to(sparks.uniforms.uAlpha, { value: 0, duration: 0.7, ease: 'power1.out' }, 1.9);
        tl.to(
          chars,
          { opacity: 1, rotationX: 0, z: 0, y: 0, duration: 0.9, ease: 'back.out(1.4)', stagger: 0.035 },
          1.9
        );
        tl.to(tagline, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 3.1);
        tl.to(actions, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 3.5);
        tl.to(hint, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 3.9);
      });
    },

    update(dt) {
      if (!phoenix) return;
      state.boost = damp(state.boost, 0, 1.6, dt);
      phoenix.setBoost(state.boost);
      const p = input.pointer;
      phoenix.setOffset(p.sx * 1.4, p.sy * 0.9, 0);
      phoenix.update(dt);
    },

    onKey() {
      return false;
    },

    onLeave() {
      if (state.tl) state.tl.kill();
    },

    dispose() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.tl) state.tl.kill();
      D.run();
      gsap.killTweensOf([chars, tagline, actions, hint, ctaPrimary, ctaSecondary]);
      if (sparks) gsap.killTweensOf([sparks.uniforms.uProgress, sparks.uniforms.uAlpha]);
      if (phoenix) {
        gsap.killTweensOf(phoenix.bird.scale);
        phoenix.dispose();
      }
      sm.setFade(1);
      disposeObject(group);
      root.remove();
    }
  };
  return scene;
}
