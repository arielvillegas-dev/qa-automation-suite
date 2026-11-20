import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, verifyPassword } from './db.mjs';
import {
  ALLOWED_STATUSES,
  hashPayload,
  isSafeWebhookUrl,
  validateOrderPayload,
} from './validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function readJsonBody(req, limitBytes = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, reqPath) {
  const safeRel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, safeRel);
  if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return false;
  }
  const ext = path.extname(fullPath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(fullPath).pipe(res);
  return true;
}

export function createAppServer({ dbPath = ':memory:', sessionSecret = 'demo-qa-session-secret' } = {}) {
  const db = createDatabase(dbPath);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      if (serveStatic(res, pathname)) return;
      return sendJson(res, 404, { error: 'Not found' });
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', service: 'qa-automation-suite', timestamp: new Date().toISOString() });
    }

    let body = {};
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        if (err.message === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Payload too large' });
        return sendJson(res, 400, { error: 'Malformed JSON body' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const user = db.prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?').get(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }
      const token = signToken(
        { sub: user.id, email: user.email, name: user.name, role: user.role, exp: Date.now() + 3600_000 },
        sessionSecret
      );
      return sendJson(res, 200, {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    }

    // Protected routes below
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = verifyToken(bearer, sessionSecret);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      return sendJson(res, 200, { user: { id: session.sub, email: session.email, name: session.name, role: session.role } });
    }

    if (req.method === 'GET' && pathname === '/api/orders') {
      const q = (url.searchParams.get('q') || '').trim();
      const status = (url.searchParams.get('status') || '').trim();
      let sql = 'SELECT id, reference, customer_email, amount_cents, currency, status, created_at FROM orders WHERE 1=1';
      const params = [];
      if (q) {
        sql += ' AND (reference LIKE ? OR customer_email LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY id DESC';
      const orders = db.prepare(sql).all(...params);
      return sendJson(res, 200, { data: orders });
    }

    if (req.method === 'POST' && pathname === '/api/orders') {
      const idempotencyKey = (req.headers['idempotency-key'] || '').toString().trim();
      const validation = validateOrderPayload(body);
      if (!validation.valid) {
        return sendJson(res, 422, { error: 'Validation failed', details: validation.errors });
      }

      const normalized = validation.data;
      const reqHash = hashPayload(normalized);

      if (idempotencyKey) {
        const existing = db.prepare('SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE idempotency_key = ?').get(idempotencyKey);
        if (existing) {
          if (existing.request_hash !== reqHash) {
            return sendJson(res, 409, { error: 'Idempotency-Key reused with different payload' });
          }
          return sendJson(res, 200, { ...JSON.parse(existing.response_json), idempotentReplay: true });
        }
      }

      const dupRef = db.prepare('SELECT id FROM orders WHERE reference = ?').get(normalized.reference);
      if (dupRef) {
        return sendJson(res, 409, { error: 'Order reference already exists' });
      }

      const now = new Date().toISOString();
      const insert = db.prepare(
        'INSERT INTO orders (reference, customer_email, amount_cents, currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const result = insert.run(
        normalized.reference,
        normalized.customerEmail,
        normalized.amountCents,
        normalized.currency,
        'pending',
        session.sub,
        now
      );

      const created = db.prepare(
        'SELECT id, reference, customer_email, amount_cents, currency, status, created_at FROM orders WHERE id = ?'
      ).get(result.lastInsertRowid);

      const responseObj = { data: created };
      if (idempotencyKey) {
        db.prepare(
          'INSERT INTO idempotency_keys (idempotency_key, request_hash, status_code, response_json, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(idempotencyKey, reqHash, 201, JSON.stringify(responseObj), now);
      }

      return sendJson(res, 201, responseObj);
    }

    const orderMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
    if (orderMatch) {
      const orderId = Number(orderMatch[1]);
      if (req.method === 'PATCH') {
        const nextStatus = typeof body.status === 'string' ? body.status.trim() : '';
        if (!ALLOWED_STATUSES.has(nextStatus)) {
          return sendJson(res, 422, { error: 'Invalid status' });
        }
        const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
        if (!existing) return sendJson(res, 404, { error: 'Order not found' });

        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(nextStatus, orderId);
        const updated = db.prepare(
          'SELECT id, reference, customer_email, amount_cents, currency, status, created_at FROM orders WHERE id = ?'
        ).get(orderId);
        return sendJson(res, 200, { data: updated });
      }

      if (req.method === 'DELETE') {
        if (session.role !== 'admin') {
          return sendJson(res, 403, { error: 'Forbidden: admin role required to delete orders' });
        }
        const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
        if (!existing) return sendJson(res, 404, { error: 'Order not found' });
        db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
        return sendJson(res, 200, { deleted: true, id: orderId });
      }
    }

    if (pathname === '/api/webhooks') {
      if (session.role !== 'admin') {
        return sendJson(res, 403, { error: 'Forbidden: admin role required for webhooks' });
      }
      if (req.method === 'GET') {
        const rows = db.prepare('SELECT id, url, event, created_at FROM webhooks ORDER BY id DESC').all();
        return sendJson(res, 200, { data: rows });
      }
      if (req.method === 'POST') {
        const check = isSafeWebhookUrl(body.url);
        if (!check.safe) {
          return sendJson(res, 422, { error: check.reason });
        }
        const event = typeof body.event === 'string' && body.event.trim() ? body.event.trim() : 'order.created';
        const now = new Date().toISOString();
        const resInsert = db.prepare('INSERT INTO webhooks (url, event, created_by, created_at) VALUES (?, ?, ?, ?)').run(
          check.url,
          event,
          session.sub,
          now
        );
        const created = db.prepare('SELECT id, url, event, created_at FROM webhooks WHERE id = ?').get(resInsert.lastInsertRowid);
        return sendJson(res, 201, { data: created });
      }
    }

    return sendJson(res, 404, { error: 'Endpoint not found' });
  });

  return { server, db };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4100);
  const dbPath = process.env.DB_PATH || './data/qa_sandbox.sqlite';
  const sessionSecret = process.env.SESSION_SECRET || 'demo-qa-session-secret';
  const { server } = createAppServer({ dbPath, sessionSecret });
  server.listen(port, '127.0.0.1', () => {
    console.log(`OrderFlow QA Sandbox running on http://127.0.0.1:${port}`);
  });
}
