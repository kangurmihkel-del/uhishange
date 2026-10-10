import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, devices, expect } from '@playwright/test';

const baseURL = process.env.PREVIEW_URL || 'http://localhost:3000';
const output = resolve('docs/Testing/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const screenshots = [];
function observe(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
async function snapshot(page, name) {
  await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
  screenshots.push(name);
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  if (dimensions.content > dimensions.viewport + 1) throw new Error(name + ': horizontal overflow');
}
try {
  const desktop = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  observe(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ostja', exact: true })).toBeVisible();
  await snapshot(page, 'login-desktop');
  await page.getByRole('button', { name: 'Ostja', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Tere,/ })).toBeVisible();
  const list = await page.request.get('/api/v1/procurements');
  const rows = (await list.json()).procurements;
  await expect(page.getByRole('link', { name: /Sõpruse puiestee lumevaba talv/ })).toBeVisible();
  await snapshot(page, 'buyer-desktop');
  const demo = rows.find((row) => row.title === 'Sõpruse puiestee lumevaba talv');
  if (!demo) throw new Error('Seeded procurement missing');
  await page.goto('/#procurement/' + demo.id);
  await expect(page.getByRole('heading', { name: demo.title, exact: true })).toBeVisible();
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  await snapshot(page, 'procurement-desktop');
  await page.getByRole('button', { name: /^Naabrid ja kutsed/ }).click();
  await expect(page.getByRole('img', { name: /Hanke keskpunkt/ })).toBeVisible();
  await snapshot(page, 'neighbors-desktop');
  await page.getByRole('button', { name: 'Logi välja', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Administraator', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Administraator', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Põhinavigatsioon' })
    .getByRole('link', { name: 'Haldus', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Esindusõiguse taotlused', exact: true }),
  ).toBeVisible();
  await snapshot(page, 'admin-desktop');
  await desktop.close();

  const mobile = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const phone = await mobile.newPage();
  observe(phone);
  await phone.goto('/');
  await expect(phone.getByRole('button', { name: 'Ostja', exact: true })).toBeVisible();
  await snapshot(phone, 'login-mobile');
  await phone.getByRole('button', { name: 'Ostja', exact: true }).click();
  await expect(phone.getByRole('heading', { name: /^Tere,/ })).toBeVisible();
  await expect(phone.getByRole('link', { name: /Sõpruse puiestee lumevaba talv/ })).toBeVisible();
  await snapshot(phone, 'buyer-mobile');
  await phone.goto('/#procurement/' + demo.id);
  await expect(phone.getByRole('heading', { name: demo.title, exact: true })).toBeVisible();
  await snapshot(phone, 'procurement-mobile');
  await mobile.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log(JSON.stringify({ baseURL, screenshots, browserErrors: errors.length }));
} finally {
  await browser.close();
}
