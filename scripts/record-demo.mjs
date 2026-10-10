import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';

// This records the real production build. All business writes use visible UI controls.
const runId = Date.now().toString();
const databaseName = 'uhishange_recording_' + runId;
assert.match(databaseName, /^uhishange_recording_\d+$/);
const output = resolve('recordings', runId);
const mainURL = new URL(
  process.env.DATABASE_URL || 'postgres://uhishange:uhishange@localhost:54329/uhishange',
);
const recordingURL = new URL(mainURL);
recordingURL.pathname = '/' + databaseName;
const baseURL = 'http://127.0.0.1:3002';
const environment = {
  ...process.env,
  DATABASE_URL: recordingURL.toString(),
  TEST_PAYMENTS: 'true',
  PORT: '3002',
  HOST: '127.0.0.1',
};
const title = 'Naaberühistute ühine talihooldus (demo)';
const email = 'recording@demo.test';
const password = 'DemoSalvestus2026!';
const chapters = [];
const cuts = [];
const errors = [];
const children = [];
let browser;
let context;
let page;
let started;
let procurementId;
await mkdir(resolve(output, 'frames'), { recursive: true });
const log = createWriteStream(resolve(output, 'runtime.log'));
const main = new pg.Client({ connectionString: mainURL.toString() });
const recording = new pg.Client({ connectionString: recordingURL.toString() });
await main.connect();

async function run(command, args, env = process.env) {
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'close');
  assert.equal(code, 0, command + ' failed: ' + stderr.slice(-3000));
  return stdout;
}

async function businessFingerprint() {
  const result = {};
  // Fixed identifiers only; hashes expose neither password hashes nor private contacts.
  for (const table of [
    'users',
    'organizations',
    'procurements',
    'commitments',
    'contracts',
    'ledger',
    'audit',
  ]) {
    const { rows } = await main.query(
      `SELECT count(*)::integer AS count, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS hash FROM ${table} t`,
    );
    result[table] = rows[0];
  }
  return result;
}

function start(file) {
  const child = spawn(process.execPath, [file], {
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  children.push(child);
  return child;
}

async function checkPort() {
  const probe = net.createServer();
  await new Promise((done, reject) => {
    probe.once('error', reject);
    probe.listen(3002, '127.0.0.1', done);
  });
  await new Promise((done) => probe.close(done));
}

const elapsed = () => (Date.now() - started) / 1000;
const pause = (milliseconds = 700) => page.waitForTimeout(milliseconds);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const label = (name) => page.getByLabel(name, { exact: true });
const escape = (value) => value.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
const serviceField = (name) => page.getByLabel(new RegExp('^' + escape(name) + '(?:\\s*\\*)?$'));
const nextAction = (name) => click(button(name, page.getByTestId('next-action')));

async function reveal(locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box || box.y < 100 || box.y + box.height > 785) {
    await locator.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
    await pause(450);
  }
}

async function click(locator) {
  await reveal(locator);
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(200);
  await locator.click();
  await pause();
}

async function fill(locator, value, type = true) {
  await click(locator);
  await locator.fill('');
  if (type) await locator.pressSequentially(value, { delay: 18 });
  else await locator.fill(value);
  await locator.press('Tab');
  await pause(300);
}

async function navigate(name) {
  await click(
    page
      .getByRole('navigation', { name: 'Põhinavigatsioon' })
      .getByRole('link', { name, exact: true }),
  );
}

async function stage(name, description) {
  console.log('DEMO: ' + name);
  chapters.push({ title: name, sourceSeconds: elapsed() });
  await page.evaluate(
    ({ name, description }) => {
      localStorage.setItem('recording-caption', JSON.stringify({ name, description }));
      document.querySelector('#recording-stage').textContent = 'DEMO · ' + name;
      document.querySelector('#recording-description').textContent = description;
    },
    { name, description },
  );
  await pause(1200);
}

async function snapshot(name) {
  await page.evaluate(() => document.fonts.ready);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    name + ': overflow',
  );
  assert.deepEqual(errors, [], name + ': browser errors');
  await page.screenshot({ path: resolve(output, 'frames', name + '.png') });
  await pause(2500);
}

async function get(path) {
  const response = await page.request.get('/api/v1' + path);
  assert.ok(response.ok(), path + ': ' + response.status());
  return response.json();
}

async function logout() {
  await click(button('Logi välja'));
  await expect(button('Naaberühistu')).toBeVisible();
}

async function login(account, demoButton) {
  if (demoButton) await click(button(demoButton));
  else {
    await fill(label('E-post'), account);
    await fill(
      page.getByLabel('Parool', { exact: false }),
      account === email ? password : 'Demo2026!',
    );
    await click(button('Logi sisse'));
  }
  await expect(button('Logi välja')).toBeVisible();
}

async function openProcurement() {
  await navigate('Hanked');
  await fill(page.getByLabel('Otsi hankeid', { exact: true }), title);
  await click(page.getByRole('link', { name: new RegExp(escape(title)) }).first());
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

async function openLetter(kind) {
  await navigate(/^Postkast/);
  const inbox = await get('/mailbox');
  const letter = inbox.messages.find(
    (message) => message.procurementId === procurementId && message.kind === kind,
  );
  assert.ok(letter, 'Expected ' + kind + ' letter');
  const row = page.getByTestId('mailbox-message').filter({ hasText: letter.subject });
  await click(button('Ava kiri', row));
  const detail = page.getByTestId('mailbox-detail');
  await snapshot(kind.toLowerCase());
  if (kind === 'INVITATION') {
    await expect(detail).toContainText('Kutse vastuvõtmine on eraldi liitumisest');
    await click(button('Võta kutse vastu', detail));
    await expect(detail).toContainText(/vastu võetud/i);
  }
  await click(detail.getByRole('link', { name: 'Vaata hanget', exact: true }));
}

async function joinAndPay(count) {
  await nextAction('Kinnita liitumine');
  for (const name of [
    'Kinnitan, et mul on õigus ühistu nimel kohustusi võtta.',
    'Kinnitan ühise teenuse ulatuse, pakkumise ja tagatisraha tingimused.',
  ])
    await click(page.getByRole('checkbox', { name, exact: true }));
  await click(button('Liitu hankega'));
  if (count === 1) {
    const summary = page.getByText('Liitumisel kinnitatud tingimused', { exact: true });
    await click(summary);
    await snapshot('acceptance');
    await click(summary);
  }
  await nextAction('Tee testmakse');
  await expect(
    page.getByText('TESTMAKSE · Tegelikku raha ei liigu', { exact: true }).first(),
  ).toBeVisible();
  await click(button('Kinnita testmakse'));
  await expect(page.getByText(count + ' makstud liitumist', { exact: true })).toBeVisible();
  await reveal(page.getByTestId('participant-progress'));
  await snapshot('paid-' + count);
}

async function completeService(comment) {
  await navigate('Lepingud');
  const card = page.getByTestId('contract-card').filter({ hasText: title });
  await click(button('Lõpeta teenus ja hinda', card));
  await fill(card.getByLabel('Kommentaar', { exact: true }), comment);
  await click(button('Salvesta hinnang', card));
  await expect(card).toContainText('Teenus lõpetatud');
  await expect(card.getByLabel('Hinnang 5 viiest')).toBeVisible();
}

try {
  await checkPort();
  const before = await businessFingerprint();
  const adminURL = new URL(mainURL);
  adminURL.pathname = '/postgres';
  const administrator = new pg.Client({ connectionString: adminURL.toString() });
  await administrator.connect();
  try {
    await administrator.query('CREATE DATABASE "' + databaseName + '"');
  } finally {
    await administrator.end();
  }
  await run(process.execPath, ['dist/server/server/bootstrap.js'], environment);
  await recording.connect();
  start('dist/server/server/server.js');
  start('dist/server/server/worker.js');
  await expect
    .poll(
      async () => {
        try {
          return (await (await fetch(baseURL + '/api/v1/health')).json()).status;
        } catch {
          return 'starting';
        }
      },
      { timeout: 30000 },
    )
    .toBe('ok');
  browser = await chromium.launch();
  context = await browser.newContext({
    baseURL,
    locale: 'et-EE',
    timezoneId: 'Europe/Tallinn',
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: output, size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '#recording-caption{position:fixed;left:260px;right:24px;bottom:14px;padding:14px 20px;background:rgba(247,245,240,.98);border:2px solid #203c35;border-radius:12px;box-shadow:0 5px 20px #0002;z-index:2147483647;pointer-events:none;font:16px/1.4 "Work Sans",sans-serif;color:#203c35}#recording-stage{font-size:13px;font-weight:700;letter-spacing:.08em;margin-bottom:4px}#recording-cursor{position:fixed;width:20px;height:20px;border:2px solid white;background:#203c35bb;border-radius:50%;box-shadow:0 0 0 2px #203c35;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);left:80%;top:15%}';
      document.head.append(style);
      const caption = document.createElement('div');
      caption.id = 'recording-caption';
      for (const id of ['recording-stage', 'recording-description']) {
        const text = document.createElement('div');
        text.id = id;
        caption.append(text);
      }
      document.body.append(caption);
      const current = JSON.parse(
        localStorage.getItem('recording-caption') ||
          '{"name":"Ühishange","description":"Fiktiivsed ühistud. Kõik maksed on TEST-tehingud."}',
      );
      document.querySelector('#recording-stage').textContent = 'DEMO · ' + current.name;
      document.querySelector('#recording-description').textContent = current.description;
      const cursor = document.createElement('div');
      cursor.id = 'recording-cursor';
      document.body.append(cursor);
      addEventListener('pointermove', (event) => {
        cursor.style.left = event.clientX + 'px';
        cursor.style.top = event.clientY + 'px';
      });
      addEventListener('pointerdown', () => {
        cursor.style.background = '#a55d40';
      });
      addEventListener('pointerup', () => {
        cursor.style.background = '#203c35bb';
      });
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  started = Date.now();
  await page.goto('/');
  await stage(
    'Ühine tellimus algab siit',
    'Ühishange ühendab naaberühistud. Sammud: hankesoov → pakkumine → liitumine → leping.',
  );
  await snapshot('public');
  const publicNavigation = page.getByRole('navigation', { name: 'Avalik navigatsioon' });
  await click(publicNavigation.getByRole('link', { name: 'Teenused', exact: true }));
  await snapshot('service-types');
  await click(publicNavigation.getByRole('link', { name: 'Kuidas toimib', exact: true }));
  await snapshot('process');

  await stage(
    'Ühistu esindaja registreerub',
    'Liis Tamm loob konto ja lisab KÜ Sõpruse pst 216. Esindusõiguse kinnitab administraator.',
  );
  await click(page.getByTestId('public-start'));
  await fill(label('Nimi'), 'Liis Tamm (demo)');
  await fill(label('E-post'), email);
  await fill(page.getByLabel('Parool', { exact: false }), password);
  await click(button('Loo konto'));
  await navigate('Minu organisatsioon');
  await click(button('Lisa uus organisatsioon'));
  for (const [name, value] of [
    ['Organisatsiooni nimi', 'KÜ Sõpruse pst 216 (demo)'],
    ['Registrikood', '90002026'],
    ['Aadress', 'Sõpruse pst 216, Mustamäe, Tallinn'],
    ['Laiuskraad (WGS84)', '59,4053'],
    ['Pikkuskraad (WGS84)', '24,6906'],
  ])
    await fill(label(name), value);
  await click(button('Lisa organisatsioon'));
  await expect(page.getByText('Kinnitus ootel', { exact: true }).first()).toBeVisible();
  await snapshot('pending-membership');
  await logout();

  await stage(
    'Administraator kinnitab esindusõiguse',
    'Kutsetest üksi ei piisa: organisatsiooni nimel saab tegutseda kinnitatud esindaja.',
  );
  await login('admin@demo.test', 'Administraator');
  await navigate('Haldus');
  const membership = page.getByTestId('membership-row').filter({ hasText: email });
  await click(button('Kinnita', membership));
  await expect(membership).toContainText('Kinnitatud');
  await snapshot('approved-membership');
  await stage(
    'Naaberühistu lisamine CSV-st',
    'Esmalt kontrollitakse kogu faili. Eelvaate kinnitamisel salvestatakse muudatused korraga.',
  );
  await click(button('CSV import'));
  await fill(
    label('CSV sisu'),
    'registryCode,name,orgType,address,latitude,longitude,email\n90002027,KÜ Akadeemia tee 22 (demo),BUYER,Akadeemia tee 22 Tallinn,59.4015,24.6905,kontakt@demo.test',
    false,
  );
  await click(button('Kontrolli ja eelvaata'));
  await expect(
    page.getByText('Kogu fail on valideeritud. Kinnita import muudatuste salvestamiseks.', {
      exact: true,
    }),
  ).toBeVisible();
  await snapshot('csv-preview');
  await click(button('Kinnita import'));
  await logout();
  await login(email);

  await stage(
    'Algataja kirjeldab hankesoovi',
    'Valime lumekoristuse, hooaja, hooldusalad ja reageerimisaja. Kutsed ulatuvad 500 meetrini.',
  );
  await click(page.getByRole('link', { name: 'Uus hange', exact: true }));
  await snapshot('new-procurement');
  const deadline = new Date(Math.ceil((Date.now() + 7 * 60000) / 60000) * 60000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('et-EE', {
      timeZone: 'Europe/Tallinn',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(deadline)
      .map((part) => [part.type, part.value]),
  );
  const deadlineText = `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
  await fill(label('Hanke pealkiri'), title);
  await fill(
    label('Kirjeldus'),
    'Sõpruse puiestee naaberühistute hoovide ja kõnniteede talvine hooldus.',
  );
  await fill(label('Liitumise tähtaeg'), deadlineText);
  for (const [name, value] of [
    ['Hooaja algus', '01.11.2026'],
    ['Hooaja lõpp', '01.04.2027'],
    ['Koristusala (m²)', '1 200'],
    ['Parkimisala (m²)', '850'],
    ['Kõnnitee (m)', '180'],
    ['Lumekihi paksus (cm)', '3'],
    ['Reageerimisaeg (h)', '6'],
  ])
    await fill(serviceField(name), value);
  await click(button('Salvesta hange'));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  procurementId = page.url().split('#procurement/')[1];
  assert.ok(procurementId);
  assert.equal(
    (await get('/procurements/' + procurementId)).procurement.joinDeadlineAt,
    deadline.toISOString(),
  );
  await nextAction('Avalda hange');
  await stage(
    'Kaart ja kutsed naaberühistutele',
    'Kaart näitab lähedal asuvaid ühistuid ja nende kaugust. Kutse jõuab ühistu postkasti.',
  );
  await nextAction('Kutsu naabrid');
  const map = page.getByRole('img', { name: /Hanke keskpunkt ja läheduses olevad ühistud/ });
  await click(button('Suurenda kaarti'));
  await click(button('Vähenda kaarti'));
  await click(map.getByRole('button').first());
  await snapshot('neighbors');
  await click(button('Saada kutsed'));
  await expect(
    page.getByRole('status').filter({ hasText: 'Piirkonna ühistutele on saadetud' }),
  ).toBeVisible();
  await logout();

  await stage(
    'Pakkuja esitab astmelise hinna',
    'Lumering OÜ: tavahind 1 000 €, kaks ühistut 900 €, kolm ühistut 700 €. Testtagatis on 100 €.',
  );
  await login('supplier@demo.test', 'Pakkuja');
  await openProcurement();
  await nextAction('Esita pakkumine');
  for (const [locator, value] of [
    [label('Hooaja tavahind (€)'), '1 000,00'],
    [label('Tagatisraha (€)'), '100,00'],
    [page.getByLabel(/^Osalejate arv(?! 2)/), '2'],
    [label('Hooaja hind (€)'), '900,00'],
    [label('Osalejate arv 2'), '3'],
    [label('Hooaja hind (€) 2'), '700,00'],
    [
      label('Pakkumise tingimused'),
      'Lumekoristus ja libedusetõrje kirjeldatud aladel. Hind sisaldab käibemaksu. Teenuse jääk arveldatakse otse pakkujaga.',
    ],
  ])
    await fill(locator, value);
  await snapshot('offer');
  await click(button('Saada pakkumine'));
  await expect(
    page.getByRole('status').filter({ hasText: 'Pakkumine on esitatud.' }),
  ).toBeVisible();
  await logout();
  await login(email);
  await stage(
    'Algataja saab pakkumise postkasti',
    'Postkast toob järgmise sammu esile. Algataja võrdleb pakkumisi ja valib ühe enne liitumisi.',
  );
  await openLetter('OFFER_SUBMITTED');
  await nextAction('Võrdle ja vali pakkumine');
  await click(button('Vali pakkumine'));
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  await stage(
    'Esimene ühistu liitub ja maksab',
    'Algataja kinnitab esindusõiguse ja ühise teenuse ulatuse. Ainult kinnitatud TEST-makse loeb osalejate hulka.',
  );
  await joinAndPay(1);
  await logout();

  await stage(
    'Naaber võtab kutse vastu ja liitub',
    'KÜ Sõpruse pst 214 avab kutse postkastis. Teine makstud liitumine saavutab ühise eesmärgi.',
  );
  await login('buyer2@demo.test', 'Naaberühistu');
  await openLetter('INVITATION');
  await joinAndPay(2);
  await expect(page.getByTestId('current-price')).toContainText(/900\s*€/);
  await logout();
  await login('buyer3@demo.test');
  await stage(
    'Kolmas ühistu langetab hinna 700 euroni',
    'KÜ Sõpruse pst 210 liitub sama kutse kaudu. Kõigi jätkavate ühistute saavutatud hind langeb.',
  );
  await openLetter('INVITATION');
  await joinAndPay(3);
  await expect(page.getByTestId('current-price')).toContainText(/700\s*€/);
  await logout();
  await login(email);
  await openProcurement();
  await stage(
    'Taustatöö lõpetab liitumise tähtajal',
    'Liitumistähtajani ootamine on videos lühendatud. Tegelik taustatöö loob lepingud algsel tähtajal.',
  );
  await snapshot('before-deadline');
  const cutStart = elapsed();
  let lastLog = Date.now();
  while ((await get('/procurements/' + procurementId)).procurement.status !== 'FINALIZED') {
    assert.ok(Date.now() < deadline.getTime() + 30000, 'Deadline processing did not complete');
    await pause(1000);
    if (Date.now() - lastLog > 30000) {
      console.log(
        'DEMO: Waiting for actual deadline, ' +
          Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000)) +
          ' seconds remaining',
      );
      lastLog = Date.now();
    }
  }
  const cutEnd = elapsed();
  if (cutEnd - cutStart > 2) cuts.push({ start: cutStart, end: cutEnd });
  await expect(
    page.getByTestId('next-action').getByRole('button', { name: 'Vaata lepinguid', exact: true }),
  ).toBeVisible();
  await stage(
    'Leping ja lõplik hinnaarvestus',
    'Iga ühistu saab lepingu: lõpphind 700 €, testtagatis 100 €, otse pakkujale tasuda 600 €.',
  );
  await nextAction('Vaata lepinguid');
  const contract = page.getByTestId('contract-card').filter({ hasText: title });
  await expect(contract).toContainText(/700\s*€/);
  await snapshot('contract');
  const finalSummary = contract.getByText('Lepingu lõplik tingimuste koopia', { exact: true });
  await click(finalSummary);
  await expect(contract.getByTestId('contract-service-fee')).toContainText(/28\s*€/);
  await expect(contract.getByTestId('supplier-deposit-payout')).toContainText(/72\s*€/);
  await reveal(contract.getByTestId('agreement-history'));
  await snapshot('final-snapshot');
  await click(finalSummary);
  await stage(
    'Hooaja lõpu ja hinnangu demonstratsioon',
    'DEMO: loeme teenuse osutatuks. Päriselus kinnitab ühistu lõpetamise ja hindab pakkujat pärast tööde lõppu.',
  );
  await completeService('Hoov ja kõnniteed olid puhtad. Reageerimine vastas kokkuleppele.');
  await snapshot('rating');
  await logout();
  await login('buyer2@demo.test', 'Naaberühistu');
  await completeService('Naaberühistute ühine tellimus toimis hästi.');
  await logout();
  await login('buyer3@demo.test');
  await completeService('Hea teenus ja selge ühine hinnakokkulepe.');
  await logout();

  await stage(
    'Administraator kontrollib TEST pearaamatut',
    'Kolm testtagatist: kokku 300 €. Teenustasu on 4% lõplikust 700 € hinnast: kokku 84 €. Pakkujale tagatistest 216 €.',
  );
  await login('admin@demo.test', 'Administraator');
  await navigate('Haldus');
  await click(button('TEST pearaamat'));
  await snapshot('ledger');
  await stage(
    'Püsiv ajalugu ja lõpetatud hange',
    'Auditilogi säilitab toimingud. Taustatöö on valmis ja kõigi kolme ühistu teenus on lõpetatud.',
  );
  await click(button('Auditilogi'));
  await snapshot('audit');
  await click(button('Taustatööd'));
  const job = page.getByTestId('job-row').filter({ hasText: title });
  await expect(job).toContainText('Valmis');
  await reveal(job);
  await snapshot('worker');
  await click(button('Hangete haldus'));
  await expect(page.getByTestId('admin-procurement').filter({ hasText: title })).toContainText(
    'Lõpetatud',
  );
  await snapshot('completed');
  await stage(
    'Ühine hange on lõpetatud',
    'Hankesoov → naabrite kutsed → pakkumine → kolm makstud liitumist → soodsam hind → lepingud → hinnangud.',
  );
  await pause(5500);

  const { rows: procurements } = await recording.query(
    'SELECT status,best_price_cents,succeeded_at,frozen_at,join_deadline_at,finalized_at FROM procurements WHERE id=$1',
    [procurementId],
  );
  const { rows: commitments } = await recording.query(
    'SELECT status,deposit_cents,captured_at,refunded_at FROM commitments WHERE procurement_id=$1',
    [procurementId],
  );
  const { rows: contracts } = await recording.query(
    "SELECT status,price_cents,deposit_credit_cents,balance_cents,rating,(final_snapshot->>'serviceFeeCents')::integer AS service_fee_cents,(final_snapshot->>'supplierPayoutCents')::integer AS supplier_payout_cents FROM contracts WHERE procurement_id=$1",
    [procurementId],
  );
  const { rows: ledger } = await recording.query(
    'SELECT kind,count(*)::integer AS count,sum(amount_cents)::integer AS cents,bool_and(is_test) AS all_test FROM ledger WHERE procurement_id=$1 GROUP BY kind ORDER BY kind',
    [procurementId],
  );
  assert.equal(procurements[0].status, 'COMPLETED');
  assert.equal(procurements[0].best_price_cents, 70000);
  assert.ok(procurements[0].succeeded_at && procurements[0].frozen_at);
  assert.ok(procurements[0].finalized_at >= procurements[0].join_deadline_at);
  assert.equal(commitments.length, 3);
  assert.ok(
    commitments.every((row) => row.deposit_cents === 10000 && row.captured_at && !row.refunded_at),
  );
  assert.equal(contracts.length, 3);
  assert.ok(
    contracts.every(
      (row) =>
        row.status === 'COMPLETED' &&
        row.price_cents === 70000 &&
        row.deposit_credit_cents === 10000 &&
        row.balance_cents === 60000 &&
        row.service_fee_cents === 2800 &&
        row.supplier_payout_cents === 7200 &&
        row.rating === 5,
    ),
  );
  assert.deepEqual(ledger, [
    { kind: 'DEPOSIT', count: 3, cents: 30000, all_test: true },
    { kind: 'PLATFORM_FEE', count: 3, cents: 8400, all_test: true },
    { kind: 'SUPPLIER_PAYOUT', count: 3, cents: 21600, all_test: true },
  ]);
  const after = await businessFingerprint();
  assert.deepEqual(after, before, 'Main pilot business records changed during recording');
  const video = page.video();
  await context.close();
  context = undefined;
  const raw = resolve(output, 'uhishange-full-process.webm');
  await rename(await video.path(), raw);
  const probe = JSON.parse(
    await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', raw]),
  );
  const duration = Number(probe.format.duration);
  const removed = cuts.reduce((total, cut) => total + cut.end - cut.start, 0);
  const finalDuration = duration - removed;
  const adjusted = chapters.map((chapter) => ({
    ...chapter,
    videoSeconds: Math.max(
      0,
      chapter.sourceSeconds -
        cuts.reduce(
          (total, cut) => total + Math.max(0, Math.min(chapter.sourceSeconds, cut.end) - cut.start),
          0,
        ),
    ),
  }));
  let metadata = ';FFMETADATA1\ntitle=Ühishange — kogu hankeprotsessi demo\n';
  adjusted.forEach((chapter, index) => {
    metadata += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(chapter.videoSeconds * 1000)}\nEND=${Math.round((adjusted[index + 1]?.videoSeconds ?? finalDuration) * 1000)}\ntitle=${chapter.title}\n`;
  });
  await writeFile(resolve(output, 'chapters.ffmetadata'), metadata);
  const args = ['-y', '-i', raw, '-i', resolve(output, 'chapters.ffmetadata')];
  if (cuts.length) {
    assert.equal(cuts.length, 1);
    const cut = cuts[0];
    const filter = `[0:v]trim=start=0:end=${cut.start},setpts=PTS-STARTPTS[a];[0:v]trim=start=${cut.end}:end=${duration},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[out]`;
    await writeFile(resolve(output, 'trim.ffscript'), filter);
    args.push('-filter_complex_script', resolve(output, 'trim.ffscript'), '-map', '[out]');
  } else args.push('-map', '0:v');
  args.push(
    '-map_metadata',
    '1',
    '-map_chapters',
    '1',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    resolve(output, 'uhishange-full-process.mp4'),
  );
  console.log('DEMO: Exporting MP4 and checking media');
  await run('ffmpeg', args);
  const media = JSON.parse(
    await run('ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      '-of',
      'json',
      resolve(output, 'uhishange-full-process.mp4'),
    ]),
  );
  assert.equal(media.streams[0].codec_name, 'h264');
  assert.equal(media.streams[0].width, 1440);
  assert.equal(media.streams[0].height, 900);
  assert.ok(Number(media.format.duration) > 120);
  assert.equal(media.chapters.length, chapters.length);
  // Decode the complete exported stream; corrupt packets must fail verification.
  await run('ffmpeg', [
    '-v',
    'error',
    '-xerror',
    '-i',
    resolve(output, 'uhishange-full-process.mp4'),
    '-f',
    'null',
    '-',
  ]);
  await writeFile(
    resolve(output, 'chapters.json'),
    JSON.stringify({ chapters: adjusted, shortenedWaits: cuts }, null, 2),
  );
  await writeFile(
    resolve(output, 'verification.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        databaseName,
        procurementId,
        mainBusinessRecordsUnchanged: true,
        mainBefore: before,
        mainAfter: after,
        procurement: procurements[0],
        commitments,
        contracts,
        ledger,
        browserErrors: errors,
        media: {
          codec: media.streams[0].codec_name,
          width: 1440,
          height: 900,
          seconds: Number(media.format.duration),
          chapters: media.chapters.length,
          fullDecodePassed: true,
        },
      },
      null,
      2,
    ),
  );
  const chapterList = adjusted
    .map((chapter) => {
      const minutes = Math.floor(chapter.videoSeconds / 60);
      const seconds = Math.floor(chapter.videoSeconds % 60)
        .toString()
        .padStart(2, '0');
      return `- ${minutes}:${seconds} ${chapter.title}`;
    })
    .join('\n');
  await writeFile(
    resolve(output, 'README.md'),
    `# Ühishange process recording\n\nThe MP4 records the real local portal with fictional organizations and TEST payments. Silent Estonian captions identify each role. Deadline waiting is shortened; season completion is explicitly simulated. The supplier fee is 4% of each final gross contract value, with a EUR 10 minimum: three EUR 700 contracts yield EUR 84 of TEST fees and EUR 216 of supplier deposit payouts.\n\n${chapterList}\n\nIsolated database: ${databaseName}. Main pilot business records remained unchanged. verification.json records assertions and media checks.\n`,
  );
  console.log('DEMO COMPLETE: ' + resolve(output, 'uhishange-full-process.mp4'));
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      { message: String(error), procurementId, databaseName, chapters, errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close();
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'close'), new Promise((done) => setTimeout(done, 3000))]);
    }
  }
  await recording.end().catch(() => {});
  await main.end();
  log.end();
}
