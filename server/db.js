// =====================================================================
// server/db.js
// SQLite (better-sqlite3). 100% câu lệnh tham số hóa, không nối chuỗi.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDb(dbPath) {
  const absolute = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });

  const db = new Database(absolute);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Câu lệnh DDL tĩnh, không chứa dữ liệu người dùng.
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at     TEXT    NOT NULL,
      name           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      phone          TEXT    NOT NULL,
      services       TEXT    NOT NULL DEFAULT '[]',
      budget         TEXT    NOT NULL DEFAULT '',
      timeline       TEXT    NOT NULL DEFAULT '',
      contact_method TEXT    NOT NULL DEFAULT '',
      message        TEXT    NOT NULL DEFAULT '',
      consent_at     TEXT    NOT NULL,
      ip_hash        TEXT    NOT NULL DEFAULT '',
      user_agent     TEXT    NOT NULL DEFAULT '',
      content_hash   TEXT    NOT NULL,
      mail_status    TEXT    NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_content
      ON submissions (content_hash, created_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_created
      ON submissions (created_at);
  `);

  const insertStmt = db.prepare(`
    INSERT INTO submissions
      (created_at, name, email, phone, services, budget, timeline,
       contact_method, message, consent_at, ip_hash, user_agent,
       content_hash, mail_status)
    VALUES
      (@created_at, @name, @email, @phone, @services, @budget, @timeline,
       @contact_method, @message, @consent_at, @ip_hash, @user_agent,
       @content_hash, 'pending')
  `);

  const duplicateStmt = db.prepare(`
    SELECT id FROM submissions
    WHERE content_hash = ? AND created_at >= ?
    ORDER BY id DESC
    LIMIT 1
  `);

  const mailStatusStmt = db.prepare(`UPDATE submissions SET mail_status = ? WHERE id = ?`);

  return {
    path: absolute,

    // Trả về id (số nguyên) của đơn vừa lưu.
    insert(submission) {
      const info = insertStmt.run(submission);
      return Number(info.lastInsertRowid);
    },

    // Tìm đơn trùng nội dung kể từ mốc thời gian ISO `sinceIso`. Trả về id hoặc null.
    findRecentDuplicate(contentHash, sinceIso) {
      const row = duplicateStmt.get(contentHash, sinceIso);
      return row ? Number(row.id) : null;
    },

    setMailStatus(id, status) {
      mailStatusStmt.run(status, id);
    },

    close() {
      if (db.open) db.close();
    }
  };
}
