// =====================================================================
// public/js/phoenix.js
// Phượng hoàng 3D tạo hoàn toàn bằng code (không cần file model):
//  - thân, cổ, đầu, mỏ, mào: hình học tham số
//  - cánh 3 lớp lông (lông cánh sơ cấp, thứ cấp, lông phủ): vỗ cánh "xương giả lập" trong vertex shader
//  - đuôi: 7 dải lông dài uốn theo chuyển động và độ nghiêng
//  - phát sáng bằng sprite cộng sáng, vệt lửa là hệ hạt trong không gian của `root`
// Nếu có public/assets/phoenix.glb thì loadPhoenixModel() sẽ ưu tiên dùng file đó.
// Cũng xuất: createSparks (hạt tụ lửa) và sampleTextPoints (lấy mẫu chữ thành điểm).
// Hướng bay của chim là trục +Z, cánh dang theo ±X, phía trên là +Y.
// =====================================================================
import { clamp, glowTexture, mulberry32 } from './utils.js';

// ---------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------
const WING_VS = /* glsl */ `
attribute float aLen;
attribute float aLayer;
attribute float aSeed;
attribute float aU;
attribute float aSpan;
uniform float uTime;
uniform float uPhase;
uniform float uAmp;
varying float vLen;
varying float vLayer;
varying float vSeed;
varying float vU;
void main() {
  vec3 p = position;
  float s = aSpan;
  float ph = uPhase - s * 1.2;
  float ang = sin(ph) * uAmp * (0.12 + s * 1.0) + 0.12 * s;
  float cs = cos(ang);
  float sn = sin(ang);
  float x = p.x;
  float y = p.y;
  p.x = x * cs - y * sn;
  p.y = x * sn + y * cs;
  p.y += sin(ph - 0.7) * 0.18 * s * aLen;
  p.y += sin(uTime * 9.0 + aSeed * 6.2831 + aLen * 3.0) * 0.05 * aLen;
  p.z += cos(ph) * 0.22 * s * aLen;
  vLen = aLen;
  vLayer = aLayer;
  vSeed = aSeed;
  vU = aU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const WING_FS = /* glsl */ `
uniform float uTime;
varying float vLen;
varying float vLayer;
varying float vSeed;
varying float vU;
void main() {
  vec3 c1 = vec3(0.72, 0.1, 0.04);
  vec3 c2 = vec3(1.0, 0.42, 0.05);
  vec3 c3 = vec3(1.0, 0.82, 0.28);
  vec3 c4 = vec3(0.7, 0.3, 1.0);
  vec3 col = mix(c1, c2, smoothstep(0.0, 0.45, vLen));
  col = mix(col, c3, smoothstep(0.35, 0.85, vLen));
  col = mix(col, c4, smoothstep(0.9, 1.0, vLen) * 0.55);
  col *= 0.88 + vLayer * 0.07;
  float edge = abs(vU);
  col += vec3(1.0, 0.7, 0.3) * pow(edge, 3.0) * 0.35;
  col *= 0.88 + 0.22 * sin(uTime * 3.0 + vSeed * 6.2831 + vLen * 6.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const TAIL_VS = /* glsl */ `
attribute float aLen;
attribute float aSeed;
attribute float aU;
uniform float uTime;
uniform float uBank;
uniform float uPitch;
varying float vLen;
varying float vSeed;
varying float vU;
void main() {
  vec3 p = position;
  float l = aLen;
  float l2 = l * l;
  p.x += sin(uTime * 1.7 + l * 4.5 + aSeed * 6.28) * 0.28 * l2 + uBank * 1.6 * l2;
  p.y += sin(uTime * 1.3 + l * 3.5 + aSeed * 5.0) * 0.22 * l2 + uPitch * 1.2 * l2 - 0.25 * l2;
  vLen = aLen;
  vSeed = aSeed;
  vU = aU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const TAIL_FS = /* glsl */ `
uniform float uTime;
varying float vLen;
varying float vSeed;
varying float vU;
void main() {
  vec3 c = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.78, 0.22), smoothstep(0.0, 0.6, vLen));
  c = mix(c, vec3(0.7, 0.3, 1.0), smoothstep(0.65, 1.0, vLen) * 0.7);
  float core = 1.0 - abs(vU);
  float a = (0.25 + 0.75 * core) * (1.0 - smoothstep(0.55, 1.0, vLen));
  a *= 0.8 + 0.2 * sin(uTime * 5.0 + vLen * 18.0 + vSeed * 10.0);
  gl_FragColor = vec4(c * 1.3, a);
}`;

const BODY_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BODY_FS = /* glsl */ `
uniform float uTime;
varying vec3 vN;
varying vec3 vP;
void main() {
  float g = clamp(vP.z * 0.45 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.78, 0.25), g);
  float rim = pow(1.0 - abs(normalize(vN).z), 2.5);
  col += vec3(1.0, 0.6, 0.2) * rim * 0.9;
  col *= 0.92 + 0.08 * sin(uTime * 4.0 + vP.y * 8.0 + vP.z * 5.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const TRAIL_VS = /* glsl */ `
attribute float aAge;
attribute float aSize;
uniform float uScale;
varying float vAge;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vAge = aAge;
  gl_PointSize = aSize * (1.0 - aAge) * uScale / max(0.1, -mv.z);
}`;

const TRAIL_FS = /* glsl */ `
varying float vAge;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * (1.0 - vAge);
  vec3 c = mix(vec3(1.0, 0.9, 0.5), vec3(1.0, 0.4, 0.06), smoothstep(0.0, 0.45, vAge));
  c = mix(c, vec3(0.5, 0.12, 0.35), smoothstep(0.5, 1.0, vAge));
  if (a < 0.01) discard;
  gl_FragColor = vec4(c * 1.4, a);
}`;

const SPARK_VS = /* glsl */ `
attribute vec3 aTarget;
attribute float aSeed;
uniform float uProgress;
uniform float uTime;
uniform float uScale;
uniform float uSize;
varying float vK;
varying float vSeed;
void main() {
  float k = clamp((uProgress - aSeed * 0.4) / 0.6, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(position, aTarget, k);
  float sw = (1.0 - k) * sin(uProgress * 6.0 + aSeed * 20.0);
  p.x += sw * 0.6;
  p.y += cos(uProgress * 5.0 + aSeed * 17.0) * (1.0 - k) * 0.6;
  p += vec3(sin(uTime * 2.0 + aSeed * 30.0), cos(uTime * 1.6 + aSeed * 23.0), 0.0) * 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vK = k;
  vSeed = aSeed;
  gl_PointSize = max(1.0, uSize * (0.5 + aSeed) * uScale / max(0.1, -mv.z));
}`;

const SPARK_FS = /* glsl */ `
uniform float uAlpha;
varying float vK;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.35), vK * 0.8 + vSeed * 0.2);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * 1.3, a * uAlpha);
}`;

// ---------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------
function buildWing(THREE) {
  const rng = mulberry32(7);
  const pos = [];
  const aLen = [];
  const aLayer = [];
  const aSeed = [];
  const aU = [];
  const aSpan = [];
  const idx = [];
  const SPAN = 4.6;
  const SEG = 5;
  const arm = (t) => {
    const P = [
      [0.25, 0.15, 0.2],
      [1.15, 0.3, 0.05],
      [2.05, 0.28, -0.25]
    ];
    const k = t * 2;
    const i = Math.min(1, Math.floor(k));
    const f = k - i;
    const a = P[i];
    const b = P[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  const layers = [
    { n: 9, lenOuter: 2.5, lenInner: 1.5, w: 0.34, t0: 0.45, t1: 1.0, angInner: 55, angOuter: 12, y: 0.0 },
    { n: 8, lenOuter: 1.7, lenInner: 1.2, w: 0.38, t0: 0.05, t1: 0.5, angInner: 82, angOuter: 58, y: 0.025 },
    { n: 10, lenOuter: 1.0, lenInner: 0.55, w: 0.28, t0: 0.05, t1: 0.95, angInner: 70, angOuter: 20, y: 0.05 }
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.n; k++) {
      const t = k / (L.n - 1);
      const root = arm(L.t0 + (L.t1 - L.t0) * t);
      const a = ((L.angInner + (L.angOuter - L.angInner) * t) * Math.PI) / 180;
      const len = L.lenInner + (L.lenOuter - L.lenInner) * t;
      const dx = Math.cos(a);
      const dz = -Math.sin(a);
      const px = Math.sin(a);
      const pz = Math.cos(a);
      const seed = rng();
      const base = pos.length / 3;
      for (let j = 0; j <= SEG; j++) {
        const l = j / SEG;
        const hw = L.w * 0.5 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.1 + 0.9 * l))), 0.55);
        const cx = root[0] + dx * len * l;
        const cy = root[1] + L.y + 0.18 * Math.sin(l * Math.PI) * (0.6 + 0.4 * (1 - t));
        const cz = root[2] + dz * len * l;
        for (const side of [-1, 1]) {
          pos.push(cx + px * hw * side, cy, cz + pz * hw * side);
          aLen.push(l);
          aLayer.push(li);
          aSeed.push(seed);
          aU.push(side);
          aSpan.push(Math.min(1, cx / SPAN));
        }
      }
      for (let j = 0; j < SEG; j++) {
        const v0 = base + j * 2;
        idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLen', new THREE.Float32BufferAttribute(aLen, 1));
  geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(aLayer, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(aSeed, 1));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  geo.setAttribute('aSpan', new THREE.Float32BufferAttribute(aSpan, 1));
  geo.setIndex(idx);
  return geo;
}

function buildTail(THREE) {
  const rng = mulberry32(21);
  const pos = [];
  const aLen = [];
  const aSeed = [];
  const aU = [];
  const idx = [];
  const N = 7;
  const SEG = 22;
  for (let k = 0; k < N; k++) {
    const f = (k / (N - 1)) * 2 - 1;
    const seed = rng();
    const L = 3.4 + (1 - Math.abs(f)) * 2.6 + rng() * 0.6;
    const fan = f * 0.5;
    const w0 = 0.28 + (1 - Math.abs(f)) * 0.12;
    const base = pos.length / 3;
    for (let j = 0; j <= SEG; j++) {
      const l = j / SEG;
      const cx = Math.sin(fan) * l * L * 0.6;
      const cy = -0.05 - 0.1 * l;
      const cz = -0.9 - Math.cos(fan) * l * L;
      const hw = w0 * 0.5 * Math.pow(Math.max(0, 1 - l), 0.6) * (1 + 0.5 * Math.sin(l * Math.PI));
      for (const side of [-1, 1]) {
        pos.push(cx + hw * side, cy, cz);
        aLen.push(l);
        aSeed.push(seed);
        aU.push(side);
      }
    }
    for (let j = 0; j < SEG; j++) {
      const v0 = base + j * 2;
      idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLen', new THREE.Float32BufferAttribute(aLen, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(aSeed, 1));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  geo.setIndex(idx);
  return geo;
}

// Nón mảnh chỉ về hướng `dir`, đặt tại `from` (dùng cho mào).
function plume(THREE, material, from, dir, length, radius) {
  const geo = new THREE.ConeGeometry(radius, length, 6);
  geo.translate(0, length / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  const d = new THREE.Vector3(...dir).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  mesh.position.set(...from);
  return mesh;
}

// ---------------------------------------------------------------------
// Phượng hoàng
// ---------------------------------------------------------------------
export function createPhoenix({ THREE, shared, quality = { particles: 1 }, scale = 1 }) {
  const root = new THREE.Group();
  const bird = new THREE.Group();
  const parts = new THREE.Group();
  bird.add(parts);
  root.add(bird);
  bird.scale.setScalar(scale);

  const u = {
    uTime: shared.uTime,
    uPhase: { value: 0 },
    uAmp: { value: 0.85 },
    uBank: { value: 0 },
    uPitch: { value: 0 }
  };

  // Thân
  const bodyMat = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime }, vertexShader: BODY_VS, fragmentShader: BODY_FS });
  const torsoGeo = new THREE.SphereGeometry(1, 20, 14);
  torsoGeo.scale(0.32, 0.3, 0.95);
  parts.add(new THREE.Mesh(torsoGeo, bodyMat));

  const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 0.7), new THREE.Vector3(0, 0.35, 1.05), new THREE.Vector3(0, 0.62, 1.2)]);
  parts.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 10, 0.13, 8), bodyMat));

  const headGeo = new THREE.SphereGeometry(0.17, 14, 10);
  headGeo.scale(1, 1, 1.15);
  headGeo.translate(0, 0.7, 1.3);
  parts.add(new THREE.Mesh(headGeo, bodyMat));

  const beakMat = new THREE.MeshBasicMaterial({ color: 0xffc247 });
  const beakGeo = new THREE.ConeGeometry(0.07, 0.32, 8);
  beakGeo.rotateX(Math.PI / 2);
  beakGeo.translate(0, 0.68, 1.58);
  parts.add(new THREE.Mesh(beakGeo, beakMat));

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const side of [-1, 1]) {
    const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
    eyeGeo.translate(side * 0.1, 0.74, 1.38);
    parts.add(new THREE.Mesh(eyeGeo, eyeMat));
  }

  const crestMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
  parts.add(plume(THREE, crestMat, [0, 0.85, 1.25], [0, 0.6, -0.7], 0.7, 0.035));
  parts.add(plume(THREE, crestMat, [0.04, 0.84, 1.24], [0.45, 0.5, -0.7], 0.55, 0.03));
  parts.add(plume(THREE, crestMat, [-0.04, 0.84, 1.24], [-0.45, 0.5, -0.7], 0.55, 0.03));

  // Cánh
  const wingGeo = buildWing(THREE);
  const wingMat = new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime, uPhase: u.uPhase, uAmp: u.uAmp },
    vertexShader: WING_VS,
    fragmentShader: WING_FS,
    side: THREE.DoubleSide
  });
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.scale.x = -1;
  wingR.frustumCulled = false;
  wingL.frustumCulled = false;
  parts.add(wingR, wingL);

  // Đuôi
  const tailMat = new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime, uBank: u.uBank, uPitch: u.uPitch },
    vertexShader: TAIL_VS,
    fragmentShader: TAIL_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const tail = new THREE.Mesh(buildTail(THREE), tailMat);
  tail.frustumCulled = false;
  parts.add(tail);

  // Phát sáng
  const glowA = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(THREE), color: 0xff8a30, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  glowA.position.set(0, 0.2, 0.2);
  glowA.scale.set(4.2, 4.2, 1);
  const glowB = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(THREE, '210,150,255', '120,40,200'), color: 0xb070ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  glowB.position.set(0, 0.1, -0.6);
  glowB.scale.set(9, 9, 1);
  parts.add(glowB, glowA);

  // Vệt lửa: các hạt nằm trong không gian của `root`, không đi theo chim
  const NT = Math.max(40, Math.round(240 * quality.particles));
  const tPos = new Float32Array(NT * 3);
  const tAge = new Float32Array(NT).fill(1);
  const tSize = new Float32Array(NT);
  const tVel = new Float32Array(NT * 3);
  const tLife = new Float32Array(NT).fill(1);
  const tT = new Float32Array(NT).fill(1);
  for (let i = 0; i < NT; i++) tPos[i * 3 + 1] = -9999;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  trailGeo.setAttribute('aAge', new THREE.BufferAttribute(tAge, 1));
  trailGeo.setAttribute('aSize', new THREE.BufferAttribute(tSize, 1));
  const trail = new THREE.Points(
    trailGeo,
    new THREE.ShaderMaterial({
      uniforms: { uScale: shared.uScale },
      vertexShader: TRAIL_VS,
      fragmentShader: TRAIL_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  trail.frustumCulled = false;
  root.add(trail);

  const V = {
    P: new THREE.Vector3(),
    T: new THREE.Vector3(0, 0, 1),
    prevT: new THREE.Vector3(0, 0, 1),
    negT: new THREE.Vector3(),
    zero: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    zAxis: new THREE.Vector3(0, 0, 1),
    tmp: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    inv: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    qBank: new THREE.Quaternion()
  };
  const st = {
    path: null,
    u: 0,
    speed: 0.06,
    loop: true,
    bank: 0,
    pitch: 0,
    flap: 5.2,
    boost: 0,
    cursor: 0,
    acc: 0,
    offset: new THREE.Vector3(),
    offsetTarget: new THREE.Vector3(),
    mixer: null,
    model: null
  };

  function spawn(local, burst = false) {
    const i = st.cursor;
    st.cursor = (st.cursor + 1) % NT;
    V.tmp.copy(local).applyMatrix4(bird.matrixWorld).applyMatrix4(V.inv);
    tPos[i * 3] = V.tmp.x;
    tPos[i * 3 + 1] = V.tmp.y;
    tPos[i * 3 + 2] = V.tmp.z;
    const k = burst ? 2.6 : 0.4;
    tVel[i * 3] = (Math.random() - 0.5) * k;
    tVel[i * 3 + 1] = (Math.random() - 0.3) * k + 0.25;
    tVel[i * 3 + 2] = (Math.random() - 0.5) * k;
    tLife[i] = 0.8 + Math.random() * 0.9;
    tT[i] = 0;
    tAge[i] = 0;
    tSize[i] = (burst ? 0.28 : 0.18) * (0.6 + Math.random() * 0.8);
  }

  const emitLocal = new THREE.Vector3();
  function emit(dt) {
    root.updateMatrixWorld(true);
    V.inv.copy(root.matrixWorld).invert();
    st.acc += (80 + st.boost * 60) * quality.particles * dt;
    while (st.acc >= 1) {
      st.acc -= 1;
      if (Math.random() < 0.25) emitLocal.set((Math.random() < 0.5 ? -1 : 1) * (3.6 + Math.random() * 0.8), 0.2, -0.9);
      else emitLocal.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.3, -1.3 - Math.random() * 3.5);
      spawn(emitLocal);
    }
  }

  function stepTrail(dt) {
    for (let i = 0; i < NT; i++) {
      if (tAge[i] >= 1) continue;
      tT[i] += dt;
      const a = tT[i] / tLife[i];
      if (a >= 1) {
        tAge[i] = 1;
        tPos[i * 3 + 1] = -9999;
        continue;
      }
      tAge[i] = a;
      tVel[i * 3 + 1] += 0.3 * dt;
      tPos[i * 3] += tVel[i * 3] * dt;
      tPos[i * 3 + 1] += tVel[i * 3 + 1] * dt;
      tPos[i * 3 + 2] += tVel[i * 3 + 2] * dt;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.aAge.needsUpdate = true;
    trailGeo.attributes.aSize.needsUpdate = true;
  }

  const api = {
    root,
    bird,
    trail,
    state: st,
    glow: glowA,

    // curve: THREE.Curve; u: tham số bắt đầu 0..1; speed: vòng/giây (0 = tự điều khiển api.state.u)
    setPath(curve, { speed = 0.06, loop = true, u: u0 = 0 } = {}) {
      st.path = curve;
      st.speed = speed;
      st.loop = loop;
      st.u = u0;
    },

    setOffset(x, y, z = 0) {
      st.offsetTarget.set(x, y, z);
    },

    setBoost(v) {
      st.boost = clamp(v, 0, 1.5);
    },

    burst(n = 24) {
      root.updateMatrixWorld(true);
      V.inv.copy(root.matrixWorld).invert();
      for (let i = 0; i < n; i++) {
        emitLocal.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2);
        spawn(emitLocal, true);
      }
    },

    update(dt) {
      if (st.path) {
        if (st.speed > 0) st.u += st.speed * dt * (1 + st.boost * 1.2);
        const uu = st.loop ? ((st.u % 1) + 1) % 1 : clamp(st.u, 0, 1);
        st.path.getPointAt(uu, V.P);
        st.path.getTangentAt(uu, V.T);
        st.offset.lerp(st.offsetTarget, 1 - Math.exp(-3 * dt));
        bird.position.copy(V.P).add(st.offset);

        const yaw = (V.prevT.z * V.T.x - V.prevT.x * V.T.z) / Math.max(dt, 0.001);
        st.bank += (clamp(-yaw * 0.6, -0.8, 0.8) - st.bank) * (1 - Math.exp(-4 * dt));
        V.prevT.copy(V.T);

        V.negT.copy(V.T).negate();
        V.m.lookAt(V.zero, V.negT, V.up);
        V.q.setFromRotationMatrix(V.m);
        V.qBank.setFromAxisAngle(V.zAxis, st.bank);
        V.q.multiply(V.qBank);
        bird.quaternion.slerp(V.q, 1 - Math.exp(-6 * dt));

        st.pitch += (clamp(V.T.y * 2, -1, 1) - st.pitch) * (1 - Math.exp(-3 * dt));
        u.uBank.value = st.bank;
        u.uPitch.value = st.pitch;
        st.flap = 5 + clamp(V.T.y, 0, 1) * 2.5 + st.boost * 2;
      }
      u.uPhase.value += st.flap * dt;
      const pulse = 0.75 + 0.15 * Math.sin(shared.uTime.value * 3);
      glowA.material.opacity = pulse;
      bird.updateMatrixWorld(true);
      if (st.mixer) st.mixer.update(dt);
      emit(dt);
      stepTrail(dt);
      st.boost = Math.max(0, st.boost - dt * 0.6);
    },

    // Thay bản tạo bằng code bằng model người dùng cung cấp.
    useModel(model, animations = []) {
      parts.visible = false;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z, 0.0001);
      model.scale.setScalar(9 / span);
      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(9 / span);
      model.position.sub(center);
      bird.add(model);
      st.model = model;
      if (animations.length > 0) {
        st.mixer = new THREE.AnimationMixer(model);
        st.mixer.clipAction(animations[0]).play();
      }
    },

    dispose() {
      if (st.mixer) st.mixer.stopAllAction();
      // Hình học, vật liệu và texture được giải phóng bởi disposeObject(root) của cảnh sở hữu.
    }
  };
  return api;
}

// Thử nạp public/assets/phoenix.glb. Trả về true nếu dùng được; mọi lỗi đều quay về bản tạo bằng code.
export async function loadPhoenixModel(phoenix, url = '/assets/phoenix.glb') {
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!head.ok) return false;
    const type = head.headers.get('content-type') || '';
    if (type.includes('text/html')) return false;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    phoenix.useModel(gltf.scene, gltf.animations || []);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Hạt tụ lửa: bay từ `starts` về `targets` khi uProgress chạy 0 -> 1
// ---------------------------------------------------------------------
export function createSparks({ THREE, shared, starts, targets, size = 0.14 }) {
  const count = Math.floor(targets.length / 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(starts, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uProgress: { value: 0 },
    uAlpha: { value: 1 },
    uSize: { value: size },
    uTime: shared.uTime,
    uScale: shared.uScale
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SPARK_VS,
      fragmentShader: SPARK_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  points.frustumCulled = false;
  return { points, uniforms, count };
}

// Tạo mảng điểm khởi đầu ngẫu nhiên quanh một tâm (cầu bán kính r).
export function randomCloud(count, center, radius) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.35 + Math.random() * 0.65);
    arr[i * 3] = center[0] + r * Math.sin(ph) * Math.cos(th);
    arr[i * 3 + 1] = center[1] + r * Math.sin(ph) * Math.sin(th);
    arr[i * 3 + 2] = center[2] + r * Math.cos(ph);
  }
  return arr;
}

// Vẽ chữ lên canvas rồi lấy mẫu các điểm sáng. Trả về { points: Float32Array [nx, ny, ...], aspect }.
// nx trong [-0.5, 0.5] theo chiều rộng chữ, ny theo chiều rộng chữ chia aspect.
export function sampleTextPoints(text, { fontFamily = 'serif', fontWeight = 800, count = 800 } = {}) {
  try {
    const fs = 160;
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d');
    g.font = `${fontWeight} ${fs}px ${fontFamily}`;
    const w = Math.ceil(g.measureText(text).width) + 20;
    const h = Math.ceil(fs * 1.3);
    canvas.width = w;
    canvas.height = h;
    g.font = `${fontWeight} ${fs}px ${fontFamily}`;
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, 10, h / 2);
    const data = g.getImageData(0, 0, w, h).data;
    const step = Math.max(2, Math.round(Math.sqrt((w * h * 0.3) / count)));
    const found = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (data[(y * w + x) * 4 + 3] > 128) found.push((x - w / 2) / w, (h / 2 - y) / w);
      }
    }
    const total = found.length / 2;
    if (total === 0) return { points: new Float32Array(0), aspect: w / h };
    const out = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const pick = total <= count ? i % total : Math.floor(Math.random() * total);
      out[i * 2] = found[pick * 2];
      out[i * 2 + 1] = found[pick * 2 + 1];
    }
    return { points: out, aspect: w / h };
  } catch {
    return { points: new Float32Array(0), aspect: 4 };
  }
}
