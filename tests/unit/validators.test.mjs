import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPayload, isSafeWebhookUrl, validateOrderPayload } from '../../app/validators.mjs';

test('validateOrderPayload accepts valid USD and EUR orders', () => {
  const res = validateOrderPayload({
    reference: 'ORD-2026-10',
    customerEmail: 'Buyer@Example.Test ',
    amount: 49.95,
    currency: 'eur',
  });
  assert.equal(res.valid, true);
  assert.deepEqual(res.data, {
    reference: 'ORD-2026-10',
    customerEmail: 'buyer@example.test',
    amountCents: 4995,
    currency: 'EUR',
  });
});

test('validateOrderPayload rejects negative, missing, and invalid currency inputs', () => {
  const res = validateOrderPayload({
    reference: 'x',
    customerEmail: 'not-an-email',
    amount: -5,
    currency: 'BTC',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.reference);
  assert.ok(res.errors.customerEmail);
  assert.ok(res.errors.amount);
  assert.ok(res.errors.currency);
});

test('isSafeWebhookUrl blocks SSRF internal targets and non-http schemes', () => {
  const blocked = [
    'http://127.0.0.1:8080/hook',
    'http://localhost/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/internal',
    'http://192.168.1.10/api',
    'file:///etc/passwd',
  ];
  for (const url of blocked) {
    assert.equal(isSafeWebhookUrl(url).safe, false, `Expected ${url} to be blocked`);
  }

  assert.equal(isSafeWebhookUrl('https://hooks.example.test/orders').safe, true);
});

test('hashPayload is deterministic regardless of key insertion order', () => {
  const h1 = hashPayload({ b: 2, a: 1 });
  const h2 = hashPayload({ a: 1, b: 2 });
  assert.equal(h1, h2);
});
