import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createAppServer } from '../../app/server.mjs';

let server;
let baseUrl;
let adminToken;
let operatorToken;

before(async () => {
  const created = createAppServer({ dbPath: ':memory:', sessionSecret: 'api-test-secret' });
  server = created.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@qa-sandbox.test', password: 'AdminDemo!2026' }),
  });
  adminToken = (await adminLogin.json()).token;

  const opLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operator@qa-sandbox.test', password: 'OperatorDemo!2026' }),
  });
  operatorToken = (await opLogin.json()).token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('unauthenticated requests return 401', async () => {
  const res = await fetch(`${baseUrl}/api/orders`);
  assert.equal(res.status, 401);
});

test('operator cannot delete orders or register webhooks (RBAC 403)', async () => {
  const delRes = await fetch(`${baseUrl}/api/orders/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  assert.equal(delRes.status, 403);

  const hookRes = await fetch(`${baseUrl}/api/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${operatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: 'https://hooks.example.test/events' }),
  });
  assert.equal(hookRes.status, 403);
});

test('idempotency key replays 200 for identical payload and returns 409 for mutated payload', async () => {
  const key = 'idem-api-test-001';
  const payload = {
    reference: 'ORD-IDEM-01',
    customerEmail: 'qa@example.test',
    amount: 75.25,
    currency: 'USD',
  };

  const first = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.data.reference, 'ORD-IDEM-01');

  const replay = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload),
  });
  assert.equal(replay.status, 200);
  const replayBody = await replay.json();
  assert.equal(replayBody.idempotentReplay, true);
  assert.equal(replayBody.data.id, firstBody.data.id);

  const conflict = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({ ...payload, amount: 999 }),
  });
  assert.equal(conflict.status, 409);
});

test('concurrent creation with same reference creates exactly one record', async () => {
  const requests = Array.from({ length: 5 }, () =>
    fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference: 'ORD-RACE-99',
        customerEmail: 'race@example.test',
        amount: 20,
        currency: 'USD',
      }),
    })
  );

  const responses = await Promise.all(requests);
  const statuses = responses.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 1);
  assert.equal(statuses.filter((s) => s === 409).length, 4);
});

test('SQL injection payload in search query is safely parameterized', async () => {
  const malicious = encodeURIComponent("' OR 1=1 --");
  const res = await fetch(`${baseUrl}/api/orders?q=${malicious}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 0);
});

test('webhook endpoint enforces SSRF guard and accepts valid HTTPS endpoints', async () => {
  const ssrf = await fetch(`${baseUrl}/api/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
  });
  assert.equal(ssrf.status, 422);

  const ok = await fetch(`${baseUrl}/api/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: 'https://hooks.example.test/orders', event: 'order.created' }),
  });
  assert.equal(ok.status, 201);
});
