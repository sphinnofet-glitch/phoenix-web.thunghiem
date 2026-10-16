// =====================================================================
// server/security.js
// Kiểm tra biến môi trường, helmet + CSP (nonce), rate limit, CSRF,
// kiểm tra Origin/Referer, chặn theo quốc gia (tùy chọn), token ký HMAC.
// =====================================================================
import crypto from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const MIN_FILL_MS = 3000; // gửi nhanh hơn 3 giây bị từ chối
export const MAX_FILL_MS = 60 * 60 * 1000; // token cũ hơn 1 giờ bị từ chối

const SID_COOKIE = 'pw_sid';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;
const CONTROL_RE = /[\u0000-\u001F\u007F]/;
const TURNSTILE_TEST_KEY_RE = /^[123]x0{10,}/;
const STATIC_PATH_RE = /^\/(?:vendor|css|js|assets)\/|^\/favicon\.svg$/;

export class EnvError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.name = 'EnvError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------
// Đọc và kiểm tra biến môi trường. Thiếu hoặc sai => ném EnvError.
// ---------------------------------------------------------------------
export function validateEnv(src = process.env) {
  const errors = [];
  const warnings = [];
  const str = (key) => String(src[key] ?? '').trim();
  const isProd = str('NODE_ENV') === 'production';

  const port = Number.parseInt(str('PORT') || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const host = str('HOST') || '0.0.0.0';

  // --- SITE_ORIGIN ---
  const siteOrigins = [];
  const rawOrigins = str('SITE_ORIGIN');
  if (!rawOrigins) {
    errors.push('Thiếu SITE_ORIGIN (ví dụ: https://ten-mien-cua-ban.vn).');
  } else {
    for (const part of rawOrigins.split(',')) {
      const value = part.trim();
      if (!value) continue;
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
        if (isProd && url.protocol !== 'https:') {
          errors.push(`SITE_ORIGIN phải dùng https khi NODE_ENV=production: "${value}".`);
          continue;
        }
        siteOrigins.push(url.origin);
      } catch {
        errors.push(`SITE_ORIGIN không hợp lệ: "${value}".`);
      }
    }
    if (siteOrigins.length === 0 && errors.length === 0) {
      errors.push('SITE_ORIGIN không chứa origin hợp lệ nào.');
    }
  }
  const allowedHostnames = new Set(siteOrigins.map((o) => new URL(o).hostname.toLowerCase()));

  // --- trust proxy ---
  let trustProxy = false;
  const rawProxy = str('TRUST_PROXY');
  if (rawProxy && rawProxy !== 'false' && rawProxy !== '0') {
    if (/^\d+$/.test(rawProxy)) {
      trustProxy = Number(rawProxy);
    } else if (rawProxy.toLowerCase() === 'true') {
      errors.push('TRUST_PROXY=true không an toàn. Hãy đặt số tầng proxy (ví dụ 1).');
    } else {
      trustProxy = rawProxy; // ví dụ: loopback, 10.0.0.0/8
    }
  }

  // --- Bí mật ứng dụng ---
  const appSecret = String(src.APP_SECRET ?? '');
  if (appSecret.length < 32) {
    errors.push('Thiếu hoặc quá ngắn APP_SECRET (cần tối thiểu 32 ký tự ngẫu nhiên).');
  }

  // --- Turnstile ---
  const turnstileSiteKey = str('TURNSTILE_SITE_KEY');
  const turnstileSecret = str('TURNSTILE_SECRET_KEY');
  if (!turnstileSiteKey) errors.push('Thiếu TURNSTILE_SITE_KEY.');
  if (!turnstileSecret) errors.push('Thiếu TURNSTILE_SECRET_KEY.');
  const usingTestKeys =
    TURNSTILE_TEST_KEY_RE.test(turnstileSecret) || TURNSTILE_TEST_KEY_RE.test(turnstileSiteKey);
  if (usingTestKeys && isProd) {
    errors.push('Không được dùng khóa Turnstile thử nghiệm khi NODE_ENV=production.');
  } else if (usingTestKeys) {
    warnings.push('Đang dùng khóa Turnstile thử nghiệm: bỏ qua kiểm tra hostname (chỉ ở môi trường development).');
  }

  // --- SMTP (tùy chọn) ---
  const smtp = {
    host: str('SMTP_HOST'),
    port: Number.parseInt(str('SMTP_PORT') || '587', 10),
    secure: str('SMTP_SECURE').toLowerCase() === 'true',
    user: str('SMTP_USER'),
    pass: String(src.SMTP_PASS ?? ''),
    from: str('MAIL_FROM'),
    to: str('MAIL_TO')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
  smtp.configured = Boolean(smtp.host && smtp.user && smtp.pass && smtp.to.length > 0);
  if (!smtp.from) smtp.from = smtp.user;
  if (smtp.host || smtp.user || smtp.pass || smtp.to.length > 0) {
    if (!smtp.configured) {
      warnings.push('SMTP cấu hình chưa đủ (cần SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_TO): sẽ không gửi email.');
    } else {
      if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) {
        errors.push('SMTP_PORT không hợp lệ.');
      }
      for (const addr of smtp.to) {
        if (!EMAIL_RE.test(addr) || CONTROL_RE.test(addr)) errors.push(`MAIL_TO chứa địa chỉ không hợp lệ: "${addr}".`);
      }
      if (CONTROL_RE.test(smtp.from)) errors.push('MAIL_FROM chứa ký tự điều khiển không hợp lệ.');
    }
  }

  // --- Giới hạn quốc gia (tùy chọn) ---
  const geo = {
    enabled: str('GEO_ENABLED').toLowerCase() === 'true',
    allow: new Set(
      str('GEO_ALLOW_COUNTRIES')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
    header: (str('GEO_COUNTRY_HEADER') || 'CF-IPCountry').toLowerCase()
  };
  if (geo.enabled && geo.allow.size === 0) {
    errors.push('GEO_ENABLED=true nhưng GEO_ALLOW_COUNTRIES đang trống.');
  }

  if (errors.length > 0) throw new EnvError(errors);

  return {
    env: Object.freeze({
      nodeEnv: isProd ? 'production' : 'development',
      isProd,
      port,
      host,
      siteOrigins,
      allowedHostnames,
      trustProxy,
      appSecret,
      turnstileSiteKey,
      turnstileSecret,
      skipTurnstileHostCheck: usingTestKeys && !isProd,
      smtp: Object.freeze(smtp),
      dbPath: str('DB_PATH') || './data/phoenix.db',
      geo: Object.freeze(geo)
    }),
    warnings
  };
}

// ---------------------------------------------------------------------
// Tập khóa có thời hạn (chống dùng lại token / gửi trùng). Chạy trong 1 tiến trình.
// add() trả về false nếu khóa đã tồn tại và còn hạn.
// ---------------------------------------------------------------------
export function createTtlSet(ttlMs, maxSize = 50000) {
  const map = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [key, expires] of map) {
      if (expires <= now) map.delete(key);
    }
  };
  const timer = setInterval(sweep, Math.min(ttlMs, 60000));
  timer.unref();
  return {
    add(key) {
      const now = Date.now();
      const expires = map.get(key);
      if (expires !== undefined && expires > now) return false;
      if (map.size >= maxSize) {
        sweep();
        if (map.size >= maxSize) map.delete(map.keys().next().value);
      }
      map.set(key, now + ttlMs);
      return true;
    },
    close() {
      clearInterval(timer);
      map.clear();
    }
  };
}

// ---------------------------------------------------------------------
// Che dữ liệu cá nhân trong log
// ---------------------------------------------------------------------
export function maskEmail(email) {
  const value = String(email ?? '');
  const at = value.indexOf('@');
  if (at < 1) return '***';
  return `${value[0]}***@${value[at + 1] ?? ''}***`;
}

export function maskPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

// ---------------------------------------------------------------------
// Phản hồi lỗi JSON thống nhất (không lộ thông tin nội bộ)
// ---------------------------------------------------------------------
export function sendError(res, status, code, message, extra = {}) {
  if (res.headersSent) return;
  res.status(status).set('Cache-Control', 'no-store').json({ ok: false, code, message, ...extra });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Bộ middleware bảo mật gắn với cấu hình env
// ---------------------------------------------------------------------
export function createSecurity(env) {
  const b64u = (buf) => Buffer.from(buf).toString('base64url');
  const hmac = (purpose, data) =>
    crypto.createHmac('sha256', env.appSecret).update(`${purpose}:${data}`).digest();

  const allowedOrigins = new Set(env.siteOrigins);

  function signToken(purpose, payload) {
    const body = b64u(JSON.stringify(payload));
    return `${body}.${b64u(hmac(purpose, body))}`;
  }

  function verifyToken(purpose, token) {
    if (typeof token !== 'string' || token.length > 1000) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    if (!safeEqual(b64u(hmac(purpose, parts[0])), parts[1])) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      return payload && typeof payload === 'object' ? payload : null;
    } catch {
      return null;
    }
  }

  function hashIp(ip) {
    return hmac('ip', String(ip ?? '')).toString('hex').slice(0, 32);
  }

  function readSid(req) {
    const raw = readCookie(req, SID_COOKIE);
    if (!raw) return null;
    const [sid, sig] = raw.split('.');
    if (!sid || !sig || !/^[a-f0-9]{32}$/.test(sid)) return null;
    return safeEqual(b64u(hmac('sid', sid)), sig) ? sid : null;
  }

  const csrfTokenFor = (sid) => b64u(hmac('csrf', sid));

  // --- CSP nonce + helmet ---
  function nonce(req, res, next) {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  }

  const nonceSource = (req, res) => `'nonce-${res.locals.cspNonce}'`;

  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", nonceSource, 'https://challenges.cloudflare.com'],
        'style-src': ["'self'", nonceSource],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'"],
        'media-src': ["'self'"],
        'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
        'frame-src': ['https://challenges.cloudflare.com'],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(env.isProd ? { 'upgrade-insecure-requests': [] } : {})
      }
    },
    strictTransportSecurity: env.isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' }
  });

  function permissionsPolicy(req, res, next) {
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    next();
  }

  // --- Chặn theo quốc gia (mặc định tắt) ---
  let geoWarned = false;
  function geoGate(req, res, next) {
    if (!env.geo.enabled) return next();
    const country = req.get(env.geo.header);
    if (!country) {
      if (!geoWarned) {
        geoWarned = true;
        console.warn(
          `[security] GEO_ENABLED=true nhưng request không có header "${env.geo.header}". Không chặn; hãy kiểm tra proxy/CDN.`
        );
      }
      return next();
    }
    if (env.geo.allow.has(country.trim().toUpperCase())) return next();
    res.status(403).type('text/plain; charset=utf-8').send('Truy cập không khả dụng tại khu vực của bạn.');
  }

  // --- Rate limit ---
  // Giới hạn toàn site áp dụng cho trang và API. File tĩnh (/vendor, /css, /js, /assets)
  // không tính vì một lần tải trang đã gọi hàng chục module.
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => STATIC_PATH_RE.test(req.path),
    handler: (req, res) =>
      sendError(res, 429, 'RATE_LIMITED', 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.')
  });

  const formLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      sendError(
        res,
        429,
        'RATE_LIMITED',
        'Bạn đã gửi quá số lần cho phép trong một giờ. Vui lòng thử lại sau hoặc liên hệ trực tiếp với chúng tôi.'
      )
  });

  // --- Kiểm tra Origin / Referer cho mọi phương thức thay đổi dữ liệu ---
  function originGuard(req, res, next) {
    const method = req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

    const fetchSite = req.get('sec-fetch-site');
    const deny = () =>
      sendError(res, 403, 'BAD_ORIGIN', 'Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.');

    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return deny();

    let origin = req.get('origin');
    if (!origin || origin === 'null') {
      origin = null;
      const referer = req.get('referer');
      if (referer) {
        try {
          origin = new URL(referer).origin;
        } catch {
          origin = null;
        }
      }
    }
    if (!origin || !allowedOrigins.has(origin)) return deny();
    next();
  }

  // --- CSRF: cookie phiên ký số + token gửi qua header ---
  function sessionHandler(req, res) {
    let sid = readSid(req);
    if (!sid) {
      sid = crypto.randomBytes(16).toString('hex');
      res.cookie(SID_COOKIE, `${sid}.${b64u(hmac('sid', sid))}`, {
        httpOnly: true,
        sameSite: 'strict',
        secure: env.isProd,
        path: '/',
        maxAge: SESSION_MAX_AGE_MS
      });
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      csrfToken: csrfTokenFor(sid),
      formToken: signToken('form', {
        sid,
        iat: Date.now(),
        n: crypto.randomBytes(12).toString('base64url')
      }),
      turnstileSiteKey: env.turnstileSiteKey,
      minFillMs: MIN_FILL_MS,
      serverTime: Date.now()
    });
  }

  function csrfGuard(req, res, next) {
    const sid = readSid(req);
    const sent = req.get('x-csrf-token');
    if (!sid || !sent || !safeEqual(csrfTokenFor(sid), sent)) {
      return sendError(
        res,
        403,
        'CSRF',
        'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
        { refresh: true }
      );
    }
    req.sid = sid;
    next();
  }

  return {
    nonce,
    helmet: helmetMiddleware,
    permissionsPolicy,
    geoGate,
    globalLimiter,
    formLimiter,
    originGuard,
    csrfGuard,
    sessionHandler,
    signToken,
    verifyToken,
    hashIp
  };
}
