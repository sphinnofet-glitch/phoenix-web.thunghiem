// =====================================================================
// public/js/utils.js
// Tiện ích dùng chung: toán học, dựng DOM an toàn (không innerHTML), phát hiện thiết bị,
// dọn dẹp bộ nhớ, hiệu ứng từ tính và bảng chi tiết 3D dùng cho trang 2 và trang 4.
// Không có API nào ở đây cần thư viện ngoài. GSAP được truyền vào khi cần.
// =====================================================================

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const mod = (n, m) => ((n % m) + m) % m;

// Góc ngắn nhất từ 0 tới a (đơn vị radian), kết quả trong [-PI, PI].
export const shortestAngle = (a) => {
  let d = mod(a + Math.PI, TAU) - Math.PI;
  if (d === -Math.PI) d = Math.PI;
  return d;
};

// Bộ sinh số ngẫu nhiên có hạt giống (kết quả lặp lại được giữa các lần chạy).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Dựng DOM an toàn ----------
// Không dùng innerHTML hay thuộc tính style="..." trong markup (CSP không cho phép).
// Giá trị style được đặt qua CSSOM (node.style), được CSP cho phép.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- Môi trường ----------
const reducedQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

export const prefersReducedMotion = () => Boolean(reducedQuery && reducedQuery.matches);

export function onReducedMotionChange(fn) {
  if (!reducedQuery) return () => {};
  const handler = () => fn(reducedQuery.matches);
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', handler);
  else if (reducedQuery.addListener) reducedQuery.addListener(handler);
  return () => {
    if (reducedQuery.removeEventListener) reducedQuery.removeEventListener('change', handler);
    else if (reducedQuery.removeListener) reducedQuery.removeListener(handler);
  };
}

export function hasFinePointer() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

export function hasCoarsePointer() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

// Ba mức chất lượng. dpr tối đa 2 (1.5 và thấp hơn trên máy yếu), particles là hệ số số hạt.
export const QUALITY_TIERS = {
  high: { tier: 'high', dpr: 2, particles: 1, antialias: true },
  medium: { tier: 'medium', dpr: 1.5, particles: 0.6, antialias: true },
  low: { tier: 'low', dpr: 1.25, particles: 0.3, antialias: false }
};

export function detectTier() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(window.screen?.width || 1024, window.screen?.height || 768) < 600;
  let score = 0;
  score += memory >= 8 ? 2 : memory >= 4 ? 1 : 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  if (!hasCoarsePointer()) score += 1;
  if (small) score -= 1;
  if (prefersReducedMotion()) score -= 1;
  return score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
}

export function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
}

// Thông báo cho trình đọc màn hình (vùng #live trong index.html).
export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => {
    live.textContent = text;
  }, 40);
}

export function safeSession(key, value) {
  try {
    if (value === undefined) return window.sessionStorage.getItem(key);
    window.sessionStorage.setItem(key, value);
    return value;
  } catch {
    return null;
  }
}

// ---------- Dọn dẹp ----------
export function createDisposer() {
  const fns = [];
  return {
    add(fn) {
      fns.push(fn);
      return fn;
    },
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      fns.push(() => target.removeEventListener(type, handler, options));
    },
    run() {
      while (fns.length > 0) {
        const fn = fns.pop();
        try {
          fn();
        } catch (err) {
          console.warn('[dispose]', err);
        }
      }
    }
  };
}

// Giải phóng hình học, vật liệu, texture của cả một cây đối tượng Three.js.
export function disposeObject(root) {
  if (!root) return;
  const seen = new Set();
  const disposeMaterial = (material) => {
    if (!material || seen.has(material)) return;
    seen.add(material);
    for (const key of Object.keys(material)) {
      const value = material[key];
      if (value && value.isTexture) value.dispose();
    }
    if (material.uniforms) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform && uniform.value && uniform.value.isTexture) uniform.value.dispose();
      }
    }
    material.dispose();
  };
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
      else disposeMaterial(obj.material);
    }
    if (obj.isInstancedMesh && typeof obj.dispose === 'function') obj.dispose();
  });
  if (root.parent) root.parent.remove(root);
}

// ---------- Texture phát sáng (vẽ bằng canvas, dùng lại giữa các cảnh) ----------
const glowCache = new Map();
export function glowTexture(THREE, inner = '255,214,140', outer = '255,90,20') {
  const key = `${inner}|${outer}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${inner},1)`);
  grad.addColorStop(0.25, `rgba(${outer},0.55)`);
  grad.addColorStop(0.6, `rgba(${outer},0.14)`);
  grad.addColorStop(1, `rgba(${outer},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  glowCache.set(key, texture);
  return texture;
}

// ---------- Chữ ----------
// Tách chuỗi thành từng ký tự để làm hoạt ảnh. Trình đọc màn hình đọc nhãn aria-label của phần tử cha.
export function splitChars(node, text) {
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const chars = [];
  const words = text.split(' ');
  words.forEach((word, index) => {
    const wordEl = el('span', { class: 'word', 'aria-hidden': 'true' });
    for (const ch of Array.from(word)) {
      const charEl = el('span', { class: 'char', text: ch });
      wordEl.append(charEl);
      chars.push(charEl);
    }
    node.append(wordEl);
    if (index < words.length - 1) node.append(document.createTextNode(' '));
  });
  return chars;
}

// ---------- Hiệu ứng từ tính cho nút (chỉ thiết bị có chuột) ----------
export function magnetic(gsap, node, strength = 0.3) {
  if (!hasFinePointer() || prefersReducedMotion()) return () => {};
  const qx = gsap.quickTo(node, 'x', { duration: 0.45, ease: 'power3.out' });
  const qy = gsap.quickTo(node, 'y', { duration: 0.45, ease: 'power3.out' });
  const move = (event) => {
    const r = node.getBoundingClientRect();
    const dx = event.clientX - (r.left + r.width / 2);
    const dy = event.clientY - (r.top + r.height / 2);
    const reach = Math.max(r.width, r.height) * 0.9;
    if (Math.hypot(dx, dy) < reach) {
      qx(dx * strength);
      qy(dy * strength);
    } else {
      qx(0);
      qy(0);
    }
  };
  window.addEventListener('pointermove', move, { passive: true });
  return () => {
    window.removeEventListener('pointermove', move);
    gsap.killTweensOf(node);
    gsap.set(node, { x: 0, y: 0 });
  };
}

// Nghiêng một phần tử theo con trỏ bằng biến CSS --rx --ry --mx --my (dùng cho thẻ, khung tranh).
export function bindTilt(node, { maxX = 10, maxY = 14, lift = '28px' } = {}) {
  if (!hasFinePointer() || prefersReducedMotion()) return () => {};
  const move = (event) => {
    const r = node.getBoundingClientRect();
    const u = clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1);
    const v = clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1);
    node.style.setProperty('--ry', `${((u - 0.5) * maxY).toFixed(2)}deg`);
    node.style.setProperty('--rx', `${((0.5 - v) * maxX).toFixed(2)}deg`);
    node.style.setProperty('--mx', `${(u * 100).toFixed(1)}%`);
    node.style.setProperty('--my', `${(v * 100).toFixed(1)}%`);
    node.style.setProperty('--lift', lift);
  };
  const leave = () => {
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.style.setProperty('--lift', '0px');
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerleave', leave);
  };
}

// ---------- Bảng chi tiết 3D (dịch vụ, dự án) ----------
// open({ trigger, title, body, listTitle, items, facts:[{label,value}], actions:[{label,href,primary,onClick}] })
// Mở: bảng lật từ vị trí của thẻ bấm. Đóng: nút X, phím Esc, bấm ra ngoài; thu về vị trí cũ.
export function createDetail({ gsap, host, closeLabel = 'Đóng', onClose }) {
  let overlay = null;
  let panel = null;
  let backdrop = null;
  let trigger = null;
  let timeline = null;
  let closing = false;
  let counter = 0;

  const centerOffset = () => {
    if (!trigger || !trigger.isConnected) return { x: 0, y: 40 };
    const r = trigger.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - window.innerWidth / 2,
      y: r.top + r.height / 2 - window.innerHeight / 2
    };
  };

  function destroy() {
    if (timeline) timeline.kill();
    timeline = null;
    if (overlay) overlay.remove();
    overlay = null;
    panel = null;
    backdrop = null;
    closing = false;
  }

  function close() {
    if (!overlay || closing) return;
    closing = true;
    const target = trigger;
    const finish = () => {
      destroy();
      if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
      trigger = null;
      if (onClose) onClose();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const off = centerOffset();
    if (timeline) timeline.kill();
    timeline = gsap.timeline({ onComplete: finish });
    timeline
      .to(panel, { rotationY: 65, scale: 0.45, x: off.x, y: off.y, opacity: 0, duration: 0.5, ease: 'power3.in' }, 0)
      .to(backdrop, { opacity: 0, duration: 0.35, ease: 'power1.in' }, 0.15);
  }

  function open(options) {
    if (overlay) destroy();
    trigger = options.trigger || null;
    const titleId = `detail-title-${++counter}`;
    const closeBtn = el('button', { class: 'detail__close', type: 'button', 'aria-label': closeLabel, text: '×' });
    const parts = [closeBtn, el('h3', { class: 'detail__title', id: titleId, text: options.title })];
    if (options.body) parts.push(el('p', { class: 'detail__body', text: options.body }));
    if (options.items && options.items.length > 0) {
      if (options.listTitle) {
        parts.push(el('h4', { class: 'detail__body', text: options.listTitle, style: { marginTop: '1rem', fontWeight: '700', color: '#ffd166' } }));
      }
      parts.push(el('ul', { class: 'detail__list' }, options.items.map((text) => el('li', { text }))));
    }
    if (options.facts && options.facts.length > 0) {
      parts.push(
        el('dl', { class: 'detail__facts' }, options.facts.map((f) => el('div', {}, [el('dt', { text: f.label }), el('dd', { text: f.value })])))
      );
    }
    if (options.actions && options.actions.length > 0) {
      parts.push(
        el(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem' } },
          options.actions.map((action) => {
            const cls = `btn ${action.primary ? 'btn--primary' : 'btn--ghost'} btn--3d`;
            if (action.href) {
              return el('a', { class: cls, href: action.href, text: action.label, onClick: action.onClick });
            }
            return el('button', { class: cls, type: 'button', text: action.label, onClick: action.onClick });
          })
        )
      );
    }

    backdrop = el('div', { class: 'detail__backdrop' });
    panel = el('div', { class: 'detail__panel' }, parts);
    overlay = el('div', { class: 'detail', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [backdrop, panel]);

    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(panel.querySelectorAll('a[href], button:not([disabled])'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    host.append(overlay);
    closeBtn.focus({ preventScroll: true });

    if (prefersReducedMotion()) {
      gsap.set([backdrop, panel], { opacity: 1 });
      return;
    }
    const off = centerOffset();
    timeline = gsap.timeline();
    timeline
      .fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0)
      .fromTo(
        panel,
        { rotationY: -75, scale: 0.45, x: off.x, y: off.y, opacity: 0 },
        { rotationY: 0, scale: 1, x: 0, y: 0, opacity: 1, duration: 0.75, ease: 'power3.out' },
        0
      );
  }

  return {
    open,
    close,
    destroy,
    isOpen: () => Boolean(overlay)
  };
}
