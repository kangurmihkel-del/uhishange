import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type {
  Commitment,
  Contract,
  Offer,
  Procurement,
  SessionResponse,
} from '../../src/shared/types.js';

export const testPassword = 'Demo2026!';
export const registrationPassword = 'Demo2026!!';
export const uniqueTitle = (prefix: string) =>
  prefix + ' ' + Date.now() + '-' + Math.floor(Math.random() * 100_000);
const origin = 'http://127.0.0.1:3001';

export async function login(
  page: Page,
  email = 'buyer1@demo.test',
  accountPassword = testPassword,
) {
  await page.goto('/');
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Parool', { exact: false }).fill(accountPassword);
  await page.getByRole('button', { name: 'Logi sisse', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Logi välja', exact: true })).toBeVisible();
}
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Logi välja', exact: true }).click();
  await expect(page.getByLabel('E-post', { exact: true })).toBeVisible();
}
export async function navigate(page: Page, name: string | RegExp) {
  const menu = page.getByRole('button', { name: 'Ava menüü', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Põhinavigatsioon' })
    .getByRole('link', { name, exact: true })
    .click();
}
export async function nextAction(page: Page, name: string) {
  await expect(page.getByTestId('procurement-flow')).toBeVisible();
  const action = page.getByTestId('next-action');
  await expect(action).toBeVisible();
  await action.getByRole('button', { name, exact: true }).click();
}
export async function expectResponsive(page: Page) {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}
export async function api<T>(request: APIRequestContext, path: string, data?: unknown): Promise<T> {
  const response =
    data === undefined
      ? await request.get('/api/v1' + path)
      : await request.post('/api/v1' + path, { data, headers: { Origin: origin } });
  const body = (await response.json()) as T;
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}

/** Prepare a contract through public operations and the actual durable processor. */
export async function finalizedFixture(request: APIRequestContext) {
  const session = await api<SessionResponse>(request, '/login', {
    email: 'buyer1@demo.test',
    password: testPassword,
  });
  const buyerId = session.memberships.find(
    (membership) =>
      membership.status === 'approved' &&
      membership.role === 'representative' &&
      membership.organization.orgType === 'BUYER',
  )!.organizationId;
  const deadline = new Date(Date.now() + 4_000).toISOString();
  const year = new Date().getUTCFullYear() + 1;
  const { procurement } = await api<{ procurement: Procurement }>(request, '/procurements', {
    organizationId: buyerId,
    title: uniqueTitle('Lepingu brauseritest'),
    description: 'Valmis lepingu ja hinnangu kontroll.',
    radiusM: 500,
    joinDeadlineAt: deadline,
    spec: {
      seasonStart: year + '-11-01',
      seasonEnd: year + 1 + '-04-01',
      areaM2: 300,
      parkingM2: 100,
      walkwayM: 50,
      triggerCm: 4,
      responseHours: 3,
      gritting: true,
      snowHauling: false,
    },
  });
  await api(request, '/procurements/' + procurement.id + '/publish', {});
  const supplier = await api<SessionResponse>(request, '/login', {
    email: 'supplier@demo.test',
    password: testPassword,
  });
  const { offer } = await api<{ offer: Offer }>(
    request,
    '/procurements/' + procurement.id + '/offers',
    {
      organizationId: supplier.memberships.find(
        (membership) =>
          membership.status === 'approved' &&
          membership.role === 'representative' &&
          membership.organization.orgType === 'SUPPLIER',
      )!.organizationId,
      basePriceCents: 100_000,
      depositCents: 10_003,
      terms: 'Teenuse kirjeldus vastavalt hankele.',
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      tiers: [{ minParticipants: 1, priceCents: 90_000 }],
    },
  );
  await api(request, '/login', { email: 'buyer1@demo.test', password: testPassword });
  await api(request, '/procurements/' + procurement.id + '/select-offer', { offerId: offer.id });
  const { commitment } = await api<{ commitment: Commitment }>(
    request,
    '/procurements/' + procurement.id + '/commitments',
    { organizationId: buyerId, authorityConfirmed: true, scopeConfirmed: true },
  );
  await api(request, '/test-payments/' + commitment.id, {
    outcome: 'captured',
    eventId: 'browser-' + commitment.id,
  });
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, new Date(deadline).getTime() - Date.now()) + 50),
  );
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_e2e'))
    throw new Error('Browser fixtures require the isolated _e2e database');
  const { processDueProcurements } = await import('../../src/server/domain.js');
  await processDueProcurements();
  const contracts = await api<{ contracts: Contract[] }>(request, '/contracts');
  const contract = contracts.contracts.find((row) => row.procurementId === procurement.id);
  expect(contract).toBeDefined();
  return { procurement, contract: contract! };
}

export async function failedJobFixture(request: APIRequestContext) {
  const session = await api<SessionResponse>(request, '/login', {
    email: 'buyer1@demo.test',
    password: testPassword,
  });
  const year = new Date().getUTCFullYear() + 1;
  const { procurement } = await api<{ procurement: Procurement }>(request, '/procurements', {
    organizationId: session.memberships.find(
      (membership) =>
        membership.status === 'approved' &&
        membership.role === 'representative' &&
        membership.organization.orgType === 'BUYER',
    )!.organizationId,
    title: uniqueTitle('Taustatöö brauseritest'),
    description: 'Ebaõnnestunud töö uuesti käivitamine.',
    radiusM: 500,
    joinDeadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
    spec: {
      seasonStart: year + '-11-01',
      seasonEnd: year + 1 + '-04-01',
      areaM2: 300,
      parkingM2: 100,
      walkwayM: 50,
      triggerCm: 4,
      responseHours: 3,
      gritting: true,
      snowHauling: false,
    },
  });
  await api(request, '/procurements/' + procurement.id + '/publish', {});
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_e2e'))
    throw new Error('Browser job fixture requires isolated _e2e database');
  const { pool } = await import('../../src/server/db.js');
  await pool.query('UPDATE jobs SET status=$1,last_error=$2,attempts=$3 WHERE procurement_id=$4', [
    'FAILED',
    'Browser recovery fixture',
    1,
    procurement.id,
  ]);
  return procurement;
}
