import { expect, test } from '@playwright/test';

const token = 'webxray-playwright-token-20260728';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('webxray-api-token', value), token);
  await page.goto('/');
  await expect(page.locator('.connection-button')).toContainText('已连接');
});

test('saves forms whose hidden id field shadows the native form id property', async ({ page }) => {
  await page.locator('.menu-strip [data-open="subscriptions"]').click();
  await page.locator('#subscription-form [name="name"]').fill('浏览器订阅');
  await page.locator('#subscription-form [name="url"]').fill('https://example.com/sub');
  await page.locator('#subscription-form button[type="submit"]').click();
  await expect(page.locator('.subscription-item strong')).toHaveText('浏览器订阅');

  await page.locator('[data-sub-edit]').click();
  await page.locator('#subscription-form [name="name"]').fill('浏览器订阅已编辑');
  await page.locator('#subscription-form button[type="submit"]').click();
  await expect(page.locator('.subscription-item strong')).toHaveText('浏览器订阅已编辑');

  await page.locator('#subscription-form [name="name"]').fill('错误订阅');
  await page.locator('#subscription-form [name="url"]').fill('file:///invalid');
  await page.locator('#subscription-form button[type="submit"]').click();
  await expect(page.locator('.form-error')).toContainText('订阅仅支持 HTTP 或 HTTPS');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-sub-delete]').click();
  await expect(page.locator('.subscription-item')).toHaveCount(0);
  await page.locator('.modal-header [data-action="modal-close"]').click();

  await page.locator('.add-server-button').click();
  await page.locator('#node-form [name="name"]').fill('浏览器节点');
  await page.locator('#node-form [name="server"]').fill('example.com');
  await page.locator('#node-form [name="port"]').fill('443');
  await page.locator('#node-form [name="uuid"]').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('[form="node-form"]').click();
  await expect(page.locator('.profile-table .name-cell strong')).toHaveText('浏览器节点');

  await page.locator('[data-edit]').click();
  await page.locator('#node-form [name="name"]').fill('浏览器节点已编辑');
  await page.locator('[form="node-form"]').click();
  await expect(page.locator('.profile-table .name-cell strong')).toHaveText('浏览器节点已编辑');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-delete]').click();
  await expect(page.locator('[data-profile-row]')).toHaveCount(0);
});

test('keeps the mobile empty state inside the viewport and switches themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.connection-button')).toContainText('已连接');
  const emptyState = await page.getByRole('heading', { name: '没有服务器' }).boundingBox();
  expect(emptyState).not.toBeNull();
  expect(emptyState.x).toBeGreaterThanOrEqual(0);
  expect(emptyState.x + emptyState.width).toBeLessThanOrEqual(390);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

  await page.locator('[data-action="theme"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(primary).toBe('#5ba9d6');
});
