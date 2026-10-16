// =====================================================================
// public/js/router.js
// Router theo hash: #/1 ... #/4, kèm tham số tùy chọn: #/3?service=landing-page
// - Khi đang chuyển cảnh mà người dùng thao tác tiếp, chỉ giữ lại đích cuối cùng (pending).
// - Có đồng hồ an toàn: nếu một lần chuyển cảnh treo quá lâu, router tự mở khóa, không bao giờ kẹt.
// =====================================================================

const SAFETY_MS = 6000;

export class Router {
  constructor({ pages = 4, onNavigate }) {
    this.pages = pages;
    this.onNavigate = onNavigate;
    this.current = null; // { page, params, key }
    this.pending = null;
    this.busy = false;
    this.started = false;
    this.handler = () => this.handleHash();
  }

  static keyOf(page, params) {
    const entries = Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b));
    return `${page}?${entries.map(([k, v]) => `${k}=${v}`).join('&')}`;
  }

  parse(hash = window.location.hash) {
    const match = /^#\/(\d+)(?:\?(.*))?$/.exec(hash || '');
    if (!match) return null;
    const page = Number(match[1]);
    if (!Number.isInteger(page) || page < 1 || page > this.pages) return null;
    const params = {};
    if (match[2]) {
      for (const [key, value] of new URLSearchParams(match[2])) {
        if (key.length <= 40 && value.length <= 200) params[key] = value;
      }
    }
    return { page, params };
  }

  get page() {
    return this.current ? this.current.page : 1;
  }

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('hashchange', this.handler);
    const target = this.parse();
    if (!target) {
      // Hash không hợp lệ hoặc rỗng: về trang 1 mà không thêm mục vào lịch sử.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/1`);
      this.request({ page: 1, params: {} }, true);
    } else {
      this.request(target, true);
    }
  }

  stop() {
    window.removeEventListener('hashchange', this.handler);
    this.started = false;
  }

  handleHash() {
    const target = this.parse();
    if (!target) {
      window.location.hash = `#/${this.page}`;
      return;
    }
    this.request(target, false);
  }

  go(page, params = {}) {
    const clamped = Math.min(this.pages, Math.max(1, Math.round(page)));
    const query = new URLSearchParams(params).toString();
    const hash = `#/${clamped}${query ? `?${query}` : ''}`;
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }

  next() {
    this.go(Math.min(this.pages, this.pageTarget() + 1));
  }

  prev() {
    this.go(Math.max(1, this.pageTarget() - 1));
  }

  // Trang đích gần nhất (tính cả yêu cầu đang chờ) để bấm liên tiếp đi đúng hướng.
  pageTarget() {
    return this.pending ? this.pending.page : this.page;
  }

  request(target, first) {
    const key = Router.keyOf(target.page, target.params);
    if (this.busy) {
      this.pending = { ...target, key };
      return;
    }
    if (this.current && this.current.key === key) return;
    this.run({ ...target, key }, first);
  }

  async run(target, first) {
    this.busy = true;
    const from = this.current ? this.current.page : null;
    const same = from === target.page && this.current !== null;
    const dir = from === null ? 1 : target.page >= from ? 1 : -1;
    const safety = window.setTimeout(() => {
      console.warn('[router] chuyển cảnh quá lâu, tự mở khóa.');
      this.busy = false;
    }, SAFETY_MS);
    try {
      await this.onNavigate({ from, to: target.page, params: target.params, dir, first, same });
      this.current = { page: target.page, params: target.params, key: target.key };
    } catch (err) {
      console.error('[router] lỗi chuyển cảnh:', err);
      if (!this.current) this.current = { page: target.page, params: target.params, key: target.key };
    } finally {
      window.clearTimeout(safety);
      this.busy = false;
    }
    const next = this.pending;
    this.pending = null;
    if (next && (!this.current || next.key !== this.current.key)) this.run(next, false);
  }
}
