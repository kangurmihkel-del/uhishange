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
  await snapshot(page, 'buyer-desktop');
  const types = new Set(rows.map((row) => row.spec.formId || 'snow'));
  for (const type of ['snow', 'pest', 'energy', 'branches', 'other'])
    if (!types.has(type)) throw new Error('Missing demo service ' + type);
  await page.goto('/#procurements');
  await expect(page.getByLabel('Hanketüüp', { exact: true })).toBeVisible();
  await snapshot(page, 'service-types-desktop');
  const demo = rows.find((row) => row.title === 'Sõpruse puiestee lumevaba talv');
  if (!demo) throw new Error('Seeded procurement missing');
  await page.goto('/#procurement/' + demo.id);
  await expect(page.getByRole('heading', { name: demo.title, exact: true })).toBeVisible();
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('next-action').getByRole('button', { name: 'Kinnita liitumine', exact: true }),
  ).toBeVisible();
  await snapshot(page, 'procurement-desktop');
  await page.getByRole('button', { name: /^Naabrid ja kutsed/ }).click();
  await expect(page.getByRole('img', { name: /Hanke keskpunkt/ })).toBeVisible();
  await snapshot(page, 'neighbors-desktop');
  const pest = rows.find((row) => row.spec.formId === 'pest');
  await page.goto('/#procurement/' + pest.id);
  await expect(page.getByTestId('service-scope')).toContainText('Kahjuritõrje');
  await snapshot(page, 'pest-procurement-desktop');
  await page.getByRole('button', { name: 'Logi välja', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Naaberühistu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Naaberühistu', exact: true }).click();
  await page.goto('/#mailbox');
  await expect(page.getByTestId('mailbox-message').first()).toBeVisible();
  await snapshot(page, 'mailbox-desktop');
  await page
    .getByTestId('mailbox-message')
    .first()
    .getByRole('button', { name: 'Ava kiri', exact: true })
    .click();
  await expect(page.getByTestId('mailbox-detail')).toBeInViewport();
  await snapshot(page, 'mailbox-letter-desktop');
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
  await snapshot(phone, 'buyer-mobile');
  await phone.goto('/#new');
  await phone.getByLabel('Hanketüüp', { exact: true }).selectOption('branches');
  await phone.getByLabel('Vajalik on ka lõikamine', { exact: true }).check();
  await expect(
    phone.getByRole('textbox', { name: 'Lõikamistööde kirjeldus', exact: true }),
  ).toBeVisible();
  await snapshot(phone, 'branch-form-mobile');
  await phone.goto('/#procurement/' + demo.id);
  await expect(phone.getByRole('heading', { name: demo.title, exact: true })).toBeVisible();
  await snapshot(phone, 'procurement-mobile');
  await phone.getByRole('button', { name: 'Logi välja', exact: true }).click();
  await phone.getByRole('button', { name: 'Naaberühistu', exact: true }).click();
  await phone.goto('/#mailbox');
  await expect(phone.getByTestId('mailbox-message').first()).toBeVisible();
  await phone
    .getByTestId('mailbox-message')
    .first()
    .getByRole('button', { name: 'Ava kiri', exact: true })
    .click();
  await expect(phone.getByTestId('mailbox-detail')).toBeInViewport();
  await snapshot(phone, 'mailbox-letter-mobile');
  await mobile.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log(JSON.stringify({ baseURL, screenshots, browserErrors: errors.length }));
} finally {
  await browser.close();
}
