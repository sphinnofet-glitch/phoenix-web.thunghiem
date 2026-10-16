// =====================================================================
// public/js/page4-about.js
// Trang 4 (#/4): trang kỹ nhất. Ba lớp chuyển động:
//   nền hạt dùng chung (scene-manager) / trung cảnh 3D (đường hầm vòng lửa + tinh thể, instancing) /
//   tiền cảnh nội dung HTML thật. Cuộn trang = bay xuyên đường hầm.
// Cảnh mở đầu: phượng hoàng lao xuống, hóa thành ánh lửa kết tụ thành tên đơn vị.
// Các phần nặng (cột số liệu, quả cầu công nghệ, băng chuyền) chỉ chạy khi vào khung nhìn.
// =====================================================================
import {
  TAU,
  clamp,
  createDetail,
  createDisposer,
  damp,
  disposeObject,
  el,
  glowTexture,
  magnetic,
  bindTilt,
  mod
} from './utils.js';
import { createPhoenix, createSparks, loadPhoenixModel, randomCloud, sampleTextPoints } from './phoenix.js';

const TUNNEL_LEN = 170;
const curveX = (z) => Math.sin(-z * 0.04) * 1.6;
const curveY = (z) => Math.cos(-z * 0.03) * 0.8;

export function createScene(ctx) {
  const { CONFIG, THREE, gsap, sm, input } = ctx;
  const A = CONFIG.about;
  const D = createDisposer();
  const group = new THREE.Group();
  const GL = ctx.gl;

  const state = {
    scrollY: 0,
    maxScroll: 1,
    progress: 0,
    smooth: 0,
    destroyed: false,
    tl: null,
    tech: { rx: -0.2, ry: 0, vy: 0.25, dragging: false, visible: false, radius: 120 },
    quote: { index: 0, timer: 0, hover: false },
    glowPos: new THREE.Vector3()
  };
  const tweens = [];
  const track = (t) => {
    tweens.push(t);
    return t;
  };
  const reveals = new Map();
  const parallaxEls = new Set();

  const detail = createDetail({ gsap, host: ctx.stage, closeLabel: CONFIG.servicesPage.closeLabel });

  // ---------- Hỗ trợ dựng khối ----------
  let blockCount = 0;
  function block(title, content, extraClass = '') {
    const id = `about-block-${++blockCount}`;
    const h = el('h2', { class: 'block__title', id, text: title });
    parallaxEls.add(h);
    const sec = el('section', { class: `block ${extraClass}`.trim(), 'aria-labelledby': id }, [h, ...[].concat(content)]);
    return sec;
  }

  // Đặt trạng thái ẩn ban đầu rồi đăng ký hàm hiện ra khi khối vào khung nhìn.
  function prepare(host, items, from, to, extra = {}) {
    if (ctx.reduced || items.length === 0) return;
    gsap.set(items, { opacity: 0, ...from });
    reveals.set(host, () => {
      track(gsap.to(items, { opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12, ...to, ...extra }));
    });
  }

  // ---------- 1. Cảnh mở đầu ----------
  const nameEl = el('h1', { class: 'about-hero__name', text: A.name });
  const taglineEl = el('p', { class: 'about-hero__tagline', text: A.tagline });
  const openHint = el('p', { class: 'hero__hint', text: A.openingHint });
  const hero = el('header', { class: 'about-hero' }, [nameEl, taglineEl, openHint]);

  // ---------- 2. Câu chuyện ----------
  const story = block(
    A.story.title,
    el('div', { class: 'story' }, A.story.paragraphs.map((t) => el('p', { text: t })))
  );
  prepare(story, [...story.querySelectorAll('.story p')], { y: 50, rotationX: -25 }, { y: 0, rotationX: 0, stagger: 0.18 });

  // ---------- 3. Sứ mệnh, tầm nhìn, giá trị ----------
  const pillarEls = A.pillars.items.map((p) =>
    el('article', { class: 'pillar glass' }, [el('h3', { class: 'pillar__title', text: p.title }), el('p', { class: 'pillar__text', text: p.text })])
  );
  const pillars = block(A.pillars.title, el('div', { class: 'pillars' }, pillarEls));
  prepare(pillars, pillarEls, { y: 70, z: -160, rotationY: -25 }, { y: 0, z: 0, rotationY: 0 });

  // ---------- 4. Đội ngũ: thẻ 3D lật ----------
  const memberEls = A.team.members.map((m) => {
    const initials = m.name
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((w) => Array.from(w)[0])
      .join('');
    const node = el(
      'button',
      { class: 'member', type: 'button', 'aria-pressed': 'false', 'aria-label': `${m.name}, ${m.role}. ${A.team.flipHint}` },
      [
        el('span', { class: 'member__face' }, [
          el('span', { class: 'member__avatar', text: initials, 'aria-hidden': 'true' }),
          el('span', { class: 'member__name', text: m.name }),
          el('span', { class: 'member__role', text: m.role })
        ]),
        el('span', { class: 'member__face member__face--back' }, [
          el('span', { class: 'member__name', text: m.name }),
          el('span', { class: 'member__bio', text: m.bio })
        ])
      ]
    );
    D.listen(node, 'click', () => {
      const on = node.classList.toggle('is-flipped');
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    return node;
  });
  const team = block(A.team.title, [el('p', { class: 'block__lead', text: A.team.flipHint }), el('div', { class: 'team' }, memberEls)]);
  prepare(team, memberEls, { y: 60, rotationX: -40, z: -120 }, { y: 0, rotationX: 0, z: 0 });

  // ---------- 5. Hành trình: đường hầm thời gian ----------
  const milestoneEls = A.timeline.milestones.map((m) =>
    el('article', { class: 'milestone glass' }, [
      el('span', { class: 'milestone__year', text: m.year }),
      el('h3', { class: 'milestone__title', text: m.title }),
      el('p', { class: 'milestone__text', text: m.text })
    ])
  );
  const timeline = block(A.timeline.title, el('div', { class: 'timeline' }, milestoneEls));
  milestoneEls.forEach((m, i) => {
    if (ctx.reduced) return;
    gsap.set(m, { opacity: 0, z: -400, rotationY: i % 2 ? 35 : -35, y: 40 });
    reveals.set(m, () => track(gsap.to(m, { opacity: 1, z: 0, rotationY: 0, y: 0, duration: 1.1, ease: 'power3.out' })));
  });

  // ---------- 6. Số liệu: đếm số + cột mọc lên ----------
  const statEls = A.stats.items.map((s) => {
    const value = el('span', { class: 'stat__value', 'aria-label': `${s.value}${s.suffix}`, text: `0${s.suffix}` });
    const bar = el('div', { class: 'stat__bar', 'aria-hidden': 'true' });
    bar.style.setProperty('--h', `${s.height}rem`);
    return { s, value, bar, node: el('div', { class: 'stat glass' }, [value, el('span', { class: 'stat__label', text: s.label }), bar]) };
  });
  const stats = block(A.stats.title, el('div', { class: 'stats' }, statEls.map((o) => o.node)));
  statEls.forEach((o, i) => {
    if (ctx.reduced) {
      o.value.textContent = `${o.s.value.toLocaleString('vi-VN')}${o.s.suffix}`;
      return;
    }
    gsap.set(o.node, { opacity: 0, y: 40 });
    gsap.set(o.bar, { scaleY: 0 });
    reveals.set(o.node, () => {
      const counter = { v: 0 };
      const tl = track(gsap.timeline({ delay: i * 0.12 }));
      tl.to(o.node, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0);
      tl.to(o.bar, { scaleY: 1, duration: 1.2, ease: 'elastic.out(1, 0.7)' }, 0.1);
      tl.to(
        counter,
        {
          v: o.s.value,
          duration: 1.6,
          ease: 'power2.out',
          onUpdate: () => {
            o.value.textContent = `${Math.round(counter.v).toLocaleString('vi-VN')}${o.s.suffix}`;
          }
        },
        0.1
      );
    });
  });

  // ---------- 7. Quy trình: bậc thang ----------
  const stepEls = A.process.steps.map((s, i) => {
    const node = el('article', { class: 'step glass' }, [
      el('span', { class: 'step__no', text: String(i + 1) }),
      el('div', {}, [el('h3', { class: 'step__title', text: s.title }), el('p', { class: 'step__text', text: s.text })])
    ]);
    node.style.setProperty('--i', String(i));
    return node;
  });
  const process = block(A.process.title, el('div', { class: 'process' }, stepEls));
  stepEls.forEach((n, i) => {
    if (ctx.reduced) return;
    gsap.set(n, { opacity: 0, rotationX: -60, y: 50, transformOrigin: '50% 100%' });
    reveals.set(n, () => track(gsap.to(n, { opacity: 1, rotationX: 0, y: 0, duration: 0.9, delay: (i % 3) * 0.05, ease: 'back.out(1.3)' })));
  });

  // ---------- 8. Công nghệ: quả cầu xoay, kéo được ----------
  const techItems = A.tech.items.map((t) => el('span', { class: 'tech__item', 'aria-hidden': 'true', text: t }));
  const sphereInner = el('div', { class: 'tech__sphere-inner' }, techItems);
  const sphere = el('div', { class: 'tech__sphere', 'data-cursor': '' }, [sphereInner]);
  const techList = el('ul', { class: 'tech__list', 'aria-label': A.tech.title }, A.tech.items.map((t) => el('li', { text: t })));
  const tech = block(A.tech.title, el('div', { class: 'tech' }, [el('p', { class: 'block__lead', text: A.tech.lead }), sphere, techList]));
  const fib = techItems.map((_, i) => {
    const n = techItems.length;
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  });

  function paintSphere(dt) {
    const T = state.tech;
    if (!T.dragging) T.vy = damp(T.vy, ctx.reduced ? 0 : 0.25, 2.5, dt);
    T.ry += T.vy * dt;
    const cy = Math.cos(T.ry);
    const sy = Math.sin(T.ry);
    const cx = Math.cos(T.rx);
    const sx = Math.sin(T.rx);
    for (let i = 0; i < techItems.length; i++) {
      const [x, y, z] = fib[i];
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const depth = (z2 + 1) / 2;
      const node = techItems[i];
      node.style.transform = `translate(-50%, -50%) translate(${(x1 * T.radius).toFixed(1)}px, ${(y2 * T.radius * 0.9).toFixed(1)}px) scale(${(0.65 + 0.55 * depth).toFixed(3)})`;
      node.style.opacity = (0.25 + 0.75 * depth).toFixed(3);
      node.style.zIndex = String(Math.round(depth * 100));
    }
  }

  // ---------- 9. Dự án: khung tranh 3D ----------
  const frameEls = A.projects.items.map((p) => {
    const art = el('span', { class: 'frame__art', 'aria-hidden': 'true' });
    art.style.setProperty('--a', p.colorA);
    art.style.setProperty('--b', p.colorB);
    const node = el(
      'button',
      { class: 'frame', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': `${A.projects.openLabel}: ${p.title}` },
      [art, el('span', { class: 'frame__title', text: p.title }), el('span', { class: 'frame__tag', text: p.tag })]
    );
    D.add(bindTilt(node, { maxX: 8, maxY: 12, lift: '0px' }));
    D.listen(node, 'click', () =>
      detail.open({
        trigger: node,
        title: p.title,
        body: p.detail,
        facts: [{ label: 'Loại dự án', value: p.tag }],
        actions: [{ label: A.contact.ctaLabel, href: '#/3', primary: true }]
      })
    );
    return node;
  });
  const projects = block(A.projects.title, el('div', { class: 'frames' }, frameEls));
  prepare(projects, frameEls, { y: 80, rotationX: -35, z: -200 }, { y: 0, rotationX: 0, z: 0 });

  // ---------- 10. Lời chứng thực: băng chuyền 3D ----------
  const quoteEls = A.testimonials.items.map((q) =>
    el('figure', { class: 'quote glass' }, [el('blockquote', { class: 'quote__text', text: q.quote }), el('figcaption', { class: 'quote__who', text: q.who })])
  );
  const quotesBox = el('div', { class: 'quotes', role: 'group', 'aria-roledescription': 'carousel', 'aria-label': A.testimonials.title }, quoteEls);
  const qPrev = el('button', { class: 'icon-btn', type: 'button', 'aria-label': A.testimonials.prevLabel, text: '‹' });
  const qNext = el('button', { class: 'icon-btn', type: 'button', 'aria-label': A.testimonials.nextLabel, text: '›' });
  const testimonials = block(A.testimonials.title, [quotesBox, el('div', { class: 'quotes__nav' }, [qPrev, qNext])]);

  function layoutQuotes(animate = true) {
    const n = quoteEls.length;
    quoteEls.forEach((node, i) => {
      let d = i - state.quote.index;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const vars = {
        xPercent: d * 55,
        z: -Math.abs(d) * 220,
        rotationY: -d * 38,
        opacity: Math.abs(d) > 1 ? 0 : 1 - Math.abs(d) * 0.6,
        transformPerspective: 1200,
        duration: animate && !ctx.reduced ? 0.8 : 0,
        ease: 'power3.out',
        overwrite: 'auto'
      };
      gsap.to(node, vars);
      node.style.pointerEvents = d === 0 ? 'auto' : 'none';
      node.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
    });
  }
  function stepQuote(delta) {
    state.quote.index = mod(state.quote.index + delta, quoteEls.length);
    layoutQuotes(true);
  }
  D.listen(qPrev, 'click', () => stepQuote(-1));
  D.listen(qNext, 'click', () => stepQuote(1));
  D.listen(quotesBox, 'pointerenter', () => (state.quote.hover = true));
  D.listen(quotesBox, 'pointerleave', () => (state.quote.hover = false));
  D.listen(quotesBox, 'focusin', () => (state.quote.hover = true));
  D.listen(quotesBox, 'focusout', () => (state.quote.hover = false));

  // ---------- 11. Câu hỏi thường gặp: rương mở đóng ----------
  const faqEls = A.faq.items.map((f, i) => {
    const qId = `faq-q-${i}`;
    const aId = `faq-a-${i}`;
    const btn = el('button', { class: 'faq__q', type: 'button', id: qId, 'aria-expanded': 'false', 'aria-controls': aId, text: f.q });
    const panel = el('div', { class: 'faq__a', id: aId, role: 'region', 'aria-labelledby': qId }, [el('div', { class: 'faq__a-inner' }, [el('p', { text: f.a })])]);
    const item = el('div', { class: 'faq__item glass' }, [el('h3', { style: { margin: '0', fontSize: 'inherit' } }, [btn]), panel]);
    D.listen(btn, 'click', () => {
      const open = !item.classList.contains('is-open');
      faqEls.forEach((o) => {
        if (o.item !== item && o.item.classList.contains('is-open')) {
          o.item.classList.remove('is-open');
          o.btn.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !ctx.reduced) track(gsap.fromTo(item, { rotationX: -7, transformPerspective: 900 }, { rotationX: 0, duration: 0.5, ease: 'back.out(2)' }));
    });
    return { item, btn };
  });
  const faq = block(A.faq.title, el('div', { class: 'faq' }, faqEls.map((o) => o.item)));
  prepare(faq, faqEls.map((o) => o.item), { x: -60, rotationY: -15 }, { x: 0, rotationY: 0, stagger: 0.09 });

  // ---------- 12. Cam kết ----------
  const promiseEls = A.promises.items.map((p) =>
    el('article', { class: 'promise glass' }, [el('h3', { class: 'promise__title', text: p.title }), el('p', { class: 'promise__text', text: p.text })])
  );
  const promises = block(A.promises.title, el('div', { class: 'promise-list' }, promiseEls));
  prepare(promises, promiseEls, { y: 60, scale: 0.9, rotationX: -20 }, { y: 0, scale: 1, rotationX: 0 });

  // ---------- 13. Liên hệ ----------
  const C = A.contact;
  const rows = C.rows.map((r) =>
    el('div', { class: 'contact-card__row' }, [
      el('dt', { text: r.label }),
      el('dd', {}, [r.href ? el('a', { href: r.href, text: r.value }) : r.value])
    ])
  );
  const socials = C.social.map((s) => {
    const a = el('a', { class: 'chip', href: s.href, target: '_blank', rel: 'noopener noreferrer', text: s.label });
    Object.assign(a.style, { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' });
    return a;
  });
  const cta = el('a', { class: 'btn btn--primary btn--3d', href: '#/3', text: C.ctaLabel });
  D.add(magnetic(gsap, cta, 0.3));
  const contactCard = el('div', { class: 'contact-card glass' }, [
    el('dl', { class: 'contact-card__rows' }, rows),
    el('div', { class: 'contact-card__social', role: 'list' }, socials),
    el('div', {}, [cta])
  ]);
  const contact = block(C.title, contactCard);
  prepare(contact, [contactCard], { y: 80, rotationX: -30, z: -150 }, { y: 0, rotationX: 0, z: 0 });

  // ---------- 14. Chân trang ----------
  const F = A.footer;
  const footer = el('footer', { class: 'footer' }, [
    el('p', { text: `© ${new Date().getFullYear()} ${F.copyright}` }),
    el('p', { class: 'footer__privacy', text: F.privacy }),
    el('nav', { class: 'footer__links', 'aria-label': 'Liên kết nhanh' }, F.links.map((l) => el('a', { href: l.href, text: l.label })))
  ]);

  const root = el('section', { class: 'scene scene--scroll about', 'aria-label': A.name, tabindex: '-1' }, [
    hero,
    story,
    pillars,
    team,
    timeline,
    stats,
    process,
    tech,
    projects,
    testimonials,
    faq,
    promises,
    contact,
    footer
  ]);

  // ---------- Cuộn, hiện dần khi vào khung nhìn ----------
  D.listen(root, 'scroll', () => (state.scrollY = root.scrollTop), { passive: true });
  const measure = () => {
    state.maxScroll = Math.max(1, root.scrollHeight - root.clientHeight);
    const w = Math.min(sphere.clientWidth || 300, (sphere.clientHeight || 300) * 1.4);
    state.tech.radius = Math.max(70, w * 0.38);
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(measure);
    ro.observe(root);
    for (const child of root.children) ro.observe(child);
    D.add(() => ro.disconnect());
  }

  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === sphere) state.tech.visible = entry.isIntersecting;
          if (entry.target === quotesBox) state.quote.visible = entry.isIntersecting;
          if (entry.isIntersecting && reveals.has(entry.target)) {
            reveals.get(entry.target)();
            reveals.delete(entry.target);
            io.unobserve(entry.target);
          }
        }
      },
      { root, threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    for (const target of reveals.keys()) io.observe(target);
    io.observe(sphere);
    io.observe(quotesBox);
    D.add(() => io.disconnect());
  } else {
    // Trình duyệt cũ: hiện tất cả ngay.
    state.tech.visible = true;
    reveals.forEach((fn) => fn());
    reveals.clear();
  }

  // Kéo quả cầu công nghệ
  D.add(
    input.on('drag', (ev) => {
      const T = state.tech;
      if (ev.phase === 'start') {
        T.dragging = Boolean(ev.target && ev.target.closest && ev.target.closest('.tech__sphere'));
        if (T.dragging) T.vy = 0;
        return;
      }
      if (!T.dragging) return;
      if (ev.phase === 'move') {
        T.ry += ev.dx * 0.01;
        T.rx = clamp(T.rx + ev.dy * 0.01, -1.2, 1.2);
      } else if (ev.phase === 'end') {
        T.dragging = false;
        T.vy = clamp(ev.vx * 10, -6, 6);
      }
    })
  );

  // ---------- 3D: đường hầm vòng lửa, tinh thể, ánh sáng theo con trỏ ----------
  let rings = null;
  let crystals = null;
  let pointerGlow = null;
  let phoenix = null;
  let sparks = null;
  const dummy = new THREE.Object3D();
  const ringData = [];
  const crystalData = [];

  if (GL) {
    sm.scene.fog = new THREE.Fog(0x08040f, 10, 62);

    const RINGS = Math.round(56 * (0.5 + sm.quality.particles * 0.5));
    rings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.018, 6, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      RINGS
    );
    const cA = new THREE.Color(0xff7a22);
    const cB = new THREE.Color(0x9d5bff);
    for (let i = 0; i < RINGS; i++) {
      const z = -8 - i * (TUNNEL_LEN / RINGS);
      ringData.push({ z, s: 2.4 + Math.sin(i * 0.7) * 0.5, r: i * 0.35, dir: i % 2 ? 1 : -1 });
      rings.setColorAt(i, cA.clone().lerp(cB, i / RINGS));
    }
    rings.instanceColor.needsUpdate = true;
    rings.frustumCulled = false;
    group.add(rings);

    const CRYSTALS = Math.round(64 * (0.4 + sm.quality.particles * 0.6));
    crystals = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      CRYSTALS
    );
    const cC = new THREE.Color(0xffc247);
    const cD = new THREE.Color(0xff5a1f);
    for (let i = 0; i < CRYSTALS; i++) {
      const z = -10 - Math.random() * TUNNEL_LEN;
      const a = Math.random() * TAU;
      const r = 3 + Math.random() * 4;
      crystalData.push({ z, a, r, s: 0.6 + Math.random() * 1.6, spin: 0.2 + Math.random() * 0.8 });
      crystals.setColorAt(i, cC.clone().lerp(cD, Math.random()));
    }
    crystals.instanceColor.needsUpdate = true;
    crystals.frustumCulled = false;
    group.add(crystals);

    pointerGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(THREE), color: 0xffa050, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    pointerGlow.scale.set(6, 6, 1);
    group.add(pointerGlow);

    phoenix = createPhoenix({ THREE, shared: sm.shared, quality: sm.quality, scale: 0.6 });
    phoenix.bird.visible = false;
    group.add(phoenix.root);
    loadPhoenixModel(phoenix);
  }

  function updateTunnel(t) {
    for (let i = 0; i < ringData.length; i++) {
      const d = ringData[i];
      dummy.position.set(curveX(d.z), curveY(d.z), d.z);
      dummy.rotation.set(0, 0, d.r + t * 0.15 * d.dir);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
    }
    rings.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < crystalData.length; i++) {
      const d = crystalData[i];
      dummy.position.set(curveX(d.z) + Math.cos(d.a) * d.r, curveY(d.z) + Math.sin(d.a) * d.r, d.z);
      dummy.rotation.set(t * d.spin, t * d.spin * 0.7, 0);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      crystals.setMatrixAt(i, dummy.matrix);
    }
    crystals.instanceMatrix.needsUpdate = true;
  }

  // ---------- Cảnh mở đầu điện ảnh ----------
  function revealHeroInstant() {
    gsap.set(nameEl, { opacity: 1, scale: 1, filter: 'none' });
    gsap.set([taglineEl, openHint], { opacity: 1, y: 0 });
  }

  function playOpening(resolve) {
    const aspect = sm.width / sm.height;
    const rig = scene.rig(aspect);
    const camZ = rig.pos[2];
    const visH = 2 * Math.tan((rig.fov * Math.PI) / 360) * camZ;
    const visW = visH * aspect;
    const rect = nameEl.getBoundingClientRect();
    const worldW = clamp((rect.width / Math.max(1, window.innerWidth)) * visW, 1.5, visW * 0.95);
    const cx = ((rect.left + rect.width / 2) / window.innerWidth - 0.5) * visW;
    const cy = -((rect.top + rect.height / 2) / window.innerHeight - 0.5) * visH;
    const cs = getComputedStyle(nameEl);
    const sampled = sampleTextPoints(A.name, { fontFamily: cs.fontFamily, fontWeight: 800, count: Math.round(900 * sm.quality.particles) });
    const n = Math.max(120, sampled.points.length / 2);
    const targets = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (sampled.points.length > 0) {
        targets[i * 3] = cx + sampled.points[i * 2] * worldW;
        targets[i * 3 + 1] = cy + sampled.points[i * 2 + 1] * worldW;
      } else {
        targets[i * 3] = cx + (Math.random() - 0.5) * worldW;
        targets[i * 3 + 1] = cy + (Math.random() - 0.5) * worldW * 0.18;
      }
      targets[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }
    const diveEnd = new THREE.Vector3(0.3, 0.1, 3.0);
    sparks = createSparks({ THREE, shared: sm.shared, starts: randomCloud(n, [diveEnd.x, diveEnd.y, diveEnd.z], 3), targets, size: 0.11 });
    sparks.uniforms.uAlpha.value = 0;
    group.add(sparks.points);

    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-7, 6, -16),
      new THREE.Vector3(-3, 4.2, -9),
      new THREE.Vector3(2.5, 2.4, -3),
      new THREE.Vector3(-1.2, 0.8, 1.5),
      diveEnd
    ]);
    phoenix.setPath(path, { speed: 0, loop: false, u: 0 });
    phoenix.bird.visible = true;
    gsap.set([nameEl], { opacity: 0, scale: 1.25, filter: 'blur(12px)' });
    gsap.set([taglineEl, openHint], { opacity: 0, y: 24 });

    const tl = gsap.timeline({ onComplete: resolve });
    state.tl = tl;
    const fly = phoenix.state;
    tl.to(fly, { u: 1, duration: 2.5, ease: 'power2.in' }, 0.2);
    tl.call(() => {
      phoenix.burst(60);
      phoenix.glow.material.opacity = 1;
    }, null, 2.65);
    tl.to(phoenix.bird.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.35, ease: 'power2.in' }, 2.7);
    tl.set(sparks.uniforms.uAlpha, { value: 1 }, 2.7);
    tl.to(sparks.uniforms.uProgress, { value: 1, duration: 1.7, ease: 'power2.inOut' }, 2.7);
    tl.to(nameEl, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.0, ease: 'power3.out', onComplete: () => { nameEl.style.filter = ''; } }, 3.8);
    tl.call(() => { phoenix.bird.visible = false; }, null, 3.1);
    tl.to(sparks.uniforms.uAlpha, { value: 0, duration: 0.9, ease: 'power1.in' }, 4.0);
    tl.to(taglineEl, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 4.5);
    tl.to(openHint, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 4.9);
  }

  // ---------- Vòng đời ----------
  const scene = {
    id: 4,
    root,
    group,
    scrollEl: root,
    swipeNav: false,
    focusEl: root,

    rig(aspect) {
      return aspect < 0.9
        ? { pos: [0, 0, 13.5], look: [0, 0, 0], fov: 50 }
        : { pos: [0, 0, 9], look: [0, 0, 0], fov: 50 };
    },

    resize() {
      measure();
    },

    mount() {
      measure();
      layoutQuotes(false);
      paintSphere(0);
    },

    enter() {
      return new Promise((resolve) => {
        window.setTimeout(measure, 300);
        if (ctx.reduced || !GL) {
          revealHeroInstant();
          resolve();
          return;
        }
        // Chờ bố cục ổn định rồi mới đo vị trí tên để hạt kết tụ đúng chỗ.
        requestAnimationFrame(() => {
          if (state.destroyed) {
            resolve();
            return;
          }
          playOpening(resolve);
        });
      });
    },

    update(dt, t) {
      // Tiến độ cuộn -> vị trí trong đường hầm
      state.progress = clamp(state.scrollY / state.maxScroll, 0, 1);
      state.smooth = damp(state.smooth, state.progress, 5, dt);
      const p = state.smooth;
      if (GL) {
        const z = -p * (TUNNEL_LEN - 25);
        sm.camOffset.set(curveX(z), curveY(z), z);
        sm.camRoll = Math.sin(p * 8) * 0.05;
        updateTunnel(t);
        // Ánh sáng động bám theo con trỏ ở lớp tiền cảnh
        const ptr = input.pointer;
        state.glowPos.set(ptr.sx * 4.5, ptr.sy * 2.8, -7).applyMatrix4(sm.camera.matrixWorld);
        pointerGlow.position.copy(state.glowPos);
        pointerGlow.material.opacity = 0.22 + Math.abs(ptr.sx) * 0.08 + Math.abs(ptr.sy) * 0.06;
        if (phoenix && phoenix.bird.visible) phoenix.update(dt);
        sm.setFade(1);
      }
      if (state.tech.visible) paintSphere(dt);

      // Thị sai tiêu đề theo vị trí trên màn hình (chỉ vài phần tử)
      if (!ctx.reduced) {
        const vh = window.innerHeight;
        for (const h of parallaxEls) {
          const r = h.getBoundingClientRect();
          if (r.bottom < -80 || r.top > vh + 80) continue;
          h.style.translate = `0 ${(((r.top + r.height / 2) - vh / 2) * 0.06).toFixed(1)}px`;
        }
      }

      // Băng chuyền lời chứng thực tự chạy khi đang thấy và không bị tạm dừng
      if (state.quote.visible && !state.quote.hover && !ctx.reduced) {
        state.quote.timer += dt;
        if (state.quote.timer > 7) {
          state.quote.timer = 0;
          stepQuote(1);
        }
      }
    },

    onKey(ev) {
      if (detail.isOpen()) {
        if (ev.key === 'Escape') {
          detail.close();
          return true;
        }
        return ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', '1', '2', '3', '4'].includes(ev.key);
      }
      return false;
    },

    onWheel(ev) {
      return detail.isOpen() && !(ev.target.closest && ev.target.closest('.detail__panel'));
    },

    onLeave() {
      detail.destroy();
    },

    dispose() {
      if (state.destroyed) return;
      state.destroyed = true;
      D.run();
      detail.destroy();
      if (state.tl) state.tl.kill();
      tweens.forEach((tw) => tw.kill());
      gsap.killTweensOf(
        [
          nameEl,
          taglineEl,
          openHint,
          ...quoteEls,
          ...stepEls,
          ...milestoneEls,
          ...pillarEls,
          ...memberEls,
          ...frameEls,
          ...faqEls.map((o) => o.item),
          ...statEls.flatMap((o) => [o.node, o.bar]),
          contactCard,
          cta,
          ...story.querySelectorAll('.story p')
        ].filter(Boolean)
      );
      if (sparks) gsap.killTweensOf([sparks.uniforms.uProgress, sparks.uniforms.uAlpha]);
      if (phoenix) {
        gsap.killTweensOf([phoenix.state, phoenix.bird.scale]);
        phoenix.dispose();
      }
      if (GL) {
        sm.scene.fog = null;
        sm.camOffset.set(0, 0, 0);
        sm.camRoll = 0;
      }
      reveals.clear();
      parallaxEls.clear();
      disposeObject(group);
      root.remove();
    }
  };
  return scene;
}
