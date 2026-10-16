# Phoenix Web

Website 3D giới thiệu và nhận đơn dịch vụ **thiết kế website**. Giao diện tiếng Việt, 4 cảnh (`#/1` đến `#/4`), Node.js + Express phía server, HTML/CSS/JS ES Modules thuần phía client (không bundler, không framework).

## 1. Yêu cầu

- Node.js **20 LTS trở lên** (`node -v`).
- Máy build được `better-sqlite3` (thường có sẵn binary dựng sẵn; nếu `npm install` báo lỗi biên dịch, cài công cụ build: Windows `windows-build-tools`/Visual Studio Build Tools, macOS `xcode-select --install`, Ubuntu `sudo apt install build-essential python3`).

## 2. Cài đặt nhanh (chạy thử trên máy)

```bash
cd phoenix-web
npm install
cp .env.example .env
```

Mở `.env` và điền tối thiểu:

1. `APP_SECRET`: chuỗi ngẫu nhiên từ 32 ký tự. Tạo bằng:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. `TURNSTILE_SITE_KEY` và `TURNSTILE_SECRET_KEY`: khi chạy thử có thể dùng khóa thử nghiệm của Cloudflare (xem mục 3).
3. `SITE_ORIGIN=http://localhost:3000`.

Sau đó:

```bash
npm start        # chạy thường
npm run dev      # tự khởi động lại khi sửa file server
```

Mở http://localhost:3000. Nếu thiếu biến bắt buộc, server dừng ngay và in rõ biến nào thiếu.

## 3. Lấy khóa Cloudflare Turnstile

1. Đăng nhập https://dash.cloudflare.com (tạo tài khoản miễn phí nếu chưa có).
2. Vào **Turnstile** > **Add widget**.
3. Đặt tên widget, thêm tên miền website (ví dụ `phoenix.vn`; khi thử cục bộ thêm `localhost`), chọn chế độ **Managed**.
4. Cloudflare cấp hai khóa:
   - **Site key**: khóa công khai, điền vào `TURNSTILE_SITE_KEY`. Server gửi khóa này cho trình duyệt qua `/api/session`, nên mã client không chứa khóa.
   - **Secret key**: bí mật, điền vào `TURNSTILE_SECRET_KEY`, không bao giờ để lộ.

**Khóa thử nghiệm (chỉ development):**

| Loại | Giá trị |
| --- | --- |
| Site key luôn vượt qua | `1x00000000000000000000AA` |
| Secret key luôn vượt qua | `1x0000000000000000000000000000000AA` |

Khi dùng khóa thử nghiệm, server bỏ qua kiểm tra hostname và in cảnh báo. Ở `NODE_ENV=production`, server **từ chối khởi động** nếu phát hiện khóa thử nghiệm.

## 4. Cấu hình SMTP (email thông báo đơn mới)

Điền các biến trong `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ban@gmail.com
SMTP_PASS=mat-khau-ung-dung
MAIL_FROM="Phoenix Web <ban@gmail.com>"
MAIL_TO=chu-website@ten-mien.vn
```

- Cổng `587` dùng `SMTP_SECURE=false` (STARTTLS); cổng `465` dùng `SMTP_SECURE=true`.
- Gmail: bật xác minh 2 bước rồi tạo **Mật khẩu ứng dụng** (App password), không dùng mật khẩu đăng nhập thường.
- Có thể dùng dịch vụ gửi mail chuyên dụng (Brevo, Mailgun, Amazon SES, Zoho...) với thông tin SMTP tương ứng.
- **Nếu để trống SMTP**: đơn vẫn được lưu vào DB, server ghi cảnh báo rõ ràng khi khởi động và mỗi lần có đơn mới. Luồng nhận đơn không bị hỏng.
- Gửi mail chạy nền. Trạng thái lưu ở cột `mail_status` của bảng `submissions` (`sent`, `failed`, `skipped`).

## 5. Sửa nội dung trong `public/js/config.js`

Toàn bộ chữ, dịch vụ, thông tin đơn vị, liên kết và số liệu nằm trong **một file duy nhất**: `public/js/config.js`. Các chỗ cần thay bằng thông tin thật được ghi chú `// THAY: ...`.

Quy ước quan trọng (server dùng chính file này làm danh sách hợp lệ cho biểu mẫu):

- Mỗi dịch vụ trong `CONFIG.services` **bắt buộc có `id` duy nhất** (chữ thường, không dấu, dùng dấu gạch ngang) và `name`.
- `CONFIG.form.budgets`, `CONFIG.form.timelines`, `CONFIG.form.contactMethods` là các mảng `{ id, label }`.
- Sau khi sửa `config.js`, **khởi động lại server** (`npm start`) để server nạp lại danh sách hợp lệ. Trình duyệt chỉ cần tải lại trang.
- File này chạy được cả ở Node lẫn trình duyệt, nên **không dùng `window`, `document` hay API trình duyệt** trong `config.js`.

## 6. Triển khai production

### 6.1. Biến môi trường

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
SITE_ORIGIN=https://ten-mien-cua-ban.vn
TRUST_PROXY=1
APP_SECRET=<chuỗi ngẫu nhiên >= 32 ký tự>
TURNSTILE_SITE_KEY=<khóa thật>
TURNSTILE_SECRET_KEY=<khóa thật>
```

Ở production:

- `SITE_ORIGIN` bắt buộc là `https://...` (có thể liệt kê thêm `https://www...`, ngăn cách bằng dấu phẩy). Origin này được dùng để chống CSRF và kiểm tra hostname Turnstile.
- Cookie phiên tự bật cờ `Secure`, HSTS và `upgrade-insecure-requests` được bật.
- `TRUST_PROXY` là **số tầng proxy** phía trước ứng dụng (thường là `1`). Đặt sai sẽ làm rate limit nhận nhầm IP.

### 6.2. HTTPS và reverse proxy (ví dụ Nginx)

Cấp chứng chỉ bằng Let's Encrypt (`certbot --nginx -d ten-mien-cua-ban.vn`). Cấu hình mẫu:

```nginx
server {
    listen 80;
    server_name ten-mien-cua-ban.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ten-mien-cua-ban.vn;

    ssl_certificate     /etc/letsencrypt/live/ten-mien-cua-ban.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ten-mien-cua-ban.vn/privkey.pem;

    client_max_body_size 16k;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Với Caddy, chỉ cần `ten-mien-cua-ban.vn { reverse_proxy 127.0.0.1:3000 }` (HTTPS tự động).

### 6.3. Chạy nền bền vững

Dùng systemd (ví dụ `/etc/systemd/system/phoenix-web.service`):

```ini
[Unit]
Description=Phoenix Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/phoenix-web
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=phoenix
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now phoenix-web
sudo journalctl -u phoenix-web -f
```

Có thể dùng PM2 thay thế: `pm2 start server/index.js --name phoenix-web`.

### 6.4. Giới hạn theo quốc gia (tùy chọn, mặc định tắt)

Đặt `GEO_ENABLED=true` và `GEO_ALLOW_COUNTRIES=VN` khi website nằm sau Cloudflare (header `CF-IPCountry`). Chỉ bật khi origin đã **chặn truy cập trực tiếp** (chỉ nhận kết nối từ Cloudflare), vì header này có thể bị giả nếu truy cập thẳng vào server. Nếu bật mà request không có header, server ghi cảnh báo và không chặn.

## 7. Sao lưu cơ sở dữ liệu

DB là file SQLite tại `DB_PATH` (mặc định `data/phoenix.db`, chế độ WAL nên có thêm `-wal` và `-shm`). **Không** chỉ copy file `.db` khi server đang chạy. Dùng một trong hai cách an toàn:

```bash
# Cách 1: công cụ sqlite3 (sao lưu nhất quán khi server đang chạy)
mkdir -p backups
sqlite3 data/phoenix.db ".backup 'backups/phoenix-$(date +%F).db'"

# Cách 2: dừng server rồi chép cả 3 file
sudo systemctl stop phoenix-web
cp data/phoenix.db* backups/
sudo systemctl start phoenix-web
```

Lịch sao lưu hằng ngày bằng cron:

```cron
0 3 * * * cd /srv/phoenix-web && sqlite3 data/phoenix.db ".backup 'backups/phoenix-$(date +\%F).db'" && find backups -name 'phoenix-*.db' -mtime +30 -delete
```

Nên chép thư mục `backups/` sang nơi lưu trữ khác máy chủ. Xem dữ liệu đơn:

```bash
sqlite3 -header -column data/phoenix.db "SELECT id, created_at, name, phone, mail_status FROM submissions ORDER BY id DESC LIMIT 20;"
```

Dữ liệu cá nhân của khách được lưu để liên hệ báo giá. Hãy đặt thời hạn lưu trữ và xóa theo chính sách quyền riêng tư của đơn vị (Nghị định 13/2023/NĐ-CP).

## 8. Tóm tắt các lớp bảo mật

- Helmet với CSP nghiêm ngặt (`script-src 'self'` + nonce + Turnstile, không `unsafe-inline`, không `unsafe-eval`), `frame-ancestors 'none'`, HSTS ở production, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, tắt `X-Powered-By`.
- Rate limit: 100 yêu cầu/phút/IP cho trang và API (file tĩnh `/vendor`, `/css`, `/js`, `/assets` không tính vì một lần tải trang gọi nhiều module); 5 lần gửi form/giờ/IP.
- CSRF: kiểm tra `Origin`/`Referer` + `Sec-Fetch-Site`, token CSRF ký HMAC gắn với cookie phiên (`HttpOnly`, `SameSite=Strict`, `Secure` ở production). Không bật CORS.
- Biểu mẫu: validate bằng zod ở server (whitelist dịch vụ lấy từ `config.js`), giới hạn body 10 KB, loại ký tự điều khiển/ký tự ẩn, chống CRLF injection, thoát HTML trong email, truy vấn SQL tham số hóa.
- Chống robot: Turnstile xác minh phía server (kiểm tra `success`, hostname, token dùng lại/hết hạn), ô honeypot, token thời gian ký HMAC (từ 3 giây đến 1 giờ), mỗi token chỉ dùng một lần.
- Log không chứa dữ liệu cá nhân đầy đủ (email/điện thoại bị che), IP chỉ lưu dưới dạng băm HMAC.

Lưu ý: bộ nhớ chống dùng lại token nằm trong tiến trình. Nếu chạy nhiều tiến trình/máy chủ song song, cần thay bằng kho dùng chung (ví dụ Redis).
