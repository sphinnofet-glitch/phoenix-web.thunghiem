// =====================================================================
// server/index.js
// Khởi tạo Express: kiểm tra env, helmet + CSP (nonce), nén, rate limit,
// phục vụ Three.js/GSAP từ node_modules qua /vendor, static, API.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import dotenv from 'dotenv';
import express from 'express';
import { createContactRouter } from './contact.js';
import { openDb } from './db.js';
import { createMailer } from './mailer.js';
import { createSecurity, validateEnv } from './security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const NODE_MODULES = path.join(ROOT, 'node_modules');

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

// ---------- 1) Kiểm tra cấu hình lúc khởi động ----------
let env;
let warnings;
try {
  ({ env, warnings } = validateEnv(process.env));
} catch (err) {
  console.error('\n[PHOENIX] Không thể khởi động do cấu hình .env chưa đúng:');
  for (const line of err.errors ?? [err.message]) console.error(`  - ${line}`);
  console.error('\nHãy sao chép .env.example thành .env rồi điền đầy đủ (xem README.md).\n');
  process.exit(1);
}

// ---------- 2) Khởi tạo thành phần ----------
const security = createSecurity(env);
const db = openDb(path.resolve(ROOT, env.dbPath));
const mailer = createMailer(env.smtp);

let contactRouter;
try {
  contactRouter = createContactRouter({ env, security, db, mailer });
} catch (err) {
  console.error(`\n[PHOENIX] ${err.message}\n`);
  db.close();
  process.exit(1);
}

for (const w of warnings) console.warn(`[PHOENIX] Cảnh báo: ${w}`);
if (!mailer.configured) {
  console.warn('[PHOENIX] Cảnh báo: SMTP chưa cấu hình. Đơn mới vẫn được lưu vào DB nhưng KHÔNG gửi email thông báo.');
}
for (const dep of ['three/build/three.module.js', 'gsap/index.js']) {
  if (!fs.existsSync(path.join(NODE_MODULES, dep))) {
    console.warn(`[PHOENIX] Cảnh báo: thiếu node_modules/${dep}. Hãy chạy "npm install".`);
  }
}

// ---------- 3) Express ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

app.use(security.nonce);
app.use(security.helmet);
app.use(security.permissionsPolicy);
app.use(compression());
app.use(security.geoGate);
app.use(security.globalLimiter);

// Trang chính: chèn nonce CSP vào importmap nội tuyến. Phải đặt trước static.
const indexPath = path.join(PUBLIC_DIR, 'index.html');
let cachedIndex = null;
function renderIndex(res) {
  let template = cachedIndex;
  if (!template) {
    template = fs.readFileSync(indexPath, 'utf8');
    if (env.isProd) cachedIndex = template;
  }
  return template.replaceAll('__CSP_NONCE__', res.locals.cspNonce);
}
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const html = renderIndex(res);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Thư viện vendor: chỉ mở đúng thư mục cần thiết.
const vendorOptions = { index: false, dotfiles: 'ignore', maxAge: env.isProd ? '7d' : 0, immutable: env.isProd };
app.use('/vendor/three/build', express.static(path.join(NODE_MODULES, 'three/build'), vendorOptions));
app.use('/vendor/three/examples/jsm', express.static(path.join(NODE_MODULES, 'three/examples/jsm'), vendorOptions));
app.use(
  '/vendor/gsap',
  (req, res, next) => (/\.js$/.test(req.path) ? next() : res.sendStatus(404)),
  express.static(path.join(NODE_MODULES, 'gsap'), vendorOptions)
);

// File tĩnh của site.
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: 'ignore',
    etag: true,
    maxAge: env.isProd ? '1h' : 0,
    setHeaders(res, filePath) {
      if (/\.(glb|svg|woff2)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  })
);

// API.
app.get('/api/session', security.sessionHandler);
app.use('/api/contact', contactRouter);

// 404.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).set('Cache-Control', 'no-store').json({ ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy.' });
  }
  res.status(404).type('text/plain; charset=utf-8').send('Không tìm thấy trang.');
});

// Xử lý lỗi: không lộ stack trace hay thông tin nội bộ ra client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const isApi = req.path.startsWith('/api/');
  let status = 500;
  let code = 'SERVER';
  let message = 'Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại sau.';

  if (err && err.type === 'entity.too.large') {
    status = 413;
    code = 'TOO_LARGE';
    message = 'Dữ liệu gửi lên quá lớn.';
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_JSON';
    message = 'Dữ liệu gửi lên không hợp lệ.';
  } else {
    console.error(`[PHOENIX] Lỗi không mong đợi: ${err && err.message ? err.message : 'không rõ'}`);
  }

  if (isApi) return res.status(status).set('Cache-Control', 'no-store').json({ ok: false, code, message });
  res.status(status).type('text/plain; charset=utf-8').send(message);
});

// ---------- 4) Chạy và tắt an toàn ----------
const server = app.listen(env.port, env.host, () => {
  console.log(`[PHOENIX] Đang chạy tại http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`[PHOENIX] Origin được phép: ${env.siteOrigins.join(', ')}`);
  console.log(`[PHOENIX] Email thông báo: ${mailer.configured ? 'bật' : 'tắt (SMTP chưa cấu hình)'}`);
  console.log(`[PHOENIX] Giới hạn quốc gia: ${env.geo.enabled ? [...env.geo.allow].join(',') : 'tắt'}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[PHOENIX] Nhận ${signal}, đang tắt...`);
  server.close(() => {
    contactRouter.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
