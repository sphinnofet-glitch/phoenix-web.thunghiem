// =====================================================================
// public/js/input.js
// Chuẩn hóa mọi đầu vào về một bộ sự kiện duy nhất:
//   'wheel' {dx, dy, target}            'key'   {key, code, target, shift, originalEvent}
//   'drag'  {phase, x, y, dx, dy, totalDx, totalDy, vx, vy, target, pointerType}
//   'swipe' {dir, target}               'tap'   {x, y, target}
//   'move'  {x, y, nx, ny, pointerType}
// Handler trả về true nghĩa là "đã xử lý": wheel và key sẽ bị preventDefault.
// Cũng quản lý: con trỏ tùy chỉnh (chỉ có chuột), thị sai theo chuột, con quay (gyroscope).
// =====================================================================
import { clamp, damp, hasCoarsePointer, hasFinePointer, prefersReducedMotion } from './utils.js';

const DRAG_THRESHOLD = 6; // px
const TAP_MAX_MS = 450;
const SWIPE_MIN_DIST = 56; // px
const HOVER_SELECTOR = 'a, button, [role="button"], [role="tab"], input, select, textarea, label, .card, .frame, .member, [data-cursor]';

export class Input {
  constructor(cursorEl = null) {
    this.cursorEl = cursorEl;
    this.ringEl = cursorEl ? cursorEl.querySelector('.cursor__ring') : null;
    this.dotEl = cursorEl ? cursorEl.querySelector('.cursor__dot') : null;
    this.listeners = new Map();
    this.cleanups = [];
    this.hasMouse = false;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0, cx: -100, cy: -100, rx: -100, ry: -100, down: false, type: 'mouse' };
    this.tilt = { x: 0, y: 0, sx: 0, sy: 0 };
    this.gyroActive = false;
    this.drag = null;
    this.suppressClickUntil = 0;
    this.started = false;
  }

  // ---------- Bộ phát sự kiện ----------
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return false;
    let consumed = false;
    for (const fn of Array.from(set)) {
      try {
        if (fn(payload) === true) consumed = true;
      } catch (err) {
        console.error(`[input:${type}]`, err);
      }
    }
    return consumed;
  }

  // ---------- Khởi động / dừng ----------
  start() {
    if (this.started) return;
    this.started = true;
    const add = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    add(window, 'pointermove', (e) => this.onPointerMove(e), { passive: true });
    add(window, 'pointerdown', (e) => this.onPointerDown(e), { passive: true });
    add(window, 'pointerup', (e) => this.onPointerUp(e), { passive: true });
    add(window, 'pointercancel', (e) => this.onPointerUp(e, true), { passive: true });
    add(window, 'blur', () => this.onPointerUp(null, true));
    add(window, 'click', (e) => this.onClickCapture(e), { capture: true });
    add(window, 'wheel', (e) => this.onWheel(e), { passive: false });
    add(window, 'keydown', (e) => this.onKey(e));
    add(document, 'pointerover', (e) => this.onPointerOver(e), { passive: true });
    add(document.documentElement, 'mouseleave', () => this.setCursorVisible(false));
    add(document.documentElement, 'mouseenter', () => this.setCursorVisible(this.hasMouse));

    // Android và các thiết bị không cần xin quyền: bật ngay nếu là cảm ứng.
    if (hasCoarsePointer() && !this.needsGyroPermission() && 'DeviceOrientationEvent' in window && !prefersReducedMotion()) {
      this.bindGyro();
    }
  }

  stop() {
    while (this.cleanups.length > 0) this.cleanups.pop()();
    this.started = false;
  }

  // ---------- Con trỏ ----------
  onPointerMove(e) {
    const p = this.pointer;
    p.cx = e.clientX;
    p.cy = e.clientY;
    p.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    p.y = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    p.type = e.pointerType;
    if (e.pointerType === 'mouse' && !this.hasMouse && hasFinePointer()) {
      this.hasMouse = true;
      p.rx = e.clientX;
      p.ry = e.clientY;
      document.documentElement.classList.add('has-mouse', 'cursor-on');
    }
    if (this.drag && this.drag.id === e.pointerId) this.handleDragMove(e);
    this.emit('move', { x: e.clientX, y: e.clientY, nx: p.x, ny: p.y, pointerType: e.pointerType });
  }

  onPointerOver(e) {
    if (!this.hasMouse || !this.cursorEl) return;
    const hit = e.target && e.target.closest ? e.target.closest(HOVER_SELECTOR) : null;
    this.cursorEl.classList.toggle('is-hover', Boolean(hit));
  }

  setCursorVisible(visible) {
    if (this.cursorEl) this.cursorEl.style.opacity = visible ? '1' : '0';
  }

  onPointerDown(e) {
    this.pointer.down = true;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t0: performance.now(),
      lastT: performance.now(),
      vx: 0,
      vy: 0,
      started: false,
      target: e.target,
      pointerType: e.pointerType
    };
  }

  handleDragMove(e) {
    const d = this.drag;
    const now = performance.now();
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const dt = Math.max(1, now - d.lastT);
    d.vx = d.vx * 0.7 + (dx / dt) * 0.3;
    d.vy = d.vy * 0.7 + (dy / dt) * 0.3;
    d.x = e.clientX;
    d.y = e.clientY;
    d.lastT = now;
    const totalDx = d.x - d.x0;
    const totalDy = d.y - d.y0;
    if (!d.started) {
      if (Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD) return;
      d.started = true;
      this.emit('drag', this.dragPayload('start', 0, 0));
      return;
    }
    this.emit('drag', this.dragPayload('move', dx, dy));
  }

  dragPayload(phase, dx, dy) {
    const d = this.drag;
    return {
      phase,
      x: d.x,
      y: d.y,
      dx,
      dy,
      totalDx: d.x - d.x0,
      totalDy: d.y - d.y0,
      vx: d.vx,
      vy: d.vy,
      target: d.target,
      pointerType: d.pointerType
    };
  }

  onPointerUp(e, cancelled = false) {
    this.pointer.down = false;
    const d = this.drag;
    if (!d || (e && e.pointerId !== undefined && e.pointerId !== d.id)) return;
    this.drag = null;
    const now = performance.now();
    if (d.started) {
      this.suppressClickUntil = now + 80;
      const payload = {
        phase: 'end',
        x: d.x,
        y: d.y,
        dx: 0,
        dy: 0,
        totalDx: d.x - d.x0,
        totalDy: d.y - d.y0,
        vx: d.vx,
        vy: d.vy,
        target: d.target,
        pointerType: d.pointerType
      };
      this.emit('drag', payload);
      if (!cancelled) {
        const ax = Math.abs(payload.totalDx);
        const ay = Math.abs(payload.totalDy);
        const fast = Math.hypot(d.vx, d.vy) > 0.35;
        if (Math.max(ax, ay) >= SWIPE_MIN_DIST && (fast || now - d.t0 < 700)) {
          const dir = ax > ay ? (payload.totalDx > 0 ? 'right' : 'left') : payload.totalDy > 0 ? 'down' : 'up';
          this.emit('swipe', { dir, target: d.target, pointerType: d.pointerType });
        }
      }
    } else if (!cancelled && now - d.t0 < TAP_MAX_MS) {
      this.emit('tap', { x: d.x, y: d.y, target: d.target });
    }
  }

  // Chặn "click" ngay sau một cú kéo để thẻ không bị mở nhầm.
  onClickCapture(e) {
    if (performance.now() < this.suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // ---------- Wheel và bàn phím ----------
  onWheel(e) {
    if (e.ctrlKey) return; // phóng to bằng cử chỉ chụm: để trình duyệt xử lý
    let { deltaX: dx, deltaY: dy } = e;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= window.innerHeight;
      dy *= window.innerHeight;
    }
    if (this.emit('wheel', { dx, dy, target: e.target, originalEvent: e })) e.preventDefault();
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const consumed = this.emit('key', {
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      target: e.target,
      originalEvent: e
    });
    if (consumed) e.preventDefault();
  }

  // ---------- Con quay (gyroscope) ----------
  needsGyroPermission() {
    return typeof window.DeviceOrientationEvent !== 'undefined' && typeof window.DeviceOrientationEvent.requestPermission === 'function';
  }

  // Trên iOS chỉ gọi hàm này sau khi người dùng bấm nút (cần cử chỉ của người dùng).
  async enableGyro() {
    if (this.needsGyroPermission()) {
      try {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.bindGyro();
    return true;
  }

  bindGyro() {
    if (this.gyroActive) return;
    this.gyroActive = true;
    const handler = (e) => {
      if (e.gamma === null || e.gamma === undefined) return;
      this.tilt.x = clamp(e.gamma / 35, -1, 1);
      this.tilt.y = clamp(-(((e.beta ?? 45) - 45) / 35), -1, 1);
    };
    window.addEventListener('deviceorientation', handler, { passive: true });
    this.cleanups.push(() => window.removeEventListener('deviceorientation', handler));
  }

  // ---------- Mỗi khung hình ----------
  update(dt) {
    const p = this.pointer;
    const t = this.tilt;
    p.sx = damp(p.sx, p.x, 6, dt);
    p.sy = damp(p.sy, p.y, 6, dt);
    t.sx = damp(t.sx, t.x, 5, dt);
    t.sy = damp(t.sy, t.y, 5, dt);

    if (this.hasMouse && this.cursorEl) {
      p.rx = damp(p.rx, p.cx, 16, dt);
      p.ry = damp(p.ry, p.cy, 16, dt);
      if (this.dotEl) this.dotEl.style.transform = `translate3d(${p.cx}px, ${p.cy}px, 0)`;
      if (this.ringEl) this.ringEl.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0)`;
    }
  }

  // Giá trị thị sai tổng hợp từ chuột và con quay, trong khoảng [-1, 1].
  parallax() {
    return {
      x: clamp(this.pointer.sx + this.tilt.sx, -1, 1),
      y: clamp(this.pointer.sy + this.tilt.sy, -1, 1)
    };
  }
}
