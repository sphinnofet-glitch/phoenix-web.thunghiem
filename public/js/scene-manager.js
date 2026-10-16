// =====================================================================
// public/js/scene-manager.js
// MỘT renderer WebGL dùng chung cho cả site:
//  - nền dùng chung (sao, tàn lửa, tinh vân) chạy suốt, đổi sắc theo từng trang
//  - camera có "rig" (vị trí, điểm nhìn, FOV) chuyển mượt, thị sai theo chuột/con quay
//  - chuyển cảnh điện ảnh (cổng lửa / quét lông vũ) có thể bị ngắt an toàn
//  - bộ đo FPS tự hạ chất lượng khi tụt dưới 45, dừng khi tab ẩn, xử lý mất ngữ cảnh WebGL
//  - chế độ headless (không có WebGL): vòng lặp vẫn chạy cho hoạt ảnh DOM, chỉ bỏ bước vẽ
// =====================================================================
import { QUALITY_TIERS, clamp, disposeObject, glowTexture, prefersReducedMotion } from './utils.js';

const THEMES = {
  1: { tint: [1.0, 0.82, 0.7], neb: [0.5, 0.28, 0.3] },
  2: { tint: [1.0, 0.92, 0.65], neb: [0.4, 0.34, 0.3] },
  3: { tint: [0.85, 0.75, 1.0], neb: [0.55, 0.22, 0.3] },
  4: { tint: [1.0, 0.75, 0.6], neb: [0.45, 0.3, 0.4] }
};

const STAR_VS = /* glsl */ `
attribute float aSize;
attribute float aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
uniform float uFade;
uniform vec3 uTint;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 40.0);
  vA = tw * uFade;
  vColor = aColor * uTint;
  gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z));
}`;

const STAR_FS = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * 1.3, a);
}`;

const EMBER_VS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uScale;
uniform float uFade;
uniform vec3 uTint;
varying vec3 vColor;
varying float vA;
void main() {
  vec3 p = position;
  float h = 24.0;
  p.y = mod(position.y + 12.0 + uTime * (0.25 + aSeed.x * 0.6), h) - 12.0;
  p.x += sin(uTime * 0.5 + aSeed.y * 20.0) * 0.9;
  p.z += cos(uTime * 0.4 + aSeed.w * 20.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = smoothstep(-12.0, -7.0, p.y) * smoothstep(12.0, 5.0, p.y) * uFade * (0.5 + aSeed.z * 0.5);
  vColor = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.8, 0.3), aSeed.z) * uTint;
  gl_PointSize = max(1.0, (0.05 + aSeed.z * 0.1) * uScale / max(0.1, -mv.z));
}`;

export class SceneManager {
  constructor({ THREE, gsap, canvas, shared, input, tier = 'medium', headless = false }) {
    this.THREE = THREE;
    this.gsap = gsap;
    this.canvas = canvas;
    this.input = input;
    this.headless = headless;
    this.listeners = new Map();
    this.frames = new Set();
    this.quality = { ...QUALITY_TIERS[tier] };
    this.shared = shared || {
      uTime: { value: 0 },
      uScale: { value: 500 },
      uFade: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 0.85, 0.7) }
    };

    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.time = 0;
    this.running = false;
    this.contextLost = false;
    this.transitioning = false;
    this.parallaxScale = 1;
    this.camOffset = new THREE.Vector3();
    this.camRoll = 0;
    this.rig = { px: 0, py: 0.2, pz: 9, lx: 0, ly: 0.4, lz: 0, fov: 50 };
    this.fx = { kick: { v: 0 }, dolly: { v: 0 } };
    this._rigTween = null;
    this._tlFinish = null;
    this._perf = { frames: 0, elapsed: 0, bad: 0, grace: 3 };
    this._last = 0;
    this._raf = 0;
    this._lookTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 500);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.renderer = null;
    if (!headless) this.createRenderer();
    this.createBackdrop();

    this.onVisibility = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.resize();
  }

  // ---------- Sự kiện ----------
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[sm:${type}]`, err);
      }
    }
  }

  addFrame(fn) {
    this.frames.add(fn);
    return () => this.frames.delete(fn);
  }

  // ---------- Renderer ----------
  createRenderer() {
    const THREE = this.THREE;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality.antialias,
      alpha: true,
      stencil: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.emit('contextlost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.resize();
      this.emit('contextrestored');
    });
  }

  resize() {
    const w = Math.max(1, Math.floor((this.canvas && this.canvas.clientWidth) || window.innerWidth));
    const h = Math.max(1, Math.floor((this.canvas && this.canvas.clientHeight) || window.innerHeight));
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.renderer) {
      const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.shared.uScale.value = this.renderer.domElement.height * 0.5;
    } else {
      this.shared.uScale.value = h * 0.5;
    }
    this.emit('resize', { width: w, height: h, aspect: w / h });
  }

  // ---------- Nền dùng chung ----------
  createBackdrop() {
    const THREE = this.THREE;
    const sh = this.shared;
    const backdrop = new THREE.Group();
    backdrop.name = 'backdrop';
    this.backdrop = backdrop;

    // Sao
    const STARS = 1600;
    const sp = new Float32Array(STARS * 3);
    const ss = new Float32Array(STARS);
    const sd = new Float32Array(STARS);
    const sc = new Float32Array(STARS * 3);
    const palette = [
      [1.0, 0.95, 0.85],
      [1.0, 0.8, 0.5],
      [0.85, 0.7, 1.0]
    ];
    for (let i = 0; i < STARS; i++) {
      const r = 45 + Math.random() * 60;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      sp[i * 3 + 2] = r * Math.cos(ph);
      ss[i] = 0.25 + Math.random() * 0.75;
      sd[i] = Math.random();
      const c = palette[Math.floor(Math.random() * palette.length)];
      sc.set(c, i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: sh.uTime, uScale: sh.uScale, uFade: sh.uFade, uTint: sh.uTint },
      vertexShader: STAR_VS,
      fragmentShader: STAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.frustumCulled = false;
    backdrop.add(this.stars);

    // Tàn lửa bay lên
    const EMBERS = 260;
    const ep = new Float32Array(EMBERS * 3);
    const es = new Float32Array(EMBERS * 4);
    for (let i = 0; i < EMBERS; i++) {
      ep[i * 3] = (Math.random() - 0.5) * 40;
      ep[i * 3 + 1] = (Math.random() - 0.5) * 24;
      ep[i * 3 + 2] = -30 + Math.random() * 45;
      es.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(es, 4));
    const emberMat = new THREE.ShaderMaterial({
      uniforms: { uTime: sh.uTime, uScale: sh.uScale, uFade: sh.uFade, uTint: sh.uTint },
      vertexShader: EMBER_VS,
      fragmentShader: STAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.embers = new THREE.Points(emberGeo, emberMat);
    this.embers.frustumCulled = false;
    backdrop.add(this.embers);
    this.starCount = STARS;
    this.emberCount = EMBERS;
    this.applyParticleBudget();

    // Tinh vân
    this.nebulae = [];
    const nebSpec = [
      { pos: [-24, 9, -60], scale: 80, inner: '190,110,255', outer: '110,40,200', opacity: 0.38 },
      { pos: [28, -12, -66], scale: 90, inner: '255,170,90', outer: '255,70,20', opacity: 0.24 },
      { pos: [2, 22, -76], scale: 70, inner: '255,120,200', outer: '170,40,150', opacity: 0.2 }
    ];
    for (const spec of nebSpec) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(THREE, spec.inner, spec.outer),
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...spec.pos);
      sprite.scale.set(spec.scale, spec.scale, 1);
      sprite.userData.base = spec.opacity;
      backdrop.add(sprite);
      this.nebulae.push(sprite);
    }
    this.scene.add(backdrop);
  }

  applyParticleBudget() {
    const k = this.quality.particles;
    if (this.stars) this.stars.geometry.setDrawRange(0, Math.max(100, Math.floor(this.starCount * k)));
    if (this.embers) this.embers.geometry.setDrawRange(0, Math.max(30, Math.floor(this.emberCount * k)));
  }

  // Làm tối/sáng nền (dùng cho cảnh mở đầu "màn đen").
  setFade(v) {
    this.shared.uFade.value = v;
    for (const n of this.nebulae) n.material.opacity = n.userData.base * v;
  }

  setTheme(page, duration = 1) {
    const theme = THEMES[page] || THEMES[1];
    const tint = this.shared.uTint.value;
    const target = { x: theme.tint[0], y: theme.tint[1], z: theme.tint[2] };
    if (duration <= 0 || prefersReducedMotion()) {
      tint.set(target.x, target.y, target.z);
      return;
    }
    this.gsap.to(tint, { ...target, duration, ease: 'power2.out', overwrite: true });
  }

  // ---------- Camera ----------
  // rig = { pos: [x,y,z], look: [x,y,z], fov }
  setRig(rig, duration = 0.9) {
    const target = {
      px: rig.pos[0],
      py: rig.pos[1],
      pz: rig.pos[2],
      lx: rig.look[0],
      ly: rig.look[1],
      lz: rig.look[2],
      fov: rig.fov || 50
    };
    if (this._rigTween) this._rigTween.kill();
    this._rigTween = null;
    if (duration <= 0 || prefersReducedMotion()) {
      Object.assign(this.rig, target);
      return;
    }
    this._rigTween = this.gsap.to(this.rig, { ...target, duration, ease: 'power2.inOut' });
  }

  resetCameraOffsets() {
    this.camOffset.set(0, 0, 0);
    this.camRoll = 0;
    this.parallaxScale = 1;
  }

  applyCamera() {
    const cam = this.camera;
    const r = this.rig;
    const par = this.input ? this.input.parallax() : { x: 0, y: 0 };
    const ps = (prefersReducedMotion() ? 0.15 : 1) * this.parallaxScale;
    cam.position.set(
      r.px + this.camOffset.x + par.x * 0.6 * ps,
      r.py + this.camOffset.y + par.y * 0.4 * ps,
      r.pz + this.camOffset.z + this.fx.dolly.v
    );
    this._lookTarget.set(r.lx + this.camOffset.x, r.ly + this.camOffset.y, r.lz + this.camOffset.z);
    cam.lookAt(this._lookTarget);
    if (this.camRoll !== 0) cam.rotateZ(this.camRoll);
    const fov = clamp(r.fov + this.fx.kick.v, 20, 110);
    if (Math.abs(cam.fov - fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // Nền đi theo camera gần như hoàn toàn: sao luôn ở "vô cực" kể cả khi bay xuyên đường hầm.
    this.backdrop.position.copy(cam.position).multiplyScalar(0.93);
  }

  // ---------- Vòng lặp ----------
  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this.tick(t));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame((t) => this.tick(t));
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.shared.uTime.value = this.time;

    for (const fn of this.frames) {
      try {
        fn(dt, this.time);
      } catch (err) {
        console.error('[frame]', err);
        this.frames.delete(fn);
      }
    }
    this.updateFx();
    this.applyCamera();
    if (this.renderer && !this.contextLost) this.renderer.render(this.scene, this.camera);
    this.monitor(dt);
  }

  // Bộ đo FPS: nếu trung bình dưới 45 trong hai nhịp 2 giây liên tiếp thì hạ một bậc chất lượng.
  monitor(dt) {
    if (!this.renderer || this.transitioning) {
      this._perf.frames = 0;
      this._perf.elapsed = 0;
      return;
    }
    const p = this._perf;
    p.frames += 1;
    p.elapsed += dt;
    if (p.elapsed < 2) return;
    const fps = p.frames / p.elapsed;
    p.frames = 0;
    p.elapsed = 0;
    if (p.grace > 0) {
      p.grace -= 1;
      return;
    }
    p.bad = fps < 45 ? p.bad + 1 : 0;
    if (p.bad >= 2) {
      p.bad = 0;
      this.lowerQuality();
    }
  }

  lowerQuality() {
    const order = ['high', 'medium', 'low'];
    const next = order[order.indexOf(this.quality.tier) + 1];
    if (!next) return;
    this.quality = { ...QUALITY_TIERS[next] };
    this.applyParticleBudget();
    this.resize();
    this._perf.grace = 2;
    this.emit('quality', this.quality);
  }

  // ---------- Chuyển cảnh điện ảnh ----------
  ensureFx() {
    if (this.fxGroup) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.visible = false;
    this.gate = new THREE.Group();
    this.gateMats = [];
    [1.0, 0.72, 0.48].forEach((radius, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: [0xff6a1a, 0xffb627, 0xc48cff][i],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fog: false
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05 + i * 0.01, 10, 72), mat);
      ring.renderOrder = 999;
      ring.rotation.z = i * 0.8;
      this.gate.add(ring);
      this.gateMats.push(mat);
    });
    group.add(this.gate);

    this.sweep = new THREE.Group();
    this.sweepMat = new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false
    });
    const featherGeo = new THREE.PlaneGeometry(0.6, 9);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(featherGeo, this.sweepMat);
      m.renderOrder = 999;
      m.position.y = (i % 6) * 0.9 - 2.2;
      m.rotation.z = 0.35 + (i % 3) * 0.08;
      this.sweep.add(m);
    }
    group.add(this.sweep);
    this.fxGroup = group;
    this.scene.add(group);
  }

  updateFx() {
    if (!this.fxGroup || !this.fxGroup.visible) return;
    this.fxGroup.position.copy(this.camera.position);
    this.fxGroup.quaternion.copy(this.camera.quaternion);
    this.fxGroup.translateZ(-6);
    this.gate.rotation.z += 0.04;
  }

  // mid() được gọi đúng một lần, ở lúc màn hình bị che kín hoàn toàn: nơi hoán đổi cảnh.
  transition(kind = 'gate', mid = () => {}, dir = 1) {
    this.finishTransition();
    return new Promise((resolve) => {
      const gsap = this.gsap;
      const veil = document.getElementById('veil');
      const reduced = prefersReducedMotion() || !this.renderer;
      let midDone = false;
      const doMid = () => {
        if (midDone) return;
        midDone = true;
        try {
          mid();
        } catch (err) {
          console.error('[transition:mid]', err);
        }
      };
      this.transitioning = true;
      const fx = this.fx;
      if (!reduced) this.ensureFx();

      const finish = () => {
        doMid();
        if (veil) veil.style.opacity = '0';
        fx.kick.v = 0;
        fx.dolly.v = 0;
        if (this.fxGroup) this.fxGroup.visible = false;
        this.transitioning = false;
        this._tlFinish = null;
        this._perf.grace = Math.max(this._perf.grace, 1);
        resolve();
      };

      const tl = gsap.timeline({ onComplete: finish });
      this._tlFinish = () => {
        tl.kill();
        finish();
      };

      if (reduced) {
        tl.to(veil, { opacity: 1, duration: 0.18 }).call(doMid).to(veil, { opacity: 0, duration: 0.25 });
        return;
      }

      this.fxGroup.visible = true;
      this.gate.visible = kind === 'gate';
      this.sweep.visible = kind === 'sweep';
      tl.set(veil, { opacity: 0 }, 0);
      tl.to(fx.kick, { v: 22, duration: 0.55, ease: 'power2.in' }, 0);
      tl.to(fx.dolly, { v: -3.5, duration: 0.55, ease: 'power2.in' }, 0);
      tl.to(veil, { opacity: 1, duration: 0.45, ease: 'power2.in' }, 0.12);

      if (kind === 'gate') {
        tl.fromTo(this.gate.scale, { x: 0.15, y: 0.15, z: 0.15 }, { x: 6.5, y: 6.5, z: 6.5, duration: 0.62, ease: 'power2.in' }, 0);
        this.gateMats.forEach((mat) => {
          tl.fromTo(mat, { opacity: 0 }, { opacity: 0.95, duration: 0.3, ease: 'power1.out' }, 0);
          tl.to(mat, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 0.62);
        });
      } else {
        const meshes = this.sweep.children;
        tl.fromTo(
          meshes.map((m) => m.position),
          { x: (i) => -dir * (14 + (i % 4) * 1.2) },
          { x: (i) => dir * (14 + (i % 4) * 1.2), duration: 0.8, ease: 'power2.inOut', stagger: 0.02 },
          0
        );
        tl.fromTo(this.sweepMat, { opacity: 0 }, { opacity: 0.85, duration: 0.3 }, 0);
        tl.to(this.sweepMat, { opacity: 0, duration: 0.4 }, 0.7);
      }

      tl.call(doMid, null, 0.64);
      tl.to(veil, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0.68);
      tl.to(fx.kick, { v: 0, duration: 0.6, ease: 'power3.out' }, 0.64);
      tl.to(fx.dolly, { v: 0, duration: 0.6, ease: 'power3.out' }, 0.64);
    });
  }

  finishTransition() {
    if (this._tlFinish) this._tlFinish();
  }

  // ---------- Dọn dẹp ----------
  dispose() {
    this.stop();
    this.finishTransition();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.frames.clear();
    disposeObject(this.backdrop);
    if (this.fxGroup) disposeObject(this.fxGroup);
    disposeObject(this.world);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
}
