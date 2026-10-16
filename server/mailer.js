// =====================================================================
// server/mailer.js
// Gửi email thông báo đơn mới qua SMTP (Nodemailer).
// Nếu SMTP chưa cấu hình: không lỗi, chỉ trả về { sent: false }.
// =====================================================================
import nodemailer from 'nodemailer';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

// Chống chèn header (CRLF injection): mọi giá trị đưa vào header phải là một dòng.
const oneLine = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ')
    .trim();

export function createMailer(smtp) {
  if (!smtp.configured) {
    return {
      configured: false,
      async send() {
        return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });

  return {
    configured: true,

    // rec: { ref, createdAt, name, email, phone, serviceLabels[], budgetLabel,
    //        timelineLabel, contactMethodLabel, message }
    async send(rec) {
      const services = rec.serviceLabels.length > 0 ? rec.serviceLabels.join(', ') : '(chưa chọn)';
      const rows = [
        ['Mã đơn', rec.ref],
        ['Thời gian', rec.createdAt],
        ['Họ tên', rec.name],
        ['Email', rec.email],
        ['Số điện thoại', rec.phone],
        ['Dịch vụ quan tâm', services],
        ['Ngân sách dự kiến', rec.budgetLabel || '(chưa chọn)'],
        ['Thời gian mong muốn', rec.timelineLabel || '(chưa chọn)'],
        ['Liên hệ ưa thích', rec.contactMethodLabel || '(chưa chọn)']
      ];

      const text =
        rows.map(([label, value]) => `${label}: ${value}`).join('\n') +
        `\n\nMô tả yêu cầu:\n${rec.message || '(không có)'}\n`;

      const htmlRows = rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px;border:1px solid #ddd;background:#f7f3ee;font-weight:bold">${escapeHtml(label)}</td>` +
            `<td style="padding:6px 12px;border:1px solid #ddd">${escapeHtml(value)}</td></tr>`
        )
        .join('');
      const html =
        `<div style="font-family:Arial,Helvetica,sans-serif;color:#222">` +
        `<h2 style="color:#c2410c">Đơn dịch vụ mới</h2>` +
        `<table style="border-collapse:collapse">${htmlRows}</table>` +
        `<h3>Mô tả yêu cầu</h3>` +
        `<p>${escapeHtml(rec.message || '(không có)').replace(/\n/g, '<br>')}</p>` +
        `</div>`;

      await transporter.sendMail({
        from: smtp.from,
        to: smtp.to,
        replyTo: { name: oneLine(rec.name).slice(0, 100), address: oneLine(rec.email) },
        subject: `Đơn dịch vụ mới ${oneLine(rec.ref)} - ${oneLine(rec.name).slice(0, 60)}`,
        text,
        html
      });
      return { sent: true };
    }
  };
}
