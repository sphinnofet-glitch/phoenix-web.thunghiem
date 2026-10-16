// =====================================================================
// public/js/page2-services.js
// Trang 2 (#/2): vòng thẻ dịch vụ xoay trong không gian CSS 3D.
//  - kéo/vuốt/lăn chuột/phím mũi tên để xoay; hover hoặc chạm để thẻ phóng to và nghiêng theo con trỏ
//  - ghép nổi (4 mảnh bay vào ghép thành thẻ), nhập/tách (gộp thành khối rồi bung ra),
//    trượt trái/phải khi đổi nhóm, mở/đóng bảng chi tiết 3D (Esc, nút X, bấm ra ngoài)
// Hoạt động cả khi không có WebGL: vòng thẻ là CSS 3D; WebGL chỉ thêm vòng lửa phía sau.
// =====================================================================
import {
  TAU,
  bindTilt,
  clamp,
  createDetail,
  createDisposer,
  damp,
  disposeObject,
  el,
  glowTexture,
  mod,
  rand,
  shortestAngle
} from './utils.js';

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', '1', '2', '3', '4']);

function icon3d(glyph) {
  const faces = [];
  for (let i = 0; i < 6; i++) faces.push(el('span', { class: 'icon3d__face', text: glyph }));
  return el('div', { class: 'icon3d' }, faces);
}

export function createScene(ctx) {
  const { CONFIG, THREE, gsap, sm, input } = ctx;
  const P = CONFIG.servicesPage;
  const D = createDisposer();
  const group = new THREE.Group();

  const state = {
    group: 'all',
    list: [],
    cards: [],
    rot: 0,
    targetRot: 0,
    step: TAU / 3,
    R: 400,
    spread: 1,
    slideX: 0,
    merged: false,
    dragging: false,
    dragStart: 0,
    busy: false,
    activeIdx: -1,
    wheelAcc: 0,
    wheelAt: 0,
    destroyed: false
  };
  const tweens = [];
  const track = (t) => {
    tweens.push(t);
    return t;
  };

  // ---------- DOM ----------
  const ring = el('div', { class: 'carousel__ring' });
  const carousel = el(
    'div',
    { class: 'carousel', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': P.title },
    [ring]
  );

  const filters = el(
    'div',
    { class: 'filters', role: 'tablist', 'aria-label': 'Nhóm dịch vụ' },
    CONFIG.groups.map((g) =>
      el('button', {
        class: 'chip',
        type: 'button',
        role: 'tab',
        'aria-selected': g.id === 'all' ? 'true' : 'false',
        'data-group': g.id,
        text: g.label
      })
    )
  );

  const prevBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': P.prevLabel, text: '‹' });
  const nextBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': P.nextLabel, text: '›' });
  const status = el('p', { class: 'services__status', role: 'status', 'aria-live': 'polite' });
  const mergeBtn = el('button', { class: 'btn btn--ghost btn--3d', type: 'button', 'aria-pressed': 'false', text: P.mergeLabel });
  const hint = el('p', { class: 'field__hint', text: P.dragHint });
  const controls = el('div', { class: 'services__controls' }, [prevBtn, status, nextBtn, mergeBtn, hint]);

  const head = el('div', { class: 'scene__head' }, [
    el('h2', { class: 'scene__title', id: 'services-title', text: P.title }),
    el('p', { class: 'scene__lead', text: P.lead })
  ]);
  const root = el('section', { class: 'scene services', 'aria-labelledby': 'services-title' }, [head, filters, carousel, controls]);
  root.style.touchAction = 'none';

  const detail = createDetail({ gsap, host: ctx.stage, closeLabel: P.closeLabel });

  // ---------- Thẻ ----------
  function buildCard(svc, i, n) {
    const card = el(
      'div',
      {
        class: 'card',
        role: 'group',
        'aria-roledescription': 'slide',
        'aria-label': `${svc.name} (${i + 1}/${n})`,
        tabindex: '-1',
        'data-id': svc.id
      },
      [
        el('div', { class: 'card__body' }, [
          el('div', { class: 'card__glare' }),
          el('div', { class: 'card__icon', 'aria-hidden': 'true' }, [icon3d(svc.glyph)]),
          el('h3', { class: 'card__name', text: svc.name }),
          el('p', { class: 'card__summary', text: svc.summary }),
          el('div', { class: 'card__meta' }, [el('span', { text: svc.duration }), el('span', { text: svc.price })]),
          el('button', { class: 'card__more', type: 'button', text: P.detailLabel, 'aria-label': `${P.detailLabel}: ${svc.name}` })
        ])
      ]
    );
    card._svc = svc;
    card._unTilt = bindTilt(card.firstChild);
    return card;
  }

  function clearCards() {
    for (const card of state.cards) {
      if (card._unTilt) card._unTilt();
      gsap.killTweensOf(card.querySelectorAll('*'));
      card.remove();
    }
    state.cards = [];
  }

  function rebuild(groupId) {
    clearCards();
    state.group = groupId;
    state.list = CONFIG.services.filter((s) => groupId === 'all' || s.group === groupId);
    const n = state.list.length;
    state.cards = state.list.map((svc, i) => buildCard(svc, i, n));
    state.cards.forEach((card) => ring.append(card));
    state.activeIdx = -1;
    state.rot = 0;
    state.targetRot = 0;
    layout();
    updateStatus(true);
  }

  function layout() {
    const n = Math.max(1, state.list.length);
    const cardW = ring.offsetWidth || 280;
    state.step = TAU / Math.max(3, n);
    state.R = Math.max(cardW * 0.62, (cardW / 2 * 1.14) / Math.tan(Math.PI / Math.max(3, n)));
    state.cardW = cardW;
  }

  function currentIndex() {
    const n = state.list.length;
    return n === 0 ? 0 : mod(Math.round(state.targetRot / state.step), n);
  }

  function updateStatus(silent) {
    const n = state.list.length;
    const idx = currentIndex();
    status.textContent = n > 0 ? `${idx + 1} / ${n}` : '';
    state.cards.forEach((card, i) => {
      card.tabIndex = i === idx ? 0 : -1;
      card.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });
    if (!silent && n > 0) ctx.announce(`${state.list[idx].name}, ${idx + 1} / ${n}`);
  }

  // ---------- Xoay ----------
  function stepBy(delta) {
    if (state.busy || state.list.length === 0) return;
    if (state.merged) {
      setMerged(false);
      return;
    }
    const n = state.list.length;
    if (n < 3) {
      const idx = clamp(Math.round(state.targetRot / state.step) + delta, 0, n - 1);
      state.targetRot = idx * state.step;
    } else {
      state.targetRot = (Math.round(state.targetRot / state.step) + delta) * state.step;
    }
    updateStatus();
  }

  function rotateToIndex(i) {
    const n = state.list.length;
    if (n === 0) return;
    const cur = currentIndex();
    let diff = i - cur;
    if (n >= 3) {
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;
    }
    stepBy(diff);
  }

  function setMerged(merged) {
    if (state.busy || state.merged === merged) return;
    state.merged = merged;
    mergeBtn.textContent = merged ? P.splitLabel : P.mergeLabel;
    mergeBtn.setAttribute('aria-pressed', merged ? 'true' : 'false');
    const target = merged ? 0 : 1;
    if (ctx.reduced) {
      state.spread = target;
    } else {
      track(gsap.to(state, { spread: target, duration: merged ? 0.55 : 0.8, ease: merged ? 'power3.in' : 'back.out(1.25)' }));
    }
    pulseGl();
  }

  // ---------- Đổi nhóm: nhập -> trượt -> tách ----------
  function setGroup(id) {
    if (state.busy || id === state.group) return;
    const order = CONFIG.groups.map((g) => g.id);
    const dir = order.indexOf(id) >= order.indexOf(state.group) ? 1 : -1;
    for (const tab of filters.children) tab.setAttribute('aria-selected', tab.dataset.group === id ? 'true' : 'false');
    if (detail.isOpen()) detail.close();
    if (ctx.reduced) {
      rebuild(id);
      state.spread = 1;
      state.merged = false;
      return;
    }
    state.busy = true;
    const slide = Math.min(window.innerWidth * 0.8, 700);
    const tl = track(gsap.timeline({ onComplete: () => (state.busy = false) }));
    tl.to(state, { spread: 0, slideX: -dir * slide * 0.5, duration: 0.45, ease: 'power2.in' });
    tl.call(() => {
      state.merged = false;
      mergeBtn.textContent = P.mergeLabel;
      mergeBtn.setAttribute('aria-pressed', 'false');
      rebuild(id);
      state.slideX = dir * slide;
      state.spread = 0;
      assemble(true);
    });
    tl.to(state, { slideX: 0, spread: 1, duration: 0.85, ease: 'power3.out' });
    pulseGl();
  }

  // ---------- Ghép nổi: 4 mảnh bay vào ghép thành thẻ ----------
  function assemble(fast = false) {
    if (ctx.reduced) return;
    const front = state.cards
      .map((card, i) => ({ card, d: Math.abs(shortestAngle(i * state.step - state.targetRot)) }))
      .filter((o) => o.d < state.step * 1.6);
    front.forEach(({ card, d }, order) => {
      const body = card.firstChild;
      const delay = (fast ? 0.1 : 0.25) + order * 0.07 + d * 0.15;
      gsap.set(body, { opacity: 0 });
      const clips = [
        'polygon(0 0, 50% 0, 50% 50%, 0 50%)',
        'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)',
        'polygon(0 50%, 50% 50%, 50% 100%, 0 100%)',
        'polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)'
      ];
      const shards = clips.map((clip) => {
        const shard = el('div', { class: 'card__shard', 'aria-hidden': 'true' });
        Object.assign(shard.style, {
          position: 'absolute',
          inset: '0',
          pointerEvents: 'none',
          clipPath: clip,
          borderRadius: '20px',
          background: 'linear-gradient(150deg, rgba(255,138,0,0.9), rgba(120,40,200,0.85))',
          boxShadow: '0 0 24px rgba(255,138,0,0.6)'
        });
        card.append(shard);
        return shard;
      });
      const tl = track(gsap.timeline({ delay }));
      tl.fromTo(
        shards,
        {
          x: () => rand(-420, 420),
          y: () => rand(-320, 320),
          z: () => rand(-500, 260),
          rotationX: () => rand(-120, 120),
          rotationY: () => rand(-120, 120),
          rotationZ: () => rand(-90, 90),
          opacity: 0
        },
        { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, opacity: 1, duration: 0.85, ease: 'power3.out', stagger: 0.05 }
      );
      tl.to(body, { opacity: 1, duration: 0.4, ease: 'power1.out' }, '-=0.25');
      tl.to(shards, { opacity: 0, duration: 0.35, onComplete: () => shards.forEach((s) => s.remove()) }, '-=0.3');
    });
  }

  // ---------- Vẽ mỗi khung hình ----------
  function paintCards(dt) {
    const n = state.cards.length;
    if (n === 0) return;
    const R = state.R * state.spread;
    ring.style.transform = `translate3d(${state.slideX.toFixed(1)}px, 0, ${(-R).toFixed(1)}px) rotateY(${(-state.rot).toFixed(4)}rad)`;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const card = state.cards[i];
      const theta = i * state.step;
      const d = shortestAngle(theta - state.rot);
      const ad = Math.abs(d);
      if (ad < bestD) {
        bestD = ad;
        best = i;
      }
      const stack = (1 - state.spread) * -i * 3;
      const s = 1 - Math.min(1, ad / 2.2) * 0.18;
      card.style.transform = `rotateY(${theta.toFixed(4)}rad) translateZ(${(R + stack).toFixed(1)}px) scale(${s.toFixed(3)})`;
      const fade = 1 - Math.min(1, ad / (Math.PI * 0.62)) * 0.55;
      const stackFade = state.spread < 0.98 && ad > 0.05 ? 0.25 + state.spread * 0.75 : 1;
      card.style.opacity = (fade * stackFade).toFixed(3);
      card.style.pointerEvents = ad > Math.PI * 0.5 ? 'none' : 'auto';
    }
    if (best !== state.activeIdx && !state.dragging) {
      const prev = state.cards[state.activeIdx];
      if (prev) {
        prev.classList.remove('is-active');
        prev.firstChild.style.setProperty('--lift', '0px');
      }
      state.activeIdx = best;
      const cur = state.cards[best];
      cur.classList.add('is-active');
      cur.firstChild.style.setProperty('--lift', '18px');
    }
    void dt;
  }

  // ---------- Phần WebGL phía sau (tùy chọn) ----------
  let glRings = null;
  let glDust = null;
  const glState = { pulse: 0 };
  if (ctx.gl) {
    glRings = new THREE.Group();
    [2.7, 3.2, 3.7].forEach((radius, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: [0xff7a22, 0xffb627, 0xb277ff][i],
        transparent: true,
        opacity: 0.55 - i * 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 8, 120), mat);
      mesh.rotation.x = Math.PI / 2.35;
      mesh.position.y = -1.7;
      glRings.add(mesh);
    });
    group.add(glRings);

    const n = Math.round(260 * sm.quality.particles);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = 2.6 + Math.random() * 1.3;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = -1.7 + (Math.random() - 0.3) * 1.6;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    glDust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glowTexture(THREE),
        size: 0.22,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffa040
      })
    );
    group.add(glDust);
  }

  function pulseGl() {
    if (!glRings || ctx.reduced) return;
    glState.pulse = 1;
    track(gsap.to(glState, { pulse: 0, duration: 1.1, ease: 'power2.out' }));
  }

  // ---------- Chi tiết ----------
  function openDetail(card) {
    const svc = card._svc;
    if (!svc) return;
    detail.open({
      trigger: card.querySelector('.card__more') || card,
      title: svc.name,
      body: svc.detail,
      listTitle: P.itemsHeading,
      items: svc.items,
      facts: [
        { label: P.durationLabel, value: svc.duration },
        { label: P.priceLabel, value: svc.price }
      ],
      actions: [{ label: P.registerLabel, href: `#/3?service=${encodeURIComponent(svc.id)}`, primary: true }]
    });
  }

  // ---------- Sự kiện ----------
  D.listen(filters, 'click', (e) => {
    const tab = e.target.closest('[data-group]');
    if (tab) setGroup(tab.dataset.group);
  });
  D.listen(prevBtn, 'click', () => stepBy(-1));
  D.listen(nextBtn, 'click', () => stepBy(1));
  D.listen(mergeBtn, 'click', () => setMerged(!state.merged));

  D.listen(ring, 'click', (e) => {
    const card = e.target.closest('.card');
    if (!card || state.busy) return;
    if (state.merged) {
      setMerged(false);
      return;
    }
    const idx = state.cards.indexOf(card);
    if (idx === currentIndex() || e.target.closest('.card__more')) openDetail(card);
    else rotateToIndex(idx);
  });

  D.listen(ring, 'focusin', (e) => {
    const card = e.target.closest ? e.target.closest('.card') : null;
    if (card && !state.busy && !state.merged) {
      const idx = state.cards.indexOf(card);
      if (idx >= 0 && idx !== currentIndex()) rotateToIndex(idx);
    }
  });

  D.add(
    input.on('drag', (ev) => {
      if (ev.phase === 'start') {
        const inside = ev.target && ev.target.closest && ev.target.closest('.carousel');
        state.dragging = Boolean(inside) && !detail.isOpen() && !state.busy && !state.merged;
        state.dragStart = state.targetRot;
        return;
      }
      if (!state.dragging) return;
      const pxPerStep = Math.max(90, (state.cardW || 280) * 0.55);
      if (ev.phase === 'move') {
        state.targetRot = state.dragStart - (ev.totalDx / pxPerStep) * state.step;
        state.rot = damp(state.rot, state.targetRot, 30, 0.016);
      } else if (ev.phase === 'end') {
        state.dragging = false;
        const projected = state.targetRot - ev.vx * 220 * (state.step / pxPerStep);
        const n = state.list.length;
        let idx = Math.round(projected / state.step);
        if (n < 3) idx = clamp(idx, 0, n - 1);
        state.targetRot = idx * state.step;
        updateStatus();
      }
    })
  );

  const scene = {
    id: 2,
    root,
    group,
    scrollEl: null,
    swipeNav: true,
    focusEl: null,

    rig(aspect) {
      return aspect < 0.9
        ? { pos: [0, 0.5, 14], look: [0, -0.4, 0], fov: 50 }
        : { pos: [0, 0.6, 10], look: [0, -0.2, 0], fov: 50 };
    },

    resize() {
      layout();
    },

    mount(params) {
      rebuild('all');
      if (params && params.focus) {
        const i = state.list.findIndex((s) => s.id === params.focus);
        if (i >= 0) {
          state.targetRot = i * state.step;
          state.rot = state.targetRot;
          updateStatus(true);
        }
      }
    },

    setParams(params) {
      if (params && params.focus) {
        const i = state.list.findIndex((s) => s.id === params.focus);
        if (i >= 0) rotateToIndex(i);
      }
    },

    enter() {
      layout();
      assemble(false);
      if (!ctx.reduced) {
        gsap.from([...head.children], { opacity: 0, y: 24, duration: 0.8, ease: 'power2.out', stagger: 0.12 });
        gsap.from([filters, controls], { opacity: 0, y: 18, duration: 0.7, delay: 0.4, ease: 'power2.out', stagger: 0.1 });
      }
      return Promise.resolve();
    },

    update(dt, t) {
      state.rot = damp(state.rot, state.targetRot, state.dragging ? 30 : 7, dt);
      paintCards(dt);
      if (glRings) {
        group.rotation.y = state.rot * 0.5;
        const k = 1 + glState.pulse * 0.12 + (1 - state.spread) * -0.25;
        glRings.scale.set(k, k, k);
        glRings.children.forEach((m, i) => {
          m.rotation.z = t * (0.15 + i * 0.07);
        });
        if (glDust) glDust.material.opacity = 0.55 + glState.pulse * 0.4;
      }
    },

    // Lăn chuột trên vòng thẻ thì xoay; lăn ngoài vòng thẻ thì chuyển trang như bình thường.
    onWheel(ev) {
      if (detail.isOpen()) return true;
      if (!ev.target || !ev.target.closest || !ev.target.closest('.carousel')) return false;
      const now = performance.now();
      if (now - state.wheelAt > 250) state.wheelAcc = 0;
      state.wheelAt = now;
      state.wheelAcc += Math.abs(ev.dy) >= Math.abs(ev.dx) ? ev.dy : ev.dx;
      if (Math.abs(state.wheelAcc) >= 60) {
        stepBy(state.wheelAcc > 0 ? 1 : -1);
        state.wheelAcc = 0;
      }
      return true;
    },

    onKey(ev) {
      if (detail.isOpen()) {
        if (ev.key === 'Escape') {
          detail.close();
          return true;
        }
        return NAV_KEYS.has(ev.key);
      }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        const delta = ev.key === 'ArrowRight' ? 1 : -1;
        if (ev.shift) {
          const order = CONFIG.groups.map((g) => g.id);
          const next = order[clamp(order.indexOf(state.group) + delta, 0, order.length - 1)];
          setGroup(next);
        } else {
          stepBy(delta);
        }
        return true;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target && ev.target.classList && ev.target.classList.contains('card')) {
        openDetail(ev.target);
        return true;
      }
      return false;
    },

    onLeave() {
      detail.destroy();
    },

    dispose() {
      if (state.destroyed) return;
      state.destroyed = true;
      D.run();
      detail.destroy();
      tweens.forEach((t) => t.kill());
      gsap.killTweensOf([state, glState, ...head.children, filters, controls]);
      clearCards();
      disposeObject(group);
      root.remove();
    }
  };
  return scene;
}
