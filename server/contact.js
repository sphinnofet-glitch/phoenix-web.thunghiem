// =====================================================================
// server/contact.js
// POST /api/contact: kiểm tra Origin + CSRF, validate (zod), honeypot,
// token thời gian ký số, xác minh Turnstile phía server, chống gửi trùng,
// lưu DB, gửi mail (không làm hỏng luồng nếu mail lỗi).
// =====================================================================
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { CONFIG } from '../public/js/config.js';
import { MIN_FILL_MS, MAX_FILL_MS, createTtlSet, maskEmail, maskPhone, sendError } from './security.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_MAX_AGE_MS = 5 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const LINE_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;
const TEXT_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g;

// Chuẩn hóa chuỗi một dòng: bỏ ký tự điều khiển/ẩn, gộp khoảng trắng.
const cleanLine = (s) =>
  s.normalize('NFC').replace(INVISIBLE_RE, '').replace(LINE_CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();

// Chuẩn hóa văn bản nhiều dòng: giữ xuống dòng và tab, bỏ ký tự điều khiển khác.
const cleanText = (s) =>
  s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_RE, '')
    .replace(TEXT_CONTROL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const PHONE_MOBILE_RE = /^0(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\d)\d{7}$/;
const PHONE_LANDLINE_RE = /^02\d{9}$/;

function normalizePhone(raw) {
  let p = raw.replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  else if (/^84\d{9,10}$/.test(p)) p = `0${p.slice(2)}`;
  return p;
}

const log = {
  info: (msg, meta) => console.log(`[contact] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[contact] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[contact] ${msg}`, meta ?? '')
};

// Lấy danh sách hợp lệ (whitelist) từ public/js/config.js để server là nguồn sự thật.
function buildLookups() {
  const fail = (msg) => {
    throw new Error(`public/js/config.js không hợp lệ: ${msg}`);
  };
  const toMap = (list, labelKey, where) => {
    if (!Array.isArray(list) || list.length === 0) fail(`thiếu hoặc rỗng ${where}`);
    const map = new Map();
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || item.id === '') fail(`${where} có mục thiếu "id"`);
      map.set(item.id, String(item[labelKey] ?? item.id));
    }
    return map;
  };
  if (!CONFIG || typeof CONFIG !== 'object') fail('không export được CONFIG');
  if (!CONFIG.form || typeof CONFIG.form !== 'object') fail('thiếu CONFIG.form');
  return {
    services: toMap(CONFIG.services, 'name', 'CONFIG.services'),
    budgets: toMap(CONFIG.form.budgets, 'label', 'CONFIG.form.budgets'),
    timelines: toMap(CONFIG.form.timelines, 'label', 'CONFIG.form.timelines'),
    contactMethods: toMap(CONFIG.form.contactMethods, 'label', 'CONFIG.form.contactMethods')
  };
}

function buildSchema(lookups) {
  const msg = (m) => ({ required_error: m, invalid_type_error: m });

  const optionalChoice = (map, errMsg) =>
    z
      .string(msg(errMsg))
      .max(80, errMsg)
      .transform(cleanLine)
      .refine((v) => v === '' || map.has(v), errMsg)
      .optional()
      .default('');

  return z
    .object({
      name: z
        .string(msg('Vui lòng nhập họ tên.'))
        .max(400, 'Họ tên quá dài.')
        .transform(cleanLine)
        .pipe(
          z
            .string()
            .min(2, 'Họ tên cần ít nhất 2 ký tự.')
            .max(100, 'Họ tên tối đa 100 ký tự.')
            .refine((v) => /\p{L}/u.test(v), 'Họ tên không hợp lệ.')
        ),
      email: z
        .string(msg('Vui lòng nhập email.'))
        .max(400, 'Email quá dài.')
        .transform(cleanLine)
        .pipe(
          z
            .string()
            .min(1, 'Vui lòng nhập email.')
            .max(254, 'Email quá dài.')
            .email('Email không hợp lệ.')
        )
        .transform((v) => v.toLowerCase()),
      phone: z
        .string(msg('Vui lòng nhập số điện thoại.'))
        .max(60, 'Số điện thoại không hợp lệ.')
        .transform((v) => normalizePhone(cleanLine(v)))
        .pipe(
          z
            .string()
            .min(1, 'Vui lòng nhập số điện thoại.')
            .refine(
              (v) => PHONE_MOBILE_RE.test(v) || PHONE_LANDLINE_RE.test(v),
              'Số điện thoại Việt Nam không hợp lệ (ví dụ 0901234567 hoặc +84901234567).'
            )
        ),
      services: z
        .array(z.string().max(80))
        .max(20, 'Chọn quá nhiều dịch vụ.')
        .optional()
        .default([])
        .refine((arr) => arr.every((id) => lookups.services.has(id)), 'Dịch vụ không hợp lệ.')
        .transform((arr) => [...new Set(arr)]),
      budget: optionalChoice(lookups.budgets, 'Ngân sách không hợp lệ.'),
      timeline: optionalChoice(lookups.timelines, 'Thời gian mong muốn không hợp lệ.'),
      contactMethod: optionalChoice(lookups.contactMethods, 'Hình thức liên hệ không hợp lệ.'),
      message: z
        .string(msg('Mô tả yêu cầu không hợp lệ.'))
        .max(4000, 'Mô tả tối đa 2000 ký tự.')
        .transform(cleanText)
        .pipe(z.string().max(2000, 'Mô tả tối đa 2000 ký tự.'))
        .optional()
        .default(''),
      consent: z.literal(true, {
        errorMap: () => ({ message: 'Bạn cần đồng ý cho chúng tôi xử lý dữ liệu cá nhân để gửi yêu cầu.' })
      }),
      formToken: z.string(msg('Phiên biểu mẫu không hợp lệ.')).min(1, 'Phiên biểu mẫu không hợp lệ.').max(600),
      turnstileToken: z
        .string(msg('Vui lòng hoàn tất bước xác minh bạn không phải robot.'))
        .min(1, 'Vui lòng hoàn tất bước xác minh bạn không phải robot.')
        .max(2100),
      website_url: z.unknown().optional()
    })
    .strict();
}

export function createContactRouter({ env, security, db, mailer }) {
  const lookups = buildLookups();
  const schema = buildSchema(lookups);
  const usedFormNonces = createTtlSet(2 * 60 * 60 * 1000);
  const usedTurnstileTokens = createTtlSet(30 * 60 * 1000);

  // Xác minh token Turnstile phía server. Ném lỗi nếu không liên lạc được Cloudflare.
  async function verifyTurnstile(token, ip) {
    const body = new URLSearchParams();
    body.set('secret', env.turnstileSecret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);

    const resp = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error(`Turnstile HTTP ${resp.status}`);
    const data = await resp.json();

    if (!data || data.success !== true) {
      const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].join(',') : 'unknown';
      return { ok: false, reason: codes };
    }
    if (!env.skipTurnstileHostCheck) {
      const hostname = String(data.hostname ?? '').toLowerCase();
      if (!hostname || !env.allowedHostnames.has(hostname)) return { ok: false, reason: 'hostname-mismatch' };
    }
    if (data.challenge_ts) {
      const age = Date.now() - Date.parse(data.challenge_ts);
      if (Number.isFinite(age) && age > TURNSTILE_MAX_AGE_MS) return { ok: false, reason: 'expired' };
    }
    return { ok: true };
  }

  const router = express.Router();

  router.post(
    '/',
    security.formLimiter,
    security.originGuard,
    security.csrfGuard,
    express.json({ limit: '10kb', type: 'application/json' }),
    async (req, res, next) => {
      try {
        if (!req.is('application/json')) {
          return sendError(res, 415, 'UNSUPPORTED', 'Định dạng yêu cầu không được hỗ trợ.');
        }
        const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

        // 1) Honeypot: bot điền ô bẫy => giả vờ thành công, không lưu.
        if (String(raw.website_url ?? '').trim() !== '') {
          log.warn('Honeypot bị kích hoạt, bỏ qua đơn.', { ip: security.hashIp(req.ip).slice(0, 8) });
          return res.json({
            ok: true,
            ref: 'PW-000000',
            message: 'Cảm ơn bạn! Chúng tôi đã nhận được yêu cầu.'
          });
        }

        // 2) Validate đầy đủ phía server (nguồn sự thật duy nhất).
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          const fields = {};
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0] ?? 'form');
            if (!fields[key]) fields[key] = issue.message;
          }
          return sendError(res, 422, 'VALIDATION', 'Vui lòng kiểm tra lại các trường được đánh dấu.', { fields });
        }
        const d = parsed.data;

        // 3) Token thời gian ký số: gắn với phiên, không quá nhanh, không quá cũ.
        const form = security.verifyToken('form', d.formToken);
        if (!form || form.sid !== req.sid || !Number.isFinite(form.iat) || typeof form.n !== 'string') {
          return sendError(res, 400, 'TOKEN_INVALID', 'Phiên biểu mẫu không hợp lệ. Vui lòng thử lại.', {
            refresh: true
          });
        }
        const age = Date.now() - form.iat;
        if (age < MIN_FILL_MS) {
          return sendError(res, 400, 'TOO_FAST', 'Bạn thao tác quá nhanh. Vui lòng đợi vài giây rồi gửi lại.', {
            retryAfterMs: MIN_FILL_MS - age + 250
          });
        }
        if (age > MAX_FILL_MS) {
          return sendError(res, 400, 'TOKEN_EXPIRED', 'Phiên biểu mẫu đã hết hạn. Vui lòng gửi lại.', {
            refresh: true
          });
        }

        // 4) Chống gửi trùng/nhấn nhiều lần: mỗi token chỉ dùng một lần (đồng bộ, không race).
        if (!usedFormNonces.add(form.n)) {
          return sendError(res, 409, 'DUPLICATE', 'Yêu cầu này đang được xử lý hoặc đã được gửi.', {
            refresh: true
          });
        }

        // 5) Turnstile: từ chối token dùng lại, hết hạn, sai hostname.
        const tokenHash = crypto.createHash('sha256').update(d.turnstileToken).digest('hex');
        if (!usedTurnstileTokens.add(tokenHash)) {
          return sendError(res, 400, 'ROBOT', 'Xác minh không hợp lệ. Vui lòng thử lại.', { refresh: true });
        }
        let verdict;
        try {
          verdict = await verifyTurnstile(d.turnstileToken, req.ip);
        } catch (err) {
          log.error(`Không liên lạc được Cloudflare Turnstile: ${err.message}`);
          return sendError(
            res,
            503,
            'VERIFY_UNAVAILABLE',
            'Không thể xác minh lúc này. Vui lòng thử lại sau ít phút.',
            { refresh: true }
          );
        }
        if (!verdict.ok) {
          log.warn(`Turnstile từ chối: ${verdict.reason}`);
          return sendError(
            res,
            400,
            'ROBOT',
            'Xác minh không thành công. Vui lòng hoàn tất bước xác minh và thử lại.',
            { refresh: true }
          );
        }

        // 6) Chống trùng nội dung trong 10 phút.
        const contentHash = crypto
          .createHash('sha256')
          .update([d.email, d.phone, d.message, d.services.join(',')].join('\u0000'))
          .digest('hex');
        const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
        const existingId = db.findRecentDuplicate(contentHash, sinceIso);
        if (existingId !== null) {
          log.info('Đơn trùng nội dung, không lưu lại.', { email: maskEmail(d.email) });
          return res.json({
            ok: true,
            duplicate: true,
            ref: `PW-${String(existingId).padStart(6, '0')}`,
            message: 'Chúng tôi đã nhận được yêu cầu của bạn trước đó và sẽ phản hồi sớm nhất.'
          });
        }

        // 7) Lưu DB (tham số hóa).
        const createdAt = new Date().toISOString();
        const id = db.insert({
          created_at: createdAt,
          name: d.name,
          email: d.email,
          phone: d.phone,
          services: JSON.stringify(d.services),
          budget: d.budget,
          timeline: d.timeline,
          contact_method: d.contactMethod,
          message: d.message,
          consent_at: createdAt,
          ip_hash: security.hashIp(req.ip),
          user_agent: String(req.get('user-agent') ?? '').replace(LINE_CONTROL_RE, ' ').slice(0, 200),
          content_hash: contentHash
        });
        const ref = `PW-${String(id).padStart(6, '0')}`;
        log.info(`Đã lưu đơn ${ref}`, { email: maskEmail(d.email), phone: maskPhone(d.phone) });

        // 8) Gửi mail ở nền: lỗi mail không ảnh hưởng kết quả trả về cho khách.
        if (!mailer.configured) {
          log.warn(`SMTP chưa cấu hình: đơn ${ref} đã lưu vào DB nhưng chưa gửi email thông báo.`);
          db.setMailStatus(id, 'skipped');
        } else {
          mailer
            .send({
              ref,
              createdAt,
              name: d.name,
              email: d.email,
              phone: d.phone,
              serviceLabels: d.services.map((s) => lookups.services.get(s)),
              budgetLabel: d.budget ? lookups.budgets.get(d.budget) : '',
              timelineLabel: d.timeline ? lookups.timelines.get(d.timeline) : '',
              contactMethodLabel: d.contactMethod ? lookups.contactMethods.get(d.contactMethod) : '',
              message: d.message
            })
            .then(() => db.setMailStatus(id, 'sent'))
            .catch((err) => {
              log.error(`Gửi email cho đơn ${ref} thất bại: ${err.message}`);
              try {
                db.setMailStatus(id, 'failed');
              } catch {
                /* bỏ qua */
              }
            });
        }

        return res.json({
          ok: true,
          ref,
          message: 'Cảm ơn bạn! Chúng tôi đã nhận được yêu cầu và sẽ phản hồi sớm nhất.'
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.close = () => {
    usedFormNonces.close();
    usedTurnstileTokens.close();
  };

  return router;
}
