import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  return keyBuf.length === derived.length && crypto.timingSafeEqual(keyBuf, derived);
}

/**
 * Opens and initializes the SQLite database (supports ':memory:' for isolated tests).
 */
export function createDatabase(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      customer_email TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      currency TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      event TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);

  const countUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  if (countUsers === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)'
    );
    // Synthetic demo credentials for QA sandbox verification only
    insertUser.run('admin@qa-sandbox.test', 'QA Admin', 'admin', hashPassword('AdminDemo!2026'));
    insertUser.run('operator@qa-sandbox.test', 'QA Operator', 'operator', hashPassword('OperatorDemo!2026'));

    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@qa-sandbox.test');
    const insertOrder = db.prepare(
      'INSERT INTO orders (reference, customer_email, amount_cents, currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertOrder.run('ORD-SEED-001', 'client1@example.test', 4500, 'USD', 'pending', admin.id, new Date().toISOString());
    insertOrder.run('ORD-SEED-002', 'client2@example.test', 12990, 'EUR', 'completed', admin.id, new Date().toISOString());
  }

  return db;
}
