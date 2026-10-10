import { test, expect } from '@playwright/test';
import {
  api,
  expectResponsive,
  failedJobFixture,
  finalizedFixture,
  login,
  logout,
  navigate,
  nextAction,
  registrationPassword,
  serviceField,
  uniqueTitle,
} from './helpers.js';
import type {
  AdminResponse,
  Invitation,
  MailboxResponse,
  Offer,
  ProcurementDetail,
  SessionResponse,
  ServiceSpec,
} from '../../src/shared/types.js';

test.afterAll(async () => {
  const { pool } = await import('../../src/server/db.js');
  await pool.end();
});

async function expectPaidProgress(
  page: import('@playwright/test').Page,
  paidCount: number,
  threshold: number,
) {
  const progress = page.getByTestId('participant-progress').getByRole('progressbar', {
    name: 'Makstud liitumiste eesmärk',
    exact: true,
  });
  await expect(progress).toHaveAttribute('aria-valuemin', '0');
  await expect(progress).toHaveAttribute('aria-valuemax', String(threshold));
  await expect(progress).toHaveAttribute('aria-valuenow', String(Math.min(paidCount, threshold)));
  await expect(progress).toHaveAttribute(
    'aria-valuetext',
    new RegExp(
      '^' +
        paidCount +
        ' / ' +
        (threshold === 1000 ? '1[ \\u00a0\\u202f]000' : threshold) +
        ' makstud liitumist$',
    ),
  );
}

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
  await page.getByLabel('Liitumise tähtaeg', { exact: true }).fill('30.06.2030 12:30');
  await serviceField(page, 'Hooaja algus').fill('01.11.2030');
  await serviceField(page, 'Hooaja lõpp').fill('01.04.2031');
  await serviceField(page, 'Koristusala (m²)').fill('600');
  await page.getByRole('button', { name: 'Salvesta hange', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const id = page.url().split('#procurement/')[1];
  expect(id).toBeTruthy();
  await nextAction(page, 'Avalda hange');
  await expect(page.getByText('Liitumine avatud', { exact: true })).toBeVisible();
  const created = await api<ProcurementDetail>(page.request, '/procurements/' + id);
  expect(created.procurement.joinDeadlineAt).toBe('2030-06-30T09:30:00.000Z');
  expect((created.procurement.spec as ServiceSpec).answers.seasonStart).toBe('2030-11-01');
  expect((created.procurement.spec as ServiceSpec).answers.seasonEnd).toBe('2031-04-01');
  await expect(page.getByText('Liitumine 30.06.2030 12:30-ni', { exact: true })).toBeVisible();
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
  await nextAction(page, 'Kutsu naabrid');
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
  await nextAction(page, 'Esita pakkumine');
  await expect(page.getByLabel('Hooaja tavahind (€)', { exact: true })).toBeVisible();
  await page.getByLabel('Hooaja tavahind (€)', { exact: true }).fill('1 000,00');
  await page.getByLabel('Tagatisraha (€)', { exact: true }).fill('100,03');
  await page.getByLabel('Pakkumise kehtivus', { exact: true }).fill('30.06.2030 12:45');
  await page.getByLabel(/^Osalejate arv(?! 2)/).fill('2');
  await page.getByLabel('Hooaja hind (€)', { exact: true }).fill('900,00');
  await page.getByLabel('Osalejate arv 2', { exact: true }).fill('3');
  await page.getByLabel('Hooaja hind (€) 2', { exact: true }).fill('700,00');
  await page
    .getByLabel('Pakkumise tingimused', { exact: true })
    .fill('Õigeaegne lumekoristus ja libedusetõrje vastavalt teenuse ulatusele.');
  await page.getByRole('button', { name: 'Saada pakkumine', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pakkumine on esitatud.' }),
  ).toBeVisible();
  const submitted = await api<ProcurementDetail>(page.request, '/procurements/' + id);
  expect(submitted.offers).toHaveLength(1);
  expect(submitted.offers[0]).toMatchObject({
    basePriceCents: 100_000,
    depositCents: 10_003,
    validUntil: '2030-06-30T09:45:00.000Z',
    tiers: [
      { minParticipants: 2, priceCents: 90_000 },
      { minParticipants: 3, priceCents: 70_000 },
    ],
  });
  await logout(page);
  await login(page);
  await page.goto('/#procurement/' + id);
  await nextAction(page, 'Võrdle ja vali pakkumine');
  await page.getByRole('button', { name: 'Vali pakkumine', exact: true }).click();
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  for (let index = 1; index <= 3; index++) {
    if (index > 1) {
      await logout(page);
      if (index === 2) {
        await page.getByRole('button', { name: 'Naaberühistu', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Logi välja', exact: true })).toBeVisible();
        expect((await api<SessionResponse>(page.request, '/session')).user?.email).toBe(
          'buyer2@demo.test',
        );
        await navigate(page, /^Postkast/);
        const inbox = await api<MailboxResponse>(page.request, '/mailbox');
        const invitation = inbox.messages.find(
          (message) => message.procurementId === id && message.kind === 'INVITATION',
        )!;
        expect(invitation).toBeDefined();
        expect(invitation.readAt).toBeNull();
        const letter = page.getByTestId('mailbox-message').filter({ hasText: invitation.subject });
        await letter.getByRole('button', { name: 'Ava kiri', exact: true }).click();
        const detail = page.getByTestId('mailbox-detail');
        await expect(detail).toContainText(invitation.subject);
        await expect(detail).toBeInViewport();
        await expect(detail).toContainText('Kutse vastuvõtmine on eraldi liitumisest');
        await expect
          .poll(
            async () =>
              (await api<MailboxResponse>(page.request, '/mailbox')).messages.find(
                (message) => message.id === invitation.id,
              )?.readAt,
          )
          .not.toBeNull();
        await detail.getByRole('button', { name: 'Võta kutse vastu', exact: true }).click();
        await expect(detail).toContainText(/vastu võetud/i);
        const afterAccept = await api<ProcurementDetail>(page.request, '/procurements/' + id);
        expect(afterAccept.commitments).toHaveLength(0);
        await detail.getByRole('link', { name: 'Vaata hanget', exact: true }).click();
      } else {
        await login(page, 'buyer' + index + '@demo.test');
        await page.goto('/#procurement/' + id);
      }
    }
    await nextAction(page, 'Kinnita liitumine');
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
      await expect(history).toContainText('01.11.2030');
      await expect(history).toContainText('01.04.2031');
      await expect(history).toContainText('30.06.2030 12:30');
      await expect(history.locator('pre')).toHaveCount(0);
      await expectResponsive(page);
      await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
      await page
        .getByRole('button', { name: 'Simuleeri makse ebaõnnestumist', exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Ebaõnnestunud testmakse on salvestatud' }),
      ).toBeVisible();
      await expectPaidProgress(page, 0, 2);
    }
    await expect(
      page.getByText('TESTMAKSE · Tegelikku raha ei liigu', { exact: true }).first(),
    ).toBeVisible();
    await nextAction(page, 'Tee testmakse');
    await page.getByRole('button', { name: 'Kinnita testmakse', exact: true }).click();
    await expect(page.getByText(index + ' makstud liitumist', { exact: true })).toBeVisible();
    await expectPaidProgress(page, index, 2);
  }
  await expect(page.getByText('Ühine eesmärk on saavutatud!', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-price')).toContainText(/700\s*€/);
  await page.getByRole('button', { name: 'Loobu hankest', exact: true }).click();
  await expect(page.getByText(/Hange on õnnestunud. Loobumisel jääb/)).toBeVisible();
  await page.getByRole('button', { name: 'Kinnita loobumine', exact: true }).click();
  await expect(page.getByText('2 makstud liitumist', { exact: true })).toBeVisible();
  await expectPaidProgress(page, 2, 2);
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
  await logout(page);
  await login(page, 'buyer2@demo.test');
  await page.goto('/#procurement/' + id);
  await page.getByRole('button', { name: 'Loobu hankest', exact: true }).click();
  await page.getByRole('button', { name: 'Kinnita loobumine', exact: true }).click();
  await expect(page.getByText('1 makstud liitumist', { exact: true })).toBeVisible();
  await expectPaidProgress(page, 1, 2);
  await expect(page.getByText('Ühine eesmärk on saavutatud!', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-price')).toContainText(/700\s*€/);
  const belowThreshold = await api<ProcurementDetail>(page.request, '/procurements/' + id);
  expect(belowThreshold.procurement.activeCount).toBe(1);
  expect(belowThreshold.procurement.status).toBe('SUCCEEDED');
  expect(belowThreshold.procurement.succeededAt).toBe(final.procurement.succeededAt);
  expect(belowThreshold.procurement.bestPriceCents).toBe(70_000);
  await expectResponsive(page);
});

test('registration, organization approval, atomic CSV import and job retry are usable', async ({
  page,
  request,
}) => {
  const failedJob = await failedJobFixture(request);
  const email = 'browser-' + Date.now() + '@test.local';
  const organizationName = uniqueTitle('Brauseri uus KÜ');
  await page.goto('/');
  const publicNavigation = page.getByRole('navigation', {
    name: 'Avalik navigatsioon',
    exact: true,
  });
  await expect(publicNavigation).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = await Promise.all([
      document.fonts.load('600 16px Lora', 'Ühishange Šaakal žürii'),
      document.fonts.load('400 16px "Work Sans"', 'Ühishange Šaakal žürii'),
    ]);
    return {
      faces: loaded.map((faces) => ({
        count: faces.length,
        loaded: faces.every((face) => face.status === 'loaded'),
      })),
      heading: getComputedStyle(document.querySelector('h1')!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
      fontRequests: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => /\.(woff2?|ttf|otf)$/.test(new URL(url).pathname)),
      origin: location.origin,
    };
  });
  expect(fonts.faces.every((family) => family.count > 0 && family.loaded)).toBe(true);
  expect(fonts.heading).toContain('Lora');
  expect(fonts.body).toContain('Work Sans');
  expect(fonts.fontRequests.length).toBeGreaterThan(0);
  expect(fonts.fontRequests.every((url) => new URL(url).origin === fonts.origin)).toBe(true);

  const initialHash = new URL(page.url()).hash;
  for (const [label, target] of [
    ['Teenused', 'services'],
    ['Kuidas toimib', 'how-it-works'],
    ['Teenusepakkujale', 'for-suppliers'],
  ]) {
    const link = publicNavigation.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', '#' + target);
    await link.click();
    const section = page.locator('#' + target);
    await expect(section).toBeVisible();
    await expect(section).toBeInViewport();
    await expect(section).toBeFocused();
    expect(new URL(page.url()).hash).toBe(initialHash);
    await expectResponsive(page);
  }
  const start = page.getByTestId('public-start');
  await expect(start).toHaveAccessibleName('Alusta ühishanget');
  await start.click();
  await expect(page.getByLabel('Nimi', { exact: true })).toBeFocused();
  await expectResponsive(page);
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
  await page.getByLabel('Laiuskraad (WGS84)', { exact: true }).fill('59,405123');
  await page.getByLabel('Pikkuskraad (WGS84)', { exact: true }).fill('24,690456');
  await page.getByRole('button', { name: 'Lisa organisatsioon', exact: true }).click();
  await expect(page.getByText('Kinnitus ootel', { exact: true }).first()).toBeVisible();
  const pendingOrganization = (
    await api<SessionResponse>(page.request, '/session')
  ).memberships.find((item) => item.organization.name === organizationName)!.organization;
  expect(pendingOrganization.latitude).toBe(59.405123);
  expect(pendingOrganization.longitude).toBe(24.690456);
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
  await page.getByLabel('Laiuskraad (WGS84)', { exact: true }).fill('59,405234');
  await page.getByLabel('Pikkuskraad (WGS84)', { exact: true }).fill('24,690567');
  await page.getByRole('button', { name: 'Salvesta profiil', exact: true }).click();
  await expect(page.getByText(updatedAddress, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Organisatsiooni profiil on uuendatud.' }),
  ).toBeVisible();
  const updatedOrganization = (
    await api<SessionResponse>(page.request, '/session')
  ).memberships.find((item) => item.organization.name === organizationName)!.organization;
  expect(updatedOrganization.latitude).toBe(59.405234);
  expect(updatedOrganization.longitude).toBe(24.690567);
  await expect(page.getByText('59,405234; 24,690567', { exact: true })).toBeVisible();
});

test('individual contracts expose final prices, accept ratings and retain cancelled history', async ({
  page,
  request,
}) => {
  const pestSpec: ServiceSpec = {
    formId: 'pest',
    version: 1,
    answers: {
      pests: ['Rotid'],
      extent: 'Prügimaja ja kelder.',
      apartments: 60,
      treatment: 'Regulaarne hooldus',
      frequency: 'Kord kuus',
      safety: 'Lukustatud söödakastid; laste ja lemmikloomade ohutus.',
      location: 'Sõpruse pst 212, Mustamäe, Tallinn',
      pricing: 'Fikseeritud koguhind',
    },
  };
  const fixture = await finalizedFixture(request, pestSpec);
  expect(fixture.contract.finalSnapshot.spec).toEqual(pestSpec);
  await login(page);
  await navigate(page, /^Postkast/);
  const inbox = await api<MailboxResponse>(page.request, '/mailbox');
  const finalMessage = inbox.messages.find(
    (message) =>
      message.procurementId === fixture.procurement.id && message.kind === 'PROCUREMENT_FINALIZED',
  )!;
  expect(finalMessage).toBeDefined();
  const finalLetter = page.getByTestId('mailbox-message').filter({ hasText: finalMessage.subject });
  await finalLetter.getByRole('button', { name: 'Märgi loetuks', exact: true }).click();
  await expect(finalLetter.getByRole('button', { name: 'Märgi loetuks', exact: true })).toHaveCount(
    0,
  );
  const readAt = (await api<MailboxResponse>(page.request, '/mailbox')).messages.find(
    (message) => message.id === finalMessage.id,
  )?.readAt;
  expect(readAt).not.toBeNull();
  await logout(page);
  await login(page);
  await navigate(page, /^Postkast/);
  expect(
    (await api<MailboxResponse>(page.request, '/mailbox')).messages.find(
      (message) => message.id === finalMessage.id,
    )?.readAt,
  ).toBe(readAt);
  await finalLetter.getByRole('button', { name: 'Ava kiri', exact: true }).click();
  await expect(page.getByTestId('mailbox-detail')).toContainText('TEST');
  await page
    .getByTestId('mailbox-detail')
    .getByRole('link', { name: 'Vaata hanget', exact: true })
    .click();
  await expect(
    page.getByTestId('next-action').getByRole('button', { name: 'Kinnita liitumine', exact: true }),
  ).toHaveCount(0);
  await nextAction(page, 'Vaata lepinguid');
  const contract = page.getByTestId('contract-card').filter({ hasText: fixture.procurement.title });
  await expect(contract).toBeVisible();
  await expect(contract).toContainText(/900\s*€/);
  await expect(contract).toContainText('100,03');
  await expect(contract).toContainText('799,97');
  await contract.getByText('Lepingu lõplik tingimuste koopia', { exact: true }).click();
  const history = contract.getByTestId('agreement-history');
  await expect(history).toContainText('Lõplik teenuse hind');
  await expect(history).toContainText('Teenuse kirjeldus vastavalt hankele.');
  await expect(history).toContainText('Kahjuritõrje');
  await expect(history).toContainText('Rotid');
  await expect(history).toContainText('Regulaarne hooldus');
  await expect(history).toContainText('Kord kuus');
  await expect(history).toContainText('Lukustatud söödakastid; laste ja lemmikloomade ohutus.');
  await expect(history).not.toContainText('Koristusala');
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
    const tallinnParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Tallinn',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(fixture.contract.finalSnapshot.finalizedAt));
    const part = (type: string) => tallinnParts.find((item) => item.type === type)?.value;
    const tallinnTime = `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
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
  await contract.getByLabel('Kommentaar', { exact: true }).fill('Õigeaegne ja ohutu kahjuritõrje.');
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
  await expect(cancelled).toContainText('Õigeaegne ja ohutu kahjuritõrje.');
  await cancelled.getByText('Lepingu lõplik tingimuste koopia', { exact: true }).click();
  await expect(cancelled.getByTestId('agreement-history')).toContainText(frozenBuyer.address);
  await expect(cancelled.getByTestId('agreement-history')).toContainText('Lõplik teenuse hind');
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

test('approved viewers read mailbox invitations without response authority', async ({
  page,
  request,
}) => {
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
  await navigate(page, /^Postkast/);
  const invitations = await api<{ invitations: Invitation[] }>(page.request, '/invitations');
  const pending = invitations.invitations.find((item) => item.status === 'PENDING');
  expect(pending).toBeDefined();
  const inbox = await api<MailboxResponse>(page.request, '/mailbox');
  expect(inbox.messages.every((message) => message.audience === 'MEMBERS')).toBe(true);
  const invitationMessage = inbox.messages.find(
    (message) => message.invitation?.id === pending!.id,
  )!;
  expect(invitationMessage).toBeDefined();
  const letter = page.getByTestId('mailbox-message').filter({ hasText: invitationMessage.subject });
  await letter.getByRole('button', { name: 'Ava kiri', exact: true }).click();
  const detail = page.getByTestId('mailbox-detail');
  await expect(detail).toContainText(
    'Vaatleja saab kirja lugeda. Kutsele vastamiseks on vajalik kinnitatud esindusõigus.',
  );
  await expect(detail).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Võta kutse vastu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lükka tagasi', exact: true })).toHaveCount(0);
  const rejected = await page.request.post('/api/v1/invitations/' + pending!.id + '/respond', {
    data: { status: 'ACCEPTED' },
    headers: { Origin: 'http://127.0.0.1:3001' },
  });
  expect(rejected.status()).toBe(403);
  const unchanged = await api<{ invitations: Invitation[] }>(page.request, '/invitations');
  expect(unchanged.invitations.find((item) => item.id === pending!.id)?.status).toBe('PENDING');
  await detail.getByRole('link', { name: 'Vaata hanget', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: pending!.procurementTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liitu hankega', exact: true })).toHaveCount(0);
  await expect(
    page.getByTestId('next-action').getByRole('button', { name: 'Kinnita liitumine', exact: true }),
  ).toHaveCount(0);
  await expectResponsive(page);
});

test('source service types use conditional questions, clear stale answers and remain discoverable', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const created: Array<{
    id: string;
    title: string;
    formId: ServiceSpec['formId'];
    label: string;
  }> = [];
  for (const [formId, label] of [
    ['pest', 'Kahjuritõrje'],
    ['energy', 'Energiamärgis'],
    ['branches', 'Okste koristamine'],
    ['other', 'Muu teenus – vabas vormis'],
  ] as const) {
    await page.goto('/#new');
    const type = page.getByLabel('Hanketüüp', { exact: true });
    await expect(type).toHaveValue('snow');
    if (formId === 'pest') {
      await page.getByRole('checkbox', { name: 'Lume äravedu', exact: true }).check();
      await serviceField(page, 'Lume kogumise ja äraveo tingimused').fill(
        'Vana lumevastus peab tüübi vahetamisel kaduma.',
      );
    }
    await type.selectOption(formId);
    await expect(serviceField(page, 'Koristusala (m²)')).toHaveCount(0);
    await expect(serviceField(page, 'Lume kogumise ja äraveo tingimused')).toHaveCount(0);
    const title = uniqueTitle('Brauseri ' + label);
    await page.getByLabel('Hanke pealkiri', { exact: true }).fill(title);
    await page
      .getByLabel('Kirjeldus', { exact: true })
      .fill('Ühise teenuse täpne kirjeldus lähikonna ühistutele.');
    await serviceField(page, 'Tööde asukoht').fill('Sõpruse pst 212, Mustamäe, Tallinn');
    await serviceField(page, 'Ligipääs ja eritingimused').fill('Esindaja avab värava.');
    await serviceField(page, 'Soovitud tööde kuupäev').fill('15.06.2030');
    await serviceField(page, 'Soovitud hinnapakkumise vorm').selectOption(
      'Ühikuhind koos koguhinnaga',
    );
    if (formId === 'pest') {
      await page.getByRole('checkbox', { name: 'Rotid', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Hiired', exact: true }).check();
      await serviceField(page, 'Probleemi ulatus ja mõjutatud ruumid').fill('Kelder ja prügimaja.');
      await serviceField(page, 'Korterite arv').fill('60');
      await expect(serviceField(page, 'Hoolduse sagedus')).toHaveCount(0);
      await serviceField(page, 'Teenuse iseloom').selectOption('Regulaarne hooldus');
      await serviceField(page, 'Hoolduse sagedus').selectOption('Kord kuus');
      await serviceField(page, 'Teenuse iseloom').selectOption('Ühekordne tõrje');
      await expect(serviceField(page, 'Hoolduse sagedus')).toHaveCount(0);
      await serviceField(page, 'Teenuse iseloom').selectOption('Regulaarne hooldus');
      await expect(serviceField(page, 'Hoolduse sagedus')).toHaveValue('');
      await serviceField(page, 'Hoolduse sagedus').selectOption('Kord kuus');
      await serviceField(page, 'Ohutus ja tõrjevahendite piirangud').fill(
        'Lukustatud söödakastid; laste ja lemmikloomade ohutus.',
      );
    } else if (formId === 'energy') {
      await serviceField(page, 'Hoone liik').selectOption('Olemasolev hoone');
      await serviceField(page, 'Köetav pind (m²)').fill('3\u00a0500,5');
      await serviceField(page, 'Energiatarbimise andmed').selectOption('Osaliselt olemas');
      await page
        .getByRole('checkbox', { name: 'Soovin ka energiatõhususe soovitusi', exact: true })
        .check();
    } else if (formId === 'branches') {
      await serviceField(page, 'Okste hinnanguline maht (m³)').fill('5,5');
      await page.getByRole('checkbox', { name: 'Oksad on kokku kogutud', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Vajalik on ka lõikamine', exact: true }).check();
      await serviceField(page, 'Lõikamistööde kirjeldus').fill('Vana tingimus.');
      await page.getByRole('checkbox', { name: 'Vajalik on ka lõikamine', exact: true }).uncheck();
      await expect(serviceField(page, 'Lõikamistööde kirjeldus')).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Vajalik on ka lõikamine', exact: true }).check();
      await expect(serviceField(page, 'Lõikamistööde kirjeldus')).toHaveValue('');
      await serviceField(page, 'Lõikamistööde kirjeldus').fill(
        'Lõigata ainult maha langenud okste osad.',
      );
    } else {
      await serviceField(page, 'Teenuse või töö nimetus').fill('Trepikodade suurpuhastus');
      await serviceField(page, 'Tööde kirjeldus').fill(
        'Pesta kolme trepikoja põrandad ja käsipuud.',
      );
      await serviceField(page, 'Töö maht või kogus').fill('3 trepikoda');
      await page
        .getByRole('checkbox', { name: 'Pakkuja peab objektiga kohapeal tutvuma', exact: true })
        .check();
    }
    await expectResponsive(page);
    await page.getByRole('button', { name: 'Salvesta hange', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const id = page.url().split('#procurement/')[1];
    const saved = await api<ProcurementDetail>(page.request, '/procurements/' + id);
    const spec = saved.procurement.spec as ServiceSpec;
    expect(spec.formId).toBe(formId);
    expect(spec.version).toBe(1);
    expect(spec.answers.location).toBe('Sõpruse pst 212, Mustamäe, Tallinn');
    expect(spec.answers.desiredDate).toBe('2030-06-15');
    await expect(page.getByText('15.06.2030', { exact: true })).toBeVisible();
    expect(spec.answers.pricing).toBe('Ühikuhind koos koguhinnaga');
    expect(spec.answers).not.toHaveProperty('areaM2');
    expect(spec.answers).not.toHaveProperty('snowStorage');
    if (formId === 'pest') {
      expect(spec.answers.pests).toEqual(['Rotid', 'Hiired']);
      expect(spec.answers.frequency).toBe('Kord kuus');
      await expect(page.getByText('Kord kuus', { exact: true })).toBeVisible();
    } else if (formId === 'branches') {
      expect(spec.answers.volume).toBe(5.5);
      await expect(page.getByText('5,5 m³', { exact: true })).toBeVisible();
      expect(spec.answers.cuttingScope).toBe('Lõigata ainult maha langenud okste osad.');
      await expect(
        page.getByText('Lõigata ainult maha langenud okste osad.', { exact: true }),
      ).toBeVisible();
    } else if (formId === 'energy') {
      expect(spec.answers.heatedArea).toBe(3500.5);
      await expect(page.getByText('3 500,5 m²', { exact: true })).toBeVisible();
    } else {
      expect(spec.answers.serviceName).toBe('Trepikodade suurpuhastus');
    }
    await nextAction(page, 'Avalda hange');
    created.push({ id, title, formId, label });
  }
  await navigate(page, 'Hanked');
  const filter = page.getByLabel('Hanketüüp', { exact: true });
  for (const item of created) {
    await filter.selectOption(item.formId);
    const cards = page.locator('.procurement-card');
    await expect(cards.filter({ hasText: item.title })).toHaveCount(1);
    const badges = await cards.locator('.service-badge').allTextContents();
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((label) => label === item.label)).toBe(true);
    await expectResponsive(page);
  }
  await filter.selectOption('all');

  for (const item of created)
    await expect(page.getByRole('link').filter({ hasText: item.title })).toHaveCount(1);
  const pest = created.find((item) => item.formId === 'pest')!;
  await page.goto('/#procurement/' + pest.id);
  await nextAction(page, 'Kutsu naabrid');
  await page.getByRole('button', { name: 'Saada kutsed', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Piirkonna ühistutele on saadetud' }),
  ).toBeVisible();
  await logout(page);
  await login(page, 'supplier@demo.test');
  await page.goto('/#procurement/' + pest.id);
  await nextAction(page, 'Esita pakkumine');
  await page.getByLabel('Teenuse tavahind (€)', { exact: true }).fill('1\u202f000,00');
  await page.getByLabel('Tagatisraha (€)', { exact: true }).fill('100,03');
  await page.getByLabel(/^Osalejate arv(?! 2)/).fill('2');
  await page.getByLabel('Teenuse hind (€)', { exact: true }).fill('900');
  await page.getByLabel('Osalejate arv 2', { exact: true }).fill('3');
  await page.getByLabel('Teenuse hind (€) 2', { exact: true }).fill('700');
  await page
    .getByLabel('Pakkumise tingimused', { exact: true })
    .fill('Kord kuus: ohutu kahjuritõrje ja tulemuse kontroll.');
  await page.getByRole('button', { name: 'Saada pakkumine', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pakkumine on esitatud.' }),
  ).toBeVisible();
  await logout(page);
  await login(page);
  await page.goto('/#procurement/' + pest.id);
  await nextAction(page, 'Võrdle ja vali pakkumine');
  await page.getByRole('button', { name: 'Vali pakkumine', exact: true }).click();
  for (let buyer = 1; buyer <= 2; buyer++) {
    if (buyer === 2) {
      await logout(page);
      await page.getByRole('button', { name: 'Naaberühistu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Logi välja', exact: true })).toBeVisible();
      await navigate(page, /^Postkast/);
      const inbox = await api<MailboxResponse>(page.request, '/mailbox');
      const invitation = inbox.messages.find(
        (message) => message.procurementId === pest.id && message.kind === 'INVITATION',
      )!;
      expect(invitation).toBeDefined();
      const letter = page.getByTestId('mailbox-message').filter({ hasText: invitation.subject });
      await letter.getByRole('button', { name: 'Ava kiri', exact: true }).click();
      const detail = page.getByTestId('mailbox-detail');
      await expect(detail).not.toContainText(/lumekoristus/i);
      await detail.getByRole('button', { name: 'Võta kutse vastu', exact: true }).click();
      await expect(detail).toContainText(/vastu võetud/i);
      await detail.getByRole('link', { name: 'Vaata hanget', exact: true }).click();
    }
    await nextAction(page, 'Kinnita liitumine');
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
    await page.getByRole('button', { name: 'Liitu hankega', exact: true }).click();
    await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
    const history = page.getByTestId('agreement-history');
    await expect(history).toContainText('Kahjuritõrje');
    await expect(history).toContainText('Rotid, Hiired');
    await expect(history).toContainText('Kord kuus');
    await expect(history).toContainText('Ühikuhind koos koguhinnaga');
    await expect(history).not.toContainText('Koristusala');
    await expect(history).toContainText('Kord kuus: ohutu kahjuritõrje ja tulemuse kontroll.');
    await page.getByText('Liitumisel kinnitatud tingimused', { exact: true }).click();
    await nextAction(page, 'Tee testmakse');
    await expect(
      page.getByText('TESTMAKSE · Tegelikku raha ei liigu', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Kinnita testmakse', exact: true }).click();
    await expect(page.getByText(buyer + ' makstud liitumist', { exact: true })).toBeVisible();
    await expectResponsive(page);
  }
  const completed = await api<ProcurementDetail>(page.request, '/procurements/' + pest.id);
  expect(completed.procurement.status).toBe('SUCCEEDED');
  expect(completed.procurement.activeCount).toBe(2);
  expect(completed.procurement.bestPriceCents).toBe(90_000);
  expect(
    completed.commitments.every(
      (row) =>
        'formId' in row.acceptanceSnapshot.spec && row.acceptanceSnapshot.spec.formId === 'pest',
    ),
  ).toBe(true);
  const branches = created.find((item) => item.formId === 'branches')!;
  const supplier = await api<SessionResponse>(page.request, '/login', {
    email: 'supplier@demo.test',
    password: 'Demo2026!',
  });
  const supplierId = supplier.memberships.find(
    (membership) =>
      membership.status === 'approved' &&
      membership.role === 'representative' &&
      membership.organization.orgType === 'SUPPLIER',
  )!.organizationId;
  const { offer } = await api<{ offer: Offer }>(
    page.request,
    '/procurements/' + branches.id + '/offers',
    {
      organizationId: supplierId,
      basePriceCents: 100_000,
      depositCents: 10_003,
      terms: 'Okste koristamine vastavalt ühisele tööde ulatusele.',
      validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      tiers: [{ minParticipants: 1000, priceCents: 90_000 }],
    },
  );
  await api(page.request, '/login', { email: 'buyer1@demo.test', password: 'Demo2026!' });
  await api(page.request, '/procurements/' + branches.id + '/select-offer', { offerId: offer.id });
  await page.goto('/#procurement/' + branches.id);
  await page.reload();
  await expect(page.getByRole('heading', { name: branches.title, exact: true })).toBeVisible();
  await expectPaidProgress(page, 0, 1000);
  const dots = page.getByTestId('participant-progress').getByTestId('participant-dot');
  expect(await dots.count()).toBeGreaterThan(0);
  expect(await dots.count()).toBeLessThanOrEqual(20);
  await expectResponsive(page);
});
