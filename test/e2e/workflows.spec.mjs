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

  await page.locator('.desktop-profile-list [data-edit]').click();
  await page.locator('#node-form [name="name"]').fill('浏览器节点已编辑');
  await page.locator('[form="node-form"]').click();
  await expect(page.locator('.profile-table .name-cell strong')).toHaveText('浏览器节点已编辑');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.desktop-profile-list [data-delete]').click();
  await expect(page.locator('[data-profile-row]')).toHaveCount(0);
});

test('shows only protocol fields that matter', async ({ page }) => {
  await page.locator('.add-server-button').click();
  const form = page.locator('#node-form');
  await expect(form.locator('[name="uuid"]')).toBeVisible();
  await expect(form.locator('[name="password"]')).toBeHidden();

  await form.locator('[name="type"]').selectOption('trojan');
  await expect(form.locator('[name="uuid"]')).toBeHidden();
  await expect(form.locator('[name="password"]')).toBeVisible();

  await form.locator('[name="type"]').selectOption('custom');
  await expect(form.locator('[name="server"]')).toBeHidden();
  await expect(form.locator('[name="customConfigText"]')).toBeVisible();
  await page.locator('.modal-header [data-action="modal-close"]').click();
});

test('applies settings and controls the Xray core lifecycle', async ({ page }) => {
  await page.locator('.menu-strip [data-open="settings"]').click();
  await page.locator('#settings-form [name="mixedPort"]').fill('3320');
  await page.locator('#settings-form [name="metricsPort"]').fill('3321');
  await page.locator('[form="settings-form"]').click();
  await expect(page.locator('.overview-band')).toContainText('127.0.0.1:3320');

  await page.locator('.add-server-button').click();
  await page.locator('#node-form [name="name"]').fill('生命周期节点');
  await page.locator('#node-form [name="server"]').fill('example.com');
  await page.locator('#node-form [name="port"]').fill('443');
  await page.locator('#node-form [name="uuid"]').fill('22222222-2222-4222-8222-222222222222');
  await page.locator('[form="node-form"]').click();

  await page.locator('.desktop-profile-list [data-activate]').click();
  await expect(page.locator('.core-overview')).toContainText('运行中');
  await expect(page.locator('.core-overview')).toContainText('生命周期节点');
  await page.locator('[data-action="core-stop"]').click();
  await expect(page.locator('.core-overview')).toContainText('已停止');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.desktop-profile-list [data-delete]').click();
  await expect(page.locator('.desktop-profile-list [data-profile-row]')).toHaveCount(0);
});

test('saves routing and downloads a backup', async ({ page }) => {
  await page.locator('.menu-strip [data-open="routing"]').click();
  await page.locator('[data-route-mode="direct"]').click();
  await page.locator('[data-action="rule-add"]').click();
  await page.locator('[name="ruleName"]').fill('阻止测试域名');
  await page.locator('[name="ruleDomain"]').fill('domain:example.invalid');
  await page.locator('[name="ruleOutbound"]').selectOption('block');
  await page.locator('[form="routing-form"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('.menu-strip [data-open="backup"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="backup-download"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^webxray-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test('keeps the mobile empty state inside the viewport and switches themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.connection-button')).toContainText('已连接');
  const emptyState = await page.getByRole('heading', { name: '还没有节点' }).boundingBox();
  expect(emptyState).not.toBeNull();
  expect(emptyState.x).toBeGreaterThanOrEqual(0);
  expect(emptyState.x + emptyState.width).toBeLessThanOrEqual(390);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

  await page.locator('[data-action="theme"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(primary).toBe('#55c7b8');
});
