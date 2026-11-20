import { expect, test } from '@playwright/test';

test.describe('OrderFlow QA Sandbox E2E', () => {
  test('rejects invalid login and authenticates admin flow end-to-end', async ({ page }) => {
    await page.goto('/');

    // Negative test: invalid credentials
    await page.fill('#login-email', 'admin@qa-sandbox.test');
    await page.fill('#login-password', 'WrongPassword!');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('Invalid credentials');

    // Positive login as admin
    await page.fill('#login-password', 'AdminDemo!2026');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('#webhooks-card')).toBeVisible();

    // Create a new order through UI
    await page.fill('#order-ref', 'ORD-E2E-777');
    await page.fill('#order-email', 'e2e@example.test');
    await page.fill('#order-amount', '150.75');
    await page.selectOption('#order-currency', 'USD');
    await page.click('#order-form button[type="submit"]');

    await expect(page.locator('#order-feedback')).toContainText('ORD-E2E-777');
    const row = page.locator('#orders-tbody tr', { hasText: 'ORD-E2E-777' });
    await expect(row).toBeVisible();

    // Update order status and filter
    await row.locator('select').selectOption('completed');
    await page.fill('#search-input', 'ORD-E2E-777');
    await expect(page.locator('#orders-tbody tr')).toHaveCount(1);

    // Register safe webhook and verify SSRF block in UI
    await page.fill('#webhook-url', 'http://127.0.0.1:9000/internal');
    await page.click('#webhook-form button[type="submit"]');
    await expect(page.locator('#webhook-feedback')).toContainText('blocked');

    await page.fill('#webhook-url', 'https://hooks.example.test/e2e');
    await page.click('#webhook-form button[type="submit"]');
    await expect(page.locator('#webhook-list')).toContainText('https://hooks.example.test/e2e');

    // Delete created order
    await row.locator('button', { hasText: 'Delete' }).click();
    await expect(page.locator('#orders-tbody tr', { hasText: 'ORD-E2E-777' })).toHaveCount(0);
  });

  test('enforces operator RBAC restrictions and mobile responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.fill('#login-email', 'operator@qa-sandbox.test');
    await page.fill('#login-password', 'OperatorDemo!2026');
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('#webhooks-card')).toBeHidden();
    await expect(page.locator('#orders-tbody button', { hasText: 'Delete' })).toHaveCount(0);
  });
});
