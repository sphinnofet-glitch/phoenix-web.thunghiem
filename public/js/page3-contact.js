// =====================================================================
// public/js/page3-contact.js
// Trang 3 (#/3): biểu mẫu đặt dịch vụ, dùng được thật.
//  - Phía client chỉ hỗ trợ kiểm tra; server là nguồn sự thật (zod + Turnstile + CSRF + token thời gian).
//  - Giao thức: GET /api/session -> { csrfToken, formToken, turnstileSiteKey }
//               POST /api/contact (header X-CSRF-Token, body JSON đúng các khóa server cho phép).
//  - Nếu phản hồi có refresh:true thì lấy lại phiên và đặt lại widget Turnstile.
//  - Mọi ô nhập là phần tử HTML thật trong không gian CSS 3D; WebGL chỉ vẽ cổng lửa phía sau.
// =====================================================================
import { bindTilt, clamp, createDisposer, damp, disposeObject, el, glowTexture, hasFinePointer, magnetic } from './utils.js';
import { createPhoenix, loadPhoenixModel } from './phoenix.js';

const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;
const PHONE_MOBILE_RE = /^0(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\d)\d{7}$/;
const PHONE_LANDLINE_RE = /^02\d{9}$/;
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SESSION_MAX_AGE_MS = 50 * 60 * 1000;

// Bản nháp giữ trong bộ nhớ (không ghi vào storage) để quay lại trang không mất dữ liệu đang nhập.
let draft = null;
let turnstilePromise = null;

function normalizePhone(raw) {
  let p = raw.replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  else if (/^84\d{9,10}$/.test(p)) p = `0${p.slice(2)}`;
  return p;
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstilePromise) return turnstilePromise;
  turnstilePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      turnstilePromise = null;
      script.remove();
      reject(new Error('turnstile'));
    };
    document.head.append(script);
  });
  return turnstilePromise;
}

export function createScene(ctx) {
  const { CONFIG, THREE, gsap, sm, input } = ctx;
  const F = CONFIG.form;
  const D = createDisposer();
  const group = new THREE.Group();
  const state = {
    session: null,
    sessionAt: 0,
    tsToken: '',
    tsWidget: null,
    sending: false,
    submitted: false,
    touched: new Set(),
    retried: false,
    glow: 0,
    destroyed: false,
    tiltX: 0,
    tiltY: 0
  };

  // ---------- Dựng trường nhập ----------
  const fields = {};
  const control = {};

  function makeField(name, labelText, controlEl, { hint, wide, extra } = {}) {
    const id = `f-${name}`;
    controlEl.id = id;
    controlEl.name = name;
    controlEl.classList.add('field__control');
    const errId = `e-${name}`;
    const err = el('p', { class: 'field__error', id: errId, 'aria-live': 'polite' });
    const describedBy = [errId];
    const children = [el('label', { class: 'field__label', for: id, text: labelText }), controlEl];
    if (hint) {
      const hintId = `h-${name}`;
      children.push(el('p', { class: 'field__hint', id: hintId, text: hint }));
      describedBy.push(hintId);
    }
    if (extra) children.push(extra);
    children.push(err);
    controlEl.setAttribute('aria-describedby', describedBy.join(' '));
    const field = el('div', { class: `field${wide ? ' field--wide' : ''}`, 'data-field': name }, children);
    fields[name] = field;
    control[name] = controlEl;
    return field;
  }

  const L = F.labels;
  const nameInput = el('input', { type: 'text', autocomplete: 'name', required: true, maxlength: '100', placeholder: F.placeholders.name });
  const emailInput = el('input', { type: 'email', autocomplete: 'email', required: true, maxlength: '254', placeholder: F.placeholders.email, inputmode: 'email' });
  const phoneInput = el('input', { type: 'tel', autocomplete: 'tel', required: true, maxlength: '30', placeholder: F.placeholders.phone, inputmode: 'tel' });

  const selectOf = (list) => {
    const sel = el('select', {}, [el('option', { value: '', text: F.placeholders.select })]);
    list.forEach((o) => sel.append(el('option', { value: o.id, text: o.label })));
    return sel;
  };
  const budgetSelect = selectOf(F.budgets);
  const timelineSelect = selectOf(F.timelines);

  const messageArea = el('textarea', { rows: '6', maxlength: String(F.maxMessageLength), placeholder: F.placeholders.message });
  const counter = el('p', { class: 'field__count', 'aria-hidden': 'true', text: `0 / ${F.maxMessageLength}` });

  // Dịch vụ quan tâm (chọn nhiều)
  const serviceBoxes = CONFIG.services.map((s) => {
    const input_ = el('input', { type: 'checkbox', name: 'services', value: s.id });
    return { id: s.id, input: input_, node: el('label', { class: 'choice' }, [input_, el('span', { text: s.name })]) };
  });
  const servicesSet = el('fieldset', { class: 'choices', 'aria-describedby': 'h-services e-services' }, [
    el('legend', { class: 'sr-only', text: L.services }),
    ...serviceBoxes.map((b) => b.node)
  ]);
  const servicesField = el('div', { class: 'field field--wide', 'data-field': 'services' }, [
    el('p', { class: 'field__legend', text: L.services }),
    servicesSet,
    el('p', { class: 'field__hint', id: 'h-services', text: F.hints.services }),
    el('p', { class: 'field__error', id: 'e-services', 'aria-live': 'polite' })
  ]);
  fields.services = servicesField;

  // Hình thức liên hệ (chọn một)
  const methodRadios = F.contactMethods.map((m) => {
    const radio = el('input', { type: 'radio', name: 'contactMethod', value: m.id });
    return { id: m.id, input: radio, node: el('label', { class: 'choice' }, [radio, el('span', { text: m.label })]) };
  });
  const methodField = el('div', { class: 'field field--wide', 'data-field': 'contactMethod' }, [
    el('p', { class: 'field__legend', text: L.contactMethod }),
    el('div', { class: 'choices', role: 'radiogroup', 'aria-label': L.contactMethod }, methodRadios.map((r) => r.node)),
    el('p', { class: 'field__error', id: 'e-contactMethod', 'aria-live': 'polite' })
  ]);
  fields.contactMethod = methodField;

  // Ô bẫy cho robot (ẩn khỏi người dùng và trình đọc màn hình)
  const honeypot = el('input', { type: 'text', name: 'website_url', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const trap = el('div', { class: 'field field--trap', 'aria-hidden': 'true' }, [el('label', { text: 'Website', for: 'f-website_url' }), honeypot]);
  honeypot.id = 'f-website_url';

  // Đồng ý xử lý dữ liệu
  const consentBox = el('input', { type: 'checkbox', id: 'f-consent', name: 'consent', required: true, 'aria-describedby': 'e-consent' });
  const consentErr = el('p', { class: 'field__error', id: 'e-consent', 'aria-live': 'polite' });
  const consentWrap = el('div', { 'data-field': 'consent' }, [
    el('div', { class: 'consent' }, [consentBox, el('label', { class: 'consent__text', for: 'f-consent', text: F.consentText })]),
    consentErr
  ]);
  fields.consent = consentWrap;

  const tsSlot = el('div', { class: 'turnstile-slot', 'aria-label': F.turnstileLabel });
  const tsErr = el('p', { class: 'field__error', id: 'e-turnstile', 'aria-live': 'polite' });

  const submitLabel = el('span', { text: F.submitLabel });
  const submitBtn = el('button', { class: 'btn btn--primary btn--3d', type: 'submit' }, [el('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), submitLabel]);
  const statusEl = el('p', { class: 'form__status', role: 'status', 'aria-live': 'polite' });

  const grid = el('div', { class: 'form__grid' }, [
    makeField('name', L.name, nameInput),
    makeField('email', L.email, emailInput),
    makeField('phone', L.phone, phoneInput, { hint: F.hints.phone }),
    makeField('budget', L.budget, budgetSelect),
    makeField('timeline', L.timeline, timelineSelect),
    servicesField,
    methodField,
    makeField('message', L.message, messageArea, { wide: true, hint: F.hints.message, extra: counter }),
    trap
  ]);

  const form = el(
    'form',
    { class: 'form glass', novalidate: true, 'aria-label': F.title, autocomplete: 'on' },
    [grid, consentWrap, el('div', {}, [tsSlot, tsErr]), el('div', { class: 'form__actions' }, [submitBtn, statusEl])]
  );

  const head = el('div', { class: 'scene__head' }, [
    el('h2', { class: 'scene__title', id: 'contact-title', text: F.title }),
    el('p', { class: 'scene__lead', text: F.lead })
  ]);
  const portal = el('div', { class: 'portal' }, [form]);
  const root = el('section', { class: 'scene scene--scroll contact', 'aria-labelledby': 'contact-title', tabindex: '-1' }, [head, portal]);
  D.add(magnetic(gsap, submitBtn, 0.2));

  // ---------- Kiểm tra phía client (chỉ hỗ trợ; server kiểm tra lại đầy đủ) ----------
  const E = F.errors;
  const validators = {
    name: () => (nameInput.value.trim().length >= 2 ? '' : nameInput.value.trim() ? 'Họ tên cần ít nhất 2 ký tự.' : E.required),
    email: () => {
      const v = emailInput.value.trim();
      return !v ? E.required : EMAIL_RE.test(v) ? '' : E.email;
    },
    phone: () => {
      const v = phoneInput.value.trim();
      if (!v) return E.required;
      const p = normalizePhone(v);
      return PHONE_MOBILE_RE.test(p) || PHONE_LANDLINE_RE.test(p) ? '' : E.phone;
    },
    message: () => (messageArea.value.length > F.maxMessageLength ? `Tối đa ${F.maxMessageLength} ký tự.` : ''),
    consent: () => (consentBox.checked ? '' : E.consent)
  };

  function setError(name, message) {
    const field = fields[name];
    if (!field) return;
    const err = field.querySelector('.field__error');
    if (err) err.textContent = message || '';
    const ctrl = control[name] || (name === 'consent' ? consentBox : null);
    if (ctrl) ctrl.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (field.classList.contains('field')) {
      field.classList.toggle('is-invalid', Boolean(message));
      field.classList.toggle('is-valid', !message && state.touched.has(name) && Boolean(ctrl && ctrl.value));
    }
  }

  function validateField(name) {
    const fn = validators[name];
    if (!fn) return '';
    const message = fn();
    setError(name, message);
    return message;
  }

  function validateAll() {
    let firstBad = null;
    for (const name of Object.keys(validators)) {
      state.touched.add(name);
      if (validateField(name) && !firstBad) firstBad = name;
    }
    return firstBad;
  }

  function focusField(name) {
    const target = control[name] || (name === 'consent' ? consentBox : null);
    if (target) target.focus({ preventScroll: false });
  }

  for (const name of ['name', 'email', 'phone', 'message']) {
    const ctrl = control[name];
    D.listen(ctrl, 'blur', () => {
      state.touched.add(name);
      validateField(name);
    });
    D.listen(ctrl, 'input', () => {
      if (state.touched.has(name)) validateField(name);
      if (!ctx.reduced) gsap.fromTo(ctrl, { scale: 1.012 }, { scale: 1, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
      state.glow = 1;
    });
  }
  D.listen(messageArea, 'input', () => {
    const len = messageArea.value.length;
    counter.textContent = `${len} / ${F.maxMessageLength}`;
    counter.classList.toggle('is-limit', len >= F.maxMessageLength);
  });
  D.listen(consentBox, 'change', () => {
    state.touched.add('consent');
    validateField('consent');
  });

  // Hiệu ứng nổi lên khi focus
  D.listen(form, 'focusin', (e) => {
    const field = e.target.closest ? e.target.closest('.field') : null;
    if (field) field.classList.add('is-focus');
    state.glow = 1;
  });
  D.listen(form, 'focusout', (e) => {
    const field = e.target.closest ? e.target.closest('.field') : null;
    if (field) field.classList.remove('is-focus');
  });

  // Ánh sáng chạy theo con trỏ và bảng nghiêng nhẹ (chỉ có chuột)
  if (hasFinePointer()) {
    D.listen(form, 'pointermove', (e) => {
      const r = form.getBoundingClientRect();
      const u = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
      const v = clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1);
      form.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
      form.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
      if (!ctx.reduced) {
        form.style.setProperty('--px', `${((0.5 - v) * 3).toFixed(2)}deg`);
        form.style.setProperty('--py', `${((u - 0.5) * 4).toFixed(2)}deg`);
      }
    });
    D.listen(form, 'pointerleave', () => {
      form.style.setProperty('--px', '0deg');
      form.style.setProperty('--py', '0deg');
    });
  }
  serviceBoxes.forEach((b) => D.add(bindTilt(b.node, { maxX: 0, maxY: 0, lift: '0px' })));

  // ---------- Phiên, CSRF, Turnstile ----------
  function setStatus(message, kind = '') {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', kind === 'error');
    statusEl.classList.toggle('is-ok', kind === 'ok');
  }

  async function loadSession() {
    const res = await fetch('/api/session', { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`session ${res.status}`);
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error('session');
    state.session = data;
    state.sessionAt = Date.now();
    return data;
  }

  function resetTurnstile() {
    state.tsToken = '';
    tsErr.textContent = '';
    if (window.turnstile && state.tsWidget !== null) {
      try {
        window.turnstile.reset(state.tsWidget);
      } catch {
        /* widget có thể đã bị gỡ */
      }
    }
  }

  async function mountTurnstile() {
    if (state.destroyed || state.tsWidget !== null || !state.session) return;
    try {
      const ts = await loadTurnstile();
      if (state.destroyed) return;
      state.tsWidget = ts.render(tsSlot, {
        sitekey: state.session.turnstileSiteKey,
        theme: 'dark',
        language: 'vi',
        callback: (token) => {
          state.tsToken = token;
          tsErr.textContent = '';
        },
        'expired-callback': () => {
          state.tsToken = '';
        },
        'error-callback': () => {
          state.tsToken = '';
          tsErr.textContent = E.robot;
        }
      });
    } catch {
      tsErr.textContent = 'Không tải được bước xác minh. Vui lòng kiểm tra mạng rồi tải lại trang.';
    }
  }

  async function refreshSession() {
    try {
      await loadSession();
    } catch {
      setStatus(E.network, 'error');
    }
    resetTurnstile();
  }

  // ---------- Gửi ----------
  function collect() {
    const checked = serviceBoxes.filter((b) => b.input.checked).map((b) => b.id);
    const method = methodRadios.find((r) => r.input.checked);
    return {
      name: nameInput.value,
      email: emailInput.value,
      phone: phoneInput.value,
      services: checked,
      budget: budgetSelect.value,
      timeline: timelineSelect.value,
      contactMethod: method ? method.id : '',
      message: messageArea.value
    };
  }

  function setSending(on) {
    state.sending = on;
    form.classList.toggle('is-sending', on);
    submitBtn.disabled = on;
    submitBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
    submitLabel.textContent = on ? F.sendingLabel : F.submitLabel;
  }

  function applyServerFields(fieldsMap) {
    let first = null;
    for (const [key, message] of Object.entries(fieldsMap || {})) {
      if (key === 'turnstileToken') {
        tsErr.textContent = message;
      } else if (key === 'formToken') {
        // lỗi phiên: được xử lý qua refresh
      } else {
        state.touched.add(key);
        setError(key, message);
        if (!first && (control[key] || key === 'consent')) first = key;
      }
    }
    if (first) focusField(first);
  }

  async function handleFailure(status, data, tryRetry) {
    const code = data && data.code;
    if (data && data.fields) applyServerFields(data.fields);
    if (data && data.refresh) await refreshSession();

    if (code === 'TOO_FAST' && tryRetry && !state.retried) {
      state.retried = true;
      setStatus(data.message, 'error');
      await new Promise((r) => window.setTimeout(r, clamp(Number(data.retryAfterMs) || 3000, 500, 8000)));
      if (!state.destroyed) await send(false);
      return;
    }
    if (code === 'VALIDATION') setStatus(data.message, 'error');
    else if (code === 'RATE_LIMITED' || status === 429) setStatus(E.rateLimited, 'error');
    else if (code === 'ROBOT') setStatus(E.robot, 'error');
    else if (data && data.message) setStatus(data.message, 'error');
    else setStatus(E.server, 'error');
  }

  async function send(tryRetry = true) {
    if (state.sending && tryRetry) return;
    setSending(true);
    setStatus('');
    try {
      if (!state.session || Date.now() - state.sessionAt > SESSION_MAX_AGE_MS) await refreshSession();
      if (!state.session) {
        setStatus(E.network, 'error');
        return;
      }
      const values = collect();
      const body = {
        name: values.name,
        email: values.email,
        phone: values.phone,
        services: values.services,
        budget: values.budget,
        timeline: values.timeline,
        contactMethod: values.contactMethod,
        message: values.message,
        consent: true,
        formToken: state.session.formToken,
        turnstileToken: state.tsToken,
        website_url: honeypot.value
      };
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.session.csrfToken },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok && data && data.ok) {
        showSuccess(data);
        return;
      }
      await handleFailure(res.status, data, tryRetry);
    } catch {
      setStatus(E.network, 'error');
    } finally {
      if (!state.destroyed) setSending(false);
    }
  }

  D.listen(form, 'submit', (e) => {
    e.preventDefault();
    if (state.sending) return;
    state.retried = false;
    const bad = validateAll();
    if (bad) {
      setStatus('Vui lòng kiểm tra lại các trường được đánh dấu.', 'error');
      focusField(bad);
      return;
    }
    if (!state.tsToken) {
      tsErr.textContent = E.robot;
      setStatus(E.robot, 'error');
      return;
    }
    send(true);
  });

  // ---------- Thành công ----------
  let successEl = null;
  let flyer = null;
  let flyerDone = false;

  function showSuccess(data) {
    state.submitted = true;
    draft = null;
    const S = F.success;
    const again = el('button', { class: 'btn btn--ghost btn--3d', type: 'button', text: S.againLabel });
    const home = el('a', { class: 'btn btn--primary btn--3d', href: '#/1', text: S.homeLabel });
    successEl = el('div', { class: 'success', role: 'status' }, [
      el('h3', { class: 'success__title', text: S.title }),
      el('p', { text: data.message || S.text }),
      el('p', {}, [`${S.refLabel}: `, el('span', { class: 'success__ref', text: data.ref || '' })]),
      el('div', { class: 'hero__actions' }, [home, again])
    ]);
    portal.append(successEl);
    D.listen(again, 'click', resetForm);
    ctx.announce(`${S.title}. ${S.refLabel}: ${data.ref || ''}`);
    if (!ctx.reduced) {
      gsap.from(successEl, { opacity: 0, scale: 0.92, duration: 0.6, ease: 'power3.out' });
      gsap.from(successEl.children, { opacity: 0, y: 24, duration: 0.6, delay: 0.25, stagger: 0.1, ease: 'power2.out' });
    }
    home.focus({ preventScroll: true });
    flyAcross();
  }

  function flyAcross() {
    if (!ctx.gl || flyer || ctx.reduced) return;
    flyer = createPhoenix({ THREE, shared: sm.shared, quality: sm.quality, scale: 0.55 });
    loadPhoenixModel(flyer);
    const aspect = sm.width / sm.height;
    const sx = aspect < 0.9 ? 0.45 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-10 * sx, -2.5, 1),
      new THREE.Vector3(-4 * sx, 1.2, 2.5),
      new THREE.Vector3(3 * sx, 0.8, 1.5),
      new THREE.Vector3(10 * sx, 3.2, -1)
    ]);
    flyer.setPath(curve, { speed: 0.14, loop: false, u: 0 });
    group.add(flyer.root);
  }

  function resetForm() {
    if (successEl) {
      successEl.remove();
      successEl = null;
    }
    form.reset();
    state.touched.clear();
    state.submitted = false;
    counter.textContent = `0 / ${F.maxMessageLength}`;
    for (const name of Object.keys(fields)) setError(name, '');
    setStatus('');
    refreshSession();
    nameInput.focus({ preventScroll: true });
  }

  // ---------- Dịch vụ chọn sẵn từ trang 2 ----------
  function applyParams(params) {
    const wanted = String((params && (params.service || params.services)) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (wanted.length === 0) return;
    let any = false;
    serviceBoxes.forEach((b) => {
      if (wanted.includes(b.id)) {
        b.input.checked = true;
        any = true;
        if (!ctx.reduced) gsap.fromTo(b.node, { scale: 1.12 }, { scale: 1, duration: 0.6, ease: 'back.out(2)' });
      }
    });
    if (any) servicesField.classList.add('is-valid');
  }

  // ---------- Bản nháp ----------
  function restoreDraft() {
    if (!draft) return;
    nameInput.value = draft.name;
    emailInput.value = draft.email;
    phoneInput.value = draft.phone;
    budgetSelect.value = draft.budget;
    timelineSelect.value = draft.timeline;
    messageArea.value = draft.message;
    counter.textContent = `${messageArea.value.length} / ${F.maxMessageLength}`;
    serviceBoxes.forEach((b) => (b.input.checked = draft.services.includes(b.id)));
    methodRadios.forEach((r) => (r.input.checked = r.id === draft.contactMethod));
  }

  // ---------- Cổng lửa WebGL phía sau ----------
  let portalRings = null;
  let embers = null;
  if (ctx.gl) {
    portalRings = new THREE.Group();
    [3.4, 4.0, 4.6].forEach((radius, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: [0xff6a1a, 0xffb627, 0xa86bff][i],
        transparent: true,
        opacity: 0.5 - i * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      portalRings.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 8, 140), mat));
    });
    portalRings.position.z = -3;
    group.add(portalRings);

    const n = Math.round(220 * sm.quality.particles);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3.2 + Math.random() * 1.8;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.sin(a) * r;
      arr[i * 3 + 2] = -3 + (Math.random() - 0.5) * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    embers = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: glowTexture(THREE), size: 0.2, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa040 })
    );
    group.add(embers);
  }

  // ---------- Vòng đời ----------
  const scene = {
    id: 3,
    root,
    group,
    scrollEl: root,
    swipeNav: false,
    focusEl: root,

    rig(aspect) {
      return aspect < 0.9 ? { pos: [0, 0, 13], look: [0, 0, 0], fov: 50 } : { pos: [0, 0, 9.5], look: [0, 0, 0], fov: 50 };
    },

    resize() {},

    mount(params) {
      restoreDraft();
      applyParams(params);
      loadSession()
        .then(() => mountTurnstile())
        .catch(() => setStatus(E.network, 'error'));
    },

    setParams(params) {
      applyParams(params);
    },

    enter() {
      if (!ctx.reduced) {
        gsap.from([...head.children], { opacity: 0, y: 24, duration: 0.8, ease: 'power2.out', stagger: 0.12 });
        gsap.from(form, { opacity: 0, rotationX: -18, z: -240, y: 40, duration: 1.1, delay: 0.2, ease: 'power3.out', transformPerspective: 1400 });
      }
      return Promise.resolve();
    },

    update(dt, t) {
      state.glow = damp(state.glow, 0, 2.2, dt);
      if (portalRings) {
        const p = input.pointer;
        const k = 1 + state.glow * 0.05;
        portalRings.scale.set(k, k, k);
        portalRings.rotation.x = damp(portalRings.rotation.x, p.sy * 0.25, 4, dt);
        portalRings.rotation.y = damp(portalRings.rotation.y, p.sx * 0.3, 4, dt);
        portalRings.children.forEach((m, i) => {
          m.rotation.z = t * (0.12 + i * 0.06) * (i % 2 ? -1 : 1);
          m.material.opacity = 0.42 - i * 0.08 + state.glow * 0.25;
        });
        embers.rotation.z = t * 0.05;
      }
      if (flyer) {
        flyer.update(dt);
        if (!flyerDone && flyer.state.u >= 1) {
          flyerDone = true;
          flyer.root.visible = false;
        }
      }
    },

    onKey() {
      return false;
    },

    onLeave() {},

    dispose() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (!state.submitted) draft = collect();
      if (window.turnstile && state.tsWidget !== null) {
        try {
          window.turnstile.remove(state.tsWidget);
        } catch {
          /* bỏ qua */
        }
      }
      D.run();
      gsap.killTweensOf([...head.children, form, successEl, ...serviceBoxes.map((b) => b.node), ...Object.values(control)].filter(Boolean));
      if (flyer) flyer.dispose();
      disposeObject(group);
      root.remove();
    }
  };
  return scene;
}
