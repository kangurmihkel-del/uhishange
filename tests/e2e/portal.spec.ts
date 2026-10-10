import { test, expect } from '@playwright/test';
import {
  api,
  expectResponsive,
  failedJobFixture,
  finalizedFixture,
  login,
  logout,
  navigate,
  registrationPassword,
  uniqueTitle,
} from './helpers.js';
import type {
  AdminResponse,
  Invitation,
  ProcurementDetail,
  SessionResponse,
} from '../../src/shared/types.js';

test.afterAll(async () => {
  const { pool } = await import('../../src/server/db.js');
  await pool.end();
});

test('buyer, supplier and neighboring buyers reach a lower tier through the portal', async ({
  page,
}) => {
  await login(page);
  await expectResponsive(page);
  await page.getByRole('link', { name: 'Uus hange', exact: true }).click();
  const title = uniqueTitle('Brauseri ühine lumekoristus');
  await page.getByLabel('Hanke pealkiri', { exact: true }).fill(title);
  await page
    .getByLabel('Kirjeldus', { exact: true })
    .fill('Parkimisala ja kõnniteede ühine talvine hooldus.');
  await page.getByLabel('Koristusala (m²)', { exact: true }).fill('600');
  await page.getByRole('button', { name: 'Salvesta hange', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const id = page.url().split('#procurement/')[1];
  expect(id).toBeTruthy();
  await page.getByRole('button', { name: 'Avalda hange', exact: true }).click();
  await expect(page.getByText('Liitumine avatud', { exact: true })).toBeVisible();
  const created = await api<ProcurementDetail>(page.request, '/procurements/' + id);
  await api(page.request, '/organizations', {
    registryCode: 'MAP-' + Date.now(),
    name: uniqueTitle('Kaardi kattuv KÜ'),
    orgType: 'BUYER',
    address: 'Sama hoov, Mustamäe',
    latitude: created.procurement.locationLatitude,
    longitude: created.procurement.locationLongitude,
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Naabrid ja kutsed/ }).click();
  const map = page.getByRole('img', { name: /Hanke keskpunkt ja läheduses olevad ühistud/ });
  await expect(map).toBeVisible();
  await page.getByRole('button', { name: 'Suurenda kaarti', exact: true }).click();
  await expect(map).toContainText('333 m skaalaraadius');
  await page.getByRole('button', { name: 'Vähenda kaarti', exact: true }).click();
  await map.getByRole('button').first().click();
  await expect(
    page.getByText('Vali kaardil ühistu, et vaadata kaugust.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Saada kutsed', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Piirkonna ühistutele on saadetud' }),
  ).toBeVisible();
  await expectResponsive(page);
  await logout(page);
  await login(page, 'supplier@demo.test');
  await page.goto('/#procurement/' + id);
  await page.getByRole('button', { name: /^Pakkumised/ }).click();
  await page.getByRole('button', { name: 'Esita pakkumine', exact: true }).click();
  await page.getByLabel('Hooaja tavahind (€)', { exact: true }).fill('1000');
  await page.getByLabel('Tagatisraha (€)', { exact: true }).fill('100.03');
  await page.getByLabel(/^Osalejate arv(?! 2)/).fill('2');
  await page.getByLabel('Hooaja hind (€)', { exact: true }).fill('900');
  await page.getByLabel('Osalejate arv 2', { exact: true }).fill('3');
  await page.getByLabel('Hooaja hind (€) 2', { exact: true }).fill('700');
  await page
    .getByLabel('Pakkumise tingimused', { exact: true })
    .fill('Õigeaegne lumekoristus ja libedusetõrje vastavalt teenuse ulatusele.');
  await page.getByRole('button', { name: 'Saada pakkumine', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pakkumine on esitatud.' }),
  ).toBeVisible();
  await logout(page);
  await login(page);
  await page.goto('/#procurement/' + id);
  await page.getByRole('button', { name: /^Pakkumised/ }).click();
  await page.getByRole('button', { name: 'Vali pakkumine', exact: true }).click();
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  for (let index = 1; index <= 3; index++) {
    if (index > 1) {
      await logout(page);
      await login(page, 'buyer' + index + '@demo.test');
      await page.goto('/#procurement/' + id);
    }
    const join = page.getByRole('button', { name: 'Liitu hankega', exact: true });
    await expect(join).toBeDisabled();
    await page
      .getByRole('checkbox', {
        name: 'Kinnitan, et mul on õigus ühistu nimel kohustusi võtta.',
        exact: true,
      })
      .check();
    await page
      .getByRole('checkbox', {
        name: 'Kinnitan ühise teenuse ulatuse, pakkumise ja tagatisraha tingimused.',
        exact: true,
      })
      .check();
    await join.click();
    if (index === 1) {
      await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
      const history = page.getByTestId('agreement-history');
      await expect(history).toContainText(
        'Õigeaegne lumekoristus ja libedusetõrje vastavalt teenuse ulatusele.',
      );
      await expect(history).toContainText('Koristusala');
      await expect(history).toContainText('600 m²');
      await expect(history).toContainText(
        'Esindusõigus ja ühise teenuse ulatus kinnitatud liitumisel.',
      );
      await expect(history).toContainText('Liitumine kinnitatud');
      await expect(history).toContainText('100,03');
      await expect(history.locator('pre')).toHaveCount(0);
      await expectResponsive(page);
      await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
      await page
        .getByRole('button', { name: 'Simuleeri makse ebaõnnestumist', exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Ebaõnnestunud testmakse on salvestatud' }),
      ).toBeVisible();
    }
    await expect(
      page.getByText('TESTMAKSE · Tegelikku raha ei liigu', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Kinnita testmakse', exact: true }).click();
    await expect(page.getByText(index + ' makstud liitumist', { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Ühine eesmärk on saavutatud!', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-price')).toContainText(/700\s*€/);
  await page.getByRole('button', { name: 'Loobu hankest', exact: true }).click();
  await expect(page.getByText(/Hange on õnnestunud. Loobumisel jääb/)).toBeVisible();
  await page.getByRole('button', { name: 'Kinnita loobumine', exact: true }).click();
  await expect(page.getByText('2 makstud liitumist', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-price')).toContainText(/700\s*€/);
  await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
  await expect(page.getByTestId('agreement-history')).toContainText('Liitumine kinnitatud');
  await expect(page.getByTestId('agreement-history')).toContainText('100,03');
  await expectResponsive(page);
  const final = await api<ProcurementDetail>(page.request, '/procurements/' + id);
  expect(final.procurement.bestPriceCents).toBe(70_000);
  expect(final.procurement.succeededAt).not.toBeNull();
  await expectResponsive(page);
  await navigate(page, 'Kutsed');
  await expect(page.getByRole('heading', { name: 'Sinu kutsed', exact: true })).toBeVisible();
  const invitation = page.getByTestId('invitation-card').filter({ hasText: title });
  await invitation.getByRole('button', { name: 'Võta kutse vastu', exact: true }).click();
  await expect(invitation).toContainText('Vastu võetud');
});

test('registration, organization approval, atomic CSV import and job retry are usable', async ({
  page,
  request,
}) => {
  const failedJob = await failedJobFixture(request);
  const email = 'browser-' + Date.now() + '@test.local';
  const organizationName = uniqueTitle('Brauseri uus KÜ');
  await page.goto('/');
  await page.getByRole('button', { name: 'Loo konto', exact: true }).click();
  await page.getByLabel('Nimi', { exact: true }).fill('Brauseri esindaja');
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Parool', { exact: false }).fill(registrationPassword);
  await page.getByRole('button', { name: 'Loo konto', exact: true }).click();
  await expect(
    page.getByText('Organisatsiooni esindusõigus on vajalik', { exact: true }),
  ).toBeVisible();
  await navigate(page, 'Minu organisatsioon');
  await page.getByRole('button', { name: 'Lisa uus organisatsioon', exact: true }).click();
  await page.getByLabel('Organisatsiooni nimi', { exact: true }).fill(organizationName);
  await page
    .getByLabel('Registrikood', { exact: true })
    .fill(String(80_000_000 + Math.floor(Math.random() * 9_999_999)));
  await page.getByLabel('Kontakti e-post', { exact: false }).fill('private@browser.test');
  await page.getByLabel('Aadress', { exact: true }).fill('Mustamäe tee 123, Tallinn');
  await page.getByRole('button', { name: 'Lisa organisatsioon', exact: true }).click();
  await expect(page.getByText('Kinnitus ootel', { exact: true }).first()).toBeVisible();
  await logout(page);
  await login(page, 'admin@demo.test');
  await navigate(page, 'Haldus');
  const membership = page.getByTestId('membership-row').filter({ hasText: email });
  await expect(membership).toContainText(organizationName);
  await membership.getByRole('button', { name: 'Kinnita', exact: true }).click();
  await expect(membership).toContainText('Kinnitatud');
  await page.getByRole('button', { name: 'CSV import', exact: true }).click();
  const code = 'CSV-BROWSER-' + Date.now();
  const header = 'registryCode,name,orgType,address,latitude,longitude,email';
  const csv =
    header + '\n' + code + ',Brauseri CSV KÜ,BUYER,Mustamäe tee 20,59.405,24.690,private@csv.test';
  await page
    .getByLabel('CSV sisu', { exact: true })
    .fill(csv + '\nBAD-ROW,Bad,BUYER,Test address,999,24.690,');
  await page.getByRole('button', { name: 'Kontrolli ja eelvaata', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Import on peatatud' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Laiuskraad: sisesta arv vahemikus −90 kuni 90; kümnendkohad eralda punktiga.',
  );
  await expect(page.getByRole('button', { name: 'Kinnita import', exact: true })).toBeDisabled();
  await page.getByLabel('CSV sisu', { exact: true }).fill(csv);
  await page.getByRole('button', { name: 'Kontrolli ja eelvaata', exact: true }).click();
  await expect(
    page.getByText('Kogu fail on valideeritud. Kinnita import muudatuste salvestamiseks.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Kinnita import', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Organisatsioonid on edukalt imporditud.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Taustatööd', exact: true }).click();
  const job = page.getByTestId('job-row').filter({ hasText: failedJob.title });
  await expect(job).toContainText('Browser recovery fixture');
  await job.getByRole('button', { name: 'Proovi uuesti', exact: true }).click();
  await expect(job).toContainText('Ootel');
  await page.getByRole('button', { name: 'Auditilogi', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Muutmatu auditilogi', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('ORGANIZATIONS_IMPORTED', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'TEST pearaamat', exact: true }).click();
  await expect(
    page.getByText('TESTMAKSE · Tegelikku raha ei liigu', { exact: true }),
  ).toBeVisible();
  await expectResponsive(page);
  await logout(page);
  await login(page, email, registrationPassword);
  await expect(page.getByRole('link', { name: 'Uus hange', exact: true })).toBeVisible();
  await navigate(page, 'Minu organisatsioon');
  await expect(page.getByRole('heading', { name: organizationName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Muuda profiili', exact: true }).click();
  const updatedAddress = 'Mustamäe tee 124, Tallinn';
  await page.getByLabel('Aadress', { exact: true }).fill(updatedAddress);
  await page.getByRole('button', { name: 'Salvesta profiil', exact: true }).click();
  await expect(page.getByText(updatedAddress, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Organisatsiooni profiil on uuendatud.' }),
  ).toBeVisible();
});

test('individual contracts expose final prices, accept ratings and retain cancelled history', async ({
  page,
  request,
}) => {
  const fixture = await finalizedFixture(request);
  await login(page);
  await navigate(page, 'Lepingud');
  const contract = page.getByTestId('contract-card').filter({ hasText: fixture.procurement.title });
  await expect(contract).toBeVisible();
  await expect(contract).toContainText(/900\s*€/);
  await expect(contract).toContainText('100,03');
  await expect(contract).toContainText('799,97');
  await contract.getByText('Lepingu lõplik tingimuste koopia', { exact: true }).click();
  const history = contract.getByTestId('agreement-history');
  await expect(history).toContainText('Lõplik hooaja hind');
  await expect(history).toContainText('Teenuse kirjeldus vastavalt hankele.');
  await expect(history).toContainText('300 m²');
  await expect(history).toContainText('TESTMAKSE · Tegelikku raha ei liigu.');
  await expect(history.locator('pre')).toHaveCount(0);
  const frozenBuyer = fixture.contract.finalSnapshot.buyerOrganization;
  const liveSession = await api<SessionResponse>(request, '/session');
  const liveBuyer = liveSession.memberships.find(
    (item) => item.organizationId === frozenBuyer.id,
  )!.organization;
  const changedName = uniqueTitle('Muudetud profiili nimi');
  const profile = {
    name: liveBuyer.name,
    address: liveBuyer.address,
    latitude: liveBuyer.latitude,
    longitude: liveBuyer.longitude,
    email: liveBuyer.email ?? '',
  };
  const profileUpdate = await request.put('/api/v1/organizations/' + frozenBuyer.id, {
    data: { ...profile, name: changedName, address: 'Muudetud aadress, Tallinn' },
    headers: { Origin: 'http://127.0.0.1:3001' },
  });
  expect(profileUpdate.ok()).toBe(true);
  try {
    await page.reload();
    await contract.getByText('Lepingu lõplik tingimuste koopia', { exact: true }).click();
    await expect(history).toContainText(frozenBuyer.name);
    await expect(history).toContainText(frozenBuyer.address);
    await expect(history).not.toContainText(changedName);
    await expect(history).not.toContainText('Muudetud aadress, Tallinn');
    const tallinnTime = new Intl.DateTimeFormat('et-EE', {
      timeZone: 'Europe/Tallinn',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(fixture.contract.finalSnapshot.finalizedAt));
    await expect(history).toContainText(tallinnTime);
    await expectResponsive(page);
    await contract.screenshot({
      path: 'docs/Testing/screenshots/agreement-history-' + test.info().project.name + '.png',
    });
  } finally {
    const restored = await request.put('/api/v1/organizations/' + frozenBuyer.id, {
      data: profile,
      headers: { Origin: 'http://127.0.0.1:3001' },
    });
    expect(restored.ok()).toBe(true);
  }
  await contract.getByRole('button', { name: 'Lõpeta teenus ja hinda', exact: true }).click();
  await contract.getByLabel('Hinnang teenusele', { exact: true }).selectOption('5');
  await contract
    .getByLabel('Kommentaar', { exact: true })
    .fill('Õigeaegne ja korralik lumekoristus.');
  await contract.getByRole('button', { name: 'Salvesta hinnang', exact: true }).click();
  await expect(contract).toContainText('Teenus lõpetatud');
  await expect(contract.getByLabel('Hinnang 5 viiest', { exact: true })).toBeVisible();
  await expectResponsive(page);
  await logout(page);
  await login(page, 'admin@demo.test');
  await navigate(page, 'Haldus');
  await page.getByRole('button', { name: 'Hangete haldus', exact: true }).click();
  const adminProcurement = page
    .getByTestId('admin-procurement')
    .filter({ hasText: fixture.procurement.title });
  await adminProcurement.getByRole('button', { name: 'Tühista hange', exact: true }).click();
  await adminProcurement
    .getByLabel('Tühistamise põhjus', { exact: true })
    .fill('Pakkuja teenuse tühistamine browseris.');
  await adminProcurement.getByRole('button', { name: 'Kinnita tühistamine', exact: true }).click();
  await expect(adminProcurement).toContainText('Tühistatud');
  await logout(page);
  await login(page);
  await navigate(page, 'Lepingud');
  const cancelled = page
    .getByTestId('contract-card')
    .filter({ hasText: fixture.procurement.title });
  await expect(cancelled).toContainText('Tühistatud');
  await expect(cancelled).toContainText('Õigeaegne ja korralik lumekoristus.');
  await cancelled.getByText('Lepingu lõplik tingimuste koopia', { exact: true }).click();
  await expect(cancelled.getByTestId('agreement-history')).toContainText(frozenBuyer.address);
  await expect(cancelled.getByTestId('agreement-history')).toContainText('Lõplik hooaja hind');
  await expectResponsive(page);
  await expect(
    cancelled.getByRole('button', { name: 'Lõpeta teenus ja hinda', exact: true }),
  ).toHaveCount(0);
});

test('a continuing buyer can withdraw from an active final contract', async ({ page, request }) => {
  const fixture = await finalizedFixture(request);
  await login(page);
  await navigate(page, 'Lepingud');
  const contract = page.getByTestId('contract-card').filter({ hasText: fixture.procurement.title });
  await expect(contract).toContainText('Leping aktiivne');
  await contract.getByRole('button', { name: 'Loobu hankest', exact: true }).click();
  await expect(contract.getByText(/Loobumisel jääb testtagatis alles/)).toBeVisible();
  await contract.getByRole('button', { name: 'Kinnita loobumine', exact: true }).click();
  await expect(contract).toContainText('Tühistatud');
  await expect(contract).toContainText('Varasem teenuse jääk');
  await expect(contract).toContainText(
    'Leping on tühistatud. Varasem hinnaarvestus säilib ajaloona.',
  );
  await expect(
    contract.getByRole('button', { name: 'Lõpeta teenus ja hinda', exact: true }),
  ).toHaveCount(0);
  await expectResponsive(page);
});

test('approved viewers read invitations without response authority', async ({ page, request }) => {
  const target = await api<SessionResponse>(request, '/login', {
    email: 'buyer8@demo.test',
    password: 'Demo2026!',
  });
  const organizationId = target.memberships.find(
    (item) => item.status === 'approved' && item.role === 'representative',
  )!.organizationId;
  const email = 'viewer-' + Date.now() + '@test.local';
  const viewer = await api<SessionResponse>(request, '/register', {
    name: 'Kutse vaatleja',
    email,
    password: registrationPassword,
  });
  await api(request, '/organizations/' + organizationId + '/membership', { role: 'viewer' });
  await api(request, '/login', { email: 'admin@demo.test', password: 'Demo2026!' });
  const admin = await api<AdminResponse>(request, '/admin');
  const membership = admin.memberships.find(
    (item) => item.userId === viewer.user!.id && item.organizationId === organizationId,
  )!;
  await api(request, '/admin/memberships/' + membership.id, { status: 'approved' });
  await login(page, email, registrationPassword);
  await navigate(page, 'Kutsed');
  const invitations = await api<{ invitations: Invitation[] }>(page.request, '/invitations');
  const pending = invitations.invitations.find((item) => item.status === 'PENDING');
  expect(pending).toBeDefined();
  const card = page.getByTestId('invitation-card').filter({ hasText: pending!.procurementTitle });
  await expect(card).toContainText(
    'Sul on vaatamisõigus. Kutsele saab vastata kinnitatud esindaja.',
  );
  await expect(page.getByRole('button', { name: 'Võta kutse vastu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lükka tagasi', exact: true })).toHaveCount(0);
  const rejected = await page.request.post('/api/v1/invitations/' + pending!.id + '/respond', {
    data: { status: 'ACCEPTED' },
    headers: { Origin: 'http://127.0.0.1:3001' },
  });
  expect(rejected.status()).toBe(403);
  const unchanged = await api<{ invitations: Invitation[] }>(page.request, '/invitations');
  expect(unchanged.invitations.find((item) => item.id === pending!.id)?.status).toBe('PENDING');
  await card.getByRole('link', { name: 'Vaata hanget', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: pending!.procurementTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liitu hankega', exact: true })).toHaveCount(0);
  await expectResponsive(page);
});
