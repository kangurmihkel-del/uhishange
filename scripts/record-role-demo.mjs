import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';

// Real-UI recordings: naturally paced detailed and concise role journeys.
// Both exclude administrator work and run against separate databases.
const runId = Date.now().toString();
const databaseName = `uhishange_role_demo_${runId}`;
assert.match(databaseName, /^uhishange_role_demo_\d+$/);
const output = resolve('recordings', runId);
const mode = process.env.DEMO_MODE || 'slow';
assert.ok(['slow', 'concise'].includes(mode), 'DEMO_MODE must be slow or concise');
const concise = mode === 'concise';
const targetSeconds = concise ? 60 : 90;
const timings = concise
  ? {
      request: 4000,
      neighbors: 4000,
      offer: 5000,
      sendFocus: 10000,
      comparison: 5000,
      selected: 4000,
    }
  : {
      request: 8000,
      neighbors: 8000,
      offer: 9000,
      sendFocus: 15000,
      comparison: 9000,
      selected: 7000,
    };
const navigation = concise
  ? { beforeClick: 150, afterClick: 480, field: 170, scroll: 320 }
  : { beforeClick: 190, afterClick: 560, field: 210, scroll: 380 };
const versionLabel = concise
  ? '60-second concise naturally paced role demo'
  : '90-second detailed naturally paced role demo';
const videoStem = concise
  ? 'uhishange-role-demo-concise-60s-natural'
  : 'uhishange-role-demo-detailed-90s-natural';
const mainURL = new URL(
  process.env.DATABASE_URL || 'postgres://uhishange:uhishange@localhost:54329/uhishange',
);
const recordingURL = new URL(mainURL);
recordingURL.pathname = `/${databaseName}`;
const baseURL = 'http://127.0.0.1:3003';
const environment = {
  ...process.env,
  DATABASE_URL: recordingURL.toString(),
  TEST_PAYMENTS: 'true',
  PORT: '3003',
  HOST: '127.0.0.1',
};
const title = 'Naabrite ühine lumekoristus (60 s demo)';
const chapters = [];
const errors = [];
const children = [];
let browser;
let context;
let page;
let procurementId;
let started;

await mkdir(resolve(output, 'frames'), { recursive: true });
const log = createWriteStream(resolve(output, 'runtime.log'));
const recording = new pg.Client({ connectionString: recordingURL.toString() });

async function run(command, args, env = process.env) {
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'close');
  assert.equal(code, 0, `${command} failed: ${stderr.slice(-3000)}`);
  return stdout;
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
}

async function checkPort() {
  const probe = net.createServer();
  await new Promise((done, reject) => {
    probe.once('error', reject);
    probe.listen(3003, '127.0.0.1', done);
  });
  await new Promise((done) => probe.close(done));
}

const elapsed = () => (Date.now() - started) / 1000;
const pause = (milliseconds = navigation.afterClick) => page.waitForTimeout(milliseconds);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const label = (name) => page.getByLabel(name, { exact: true });
const escape = (value) => value.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
const serviceField = (name) => page.getByLabel(new RegExp(`^${escape(name)}(?:\\s*\\*)?$`));

async function reveal(locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box || box.y < 70 || box.y + box.height > 830) {
    await locator.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
    await pause(navigation.scroll);
  }
}

async function click(locator) {
  await reveal(locator);
  const box = await locator.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 7 });
  await pause(navigation.beforeClick);
  await locator.click();
  await pause(navigation.afterClick);
}

async function fill(locator, value) {
  await reveal(locator);
  await locator.fill(value);
  await locator.press('Tab');
  await pause(navigation.field);
}

async function navigate(name) {
  await click(
    page
      .getByRole('navigation', { name: 'Põhinavigatsioon' })
      .getByRole('link', { name, exact: true }),
  );
}

async function login(roleButton) {
  await click(button(roleButton));
  await expect(button('Logi välja')).toBeVisible();
}

async function logout() {
  await click(button('Logi välja'));
  await expect(button('Ostja')).toBeVisible();
}

async function nextAction(name) {
  await click(button(name, page.getByTestId('next-action')));
}

async function stage(role, icon, titleText, description) {
  chapters.push({ title: `${icon} ${role}: ${titleText}`, sourceSeconds: elapsed() });
  await page.evaluate(
    ({ role, icon, titleText, description }) => {
      localStorage.setItem(
        'short-recording-caption',
        JSON.stringify({ role, icon, titleText, description }),
      );
      const set = (id, text) => (document.querySelector(id).textContent = text);
      set('#recording-role-icon', icon);
      set('#recording-role-name', role);
      set('#recording-stage', titleText);
      set('#recording-description', description);
    },
    { role, icon, titleText, description },
  );
  await pause(850);
}

async function snapshot(name, milliseconds = 900) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name}: horizontal overflow`,
  );
  assert.deepEqual(errors, [], `${name}: browser errors`);
  await page.screenshot({ path: resolve(output, 'frames', `${name}.png`) });
  await pause(milliseconds);
}

async function spotlight(locator, milliseconds) {
  await reveal(locator);
  const box = await locator.boundingBox();
  assert.ok(box);
  await page.evaluate(({ x, y, width, height }) => {
    const caption = document.querySelector('#recording-caption');
    caption.style.top = '18px';
    caption.style.bottom = 'auto';
    const ring = document.querySelector('#recording-spotlight');
    ring.style.left = `${x - 10}px`;
    ring.style.top = `${y - 10}px`;
    ring.style.width = `${width + 20}px`;
    ring.style.height = `${height + 20}px`;
    ring.hidden = false;
  }, box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await pause(milliseconds);
  await page.evaluate(() => {
    document.querySelector('#recording-spotlight').hidden = true;
    const caption = document.querySelector('#recording-caption');
    caption.style.top = 'auto';
    caption.style.bottom = '18px';
  });
}

try {
  await checkPort();
  const adminURL = new URL(mainURL);
  adminURL.pathname = '/postgres';
  const administrator = new pg.Client({ connectionString: adminURL.toString() });
  await administrator.connect();
  try {
    await administrator.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await administrator.end();
  }
  await run(process.execPath, ['dist/server/server/bootstrap.js'], environment);
  await recording.connect();
  start('dist/server/server/server.js');
  await expect
    .poll(
      async () => {
        try {
          return (await (await fetch(`${baseURL}/api/v1/health`)).json()).status;
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
        '#recording-caption{position:fixed;left:24px;right:24px;bottom:18px;display:grid;grid-template-columns:60px 1fr;gap:14px;align-items:center;padding:13px 18px;background:rgba(247,245,240,.98);border:2px solid #203c35;border-radius:12px;box-shadow:0 5px 20px #0002;z-index:2147483647;pointer-events:none;font:16px/1.35 "Work Sans",sans-serif;color:#203c35}#recording-role-icon{font:42px/1 Georgia,serif;text-align:center;color:#a55d40}#recording-role-name{font-size:12px;font-weight:700;letter-spacing:.12em;color:#577169}#recording-stage{font-size:18px;font-weight:700}#recording-description{font-size:14px;color:#51625c}#recording-cursor{position:fixed;width:18px;height:18px;border:2px solid white;background:#203c35bb;border-radius:50%;box-shadow:0 0 0 2px #203c35;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%)}#recording-spotlight{position:fixed;border:4px solid #a55d40;border-radius:12px;box-shadow:0 0 0 9999px rgba(32,60,53,.18),0 0 24px #a55d40;z-index:2147483646;pointer-events:none}';
      document.head.append(style);
      const caption = document.createElement('div');
      caption.id = 'recording-caption';
      caption.innerHTML =
        '<div id="recording-role-icon"></div><div><div id="recording-role-name"></div><div id="recording-stage"></div><div id="recording-description"></div></div>';
      document.body.append(caption);
      const saved = JSON.parse(
        localStorage.getItem('short-recording-caption') ||
          '{"role":"KLIENT","icon":"♔","titleText":"Ühishange","description":"Fiktiivsed organisatsioonid ja TEST-keskkond."}',
      );
      document.querySelector('#recording-role-icon').textContent = saved.icon;
      document.querySelector('#recording-role-name').textContent = saved.role;
      document.querySelector('#recording-stage').textContent = saved.titleText;
      document.querySelector('#recording-description').textContent = saved.description;
      const cursor = document.createElement('div');
      cursor.id = 'recording-cursor';
      document.body.append(cursor);
      const spotlight = document.createElement('div');
      spotlight.id = 'recording-spotlight';
      spotlight.hidden = true;
      document.body.append(spotlight);
      addEventListener('pointermove', (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
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
    'KLIENT · ÜHISTU',
    '♔',
    'Hankesoov naabritega koos',
    'Klient algatab ühise tellimuse. Vorm on eeltäidetud.',
  );
  await login('Ostja');
  await click(page.getByRole('link', { name: 'Uus hange', exact: true }));
  const deadline = new Date(Date.now() + 10 * 60 * 1000);
  const deadlineParts = Object.fromEntries(
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
  await fill(label('Hanke pealkiri'), title);
  await fill(label('Kirjeldus'), 'Naaberühistute hoovide ja kõnniteede talvine hooldus.');
  await fill(
    label('Liitumise tähtaeg'),
    `${deadlineParts.day}.${deadlineParts.month}.${deadlineParts.year} ${deadlineParts.hour}:${deadlineParts.minute}`,
  );
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
  await snapshot('client-prefilled-request', timings.request);
  await click(button('Salvesta hange'));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  procurementId = page.url().split('#procurement/')[1];
  assert.ok(procurementId);
  await nextAction('Avalda hange');
  await nextAction('Kutsu naabrid');
  await stage(
    'KLIENT · ÜHISTU',
    '♔',
    concise ? 'Klient valib ühistud' : 'Naabrid kaardil',
    concise
      ? 'Klient valib kaardilt naaberühistu enne pakkumise osa.'
      : 'Klient näeb lähimaid ühistuid ja saadab neile kutse.',
  );
  const map = page.getByRole('img', { name: /Hanke keskpunkt ja läheduses olevad ühistud/ });
  await click(map.getByRole('button').first());
  await snapshot('client-neighbors', timings.neighbors);
  await click(button('Saada kutsed'));
  await logout();

  await stage(
    'HANKIJA · TEENUSEPAKKUJA',
    '♞',
    'Eeltäidetud pakkumine',
    'Hankija määrab hinnatasemed ja 100 € TEST-tagatisraha.',
  );
  await login('Pakkuja');
  await navigate('Hanked');
  await fill(label('Otsi hankeid'), title);
  await click(page.getByRole('link', { name: new RegExp(escape(title)) }).first());
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
      'Lumekoristus ja libedusetõrje kirjeldatud aladel. Teenuse jääk arveldatakse otse pakkujaga.',
    ],
  ])
    await fill(locator, value);
  await snapshot('supplier-prefilled-offer', timings.offer);
  const sendOffer = button('Saada pakkumine');
  await stage(
    'HANKIJA · TEENUSEPAKKUJA',
    '♞',
    'Pakkumine on saatmiseks valmis',
    'Fookus: kontrolli hinnatasemeid, tingimusi ja 10% tagatisepõhist teenustasu.',
  );
  await spotlight(sendOffer, timings.sendFocus);
  await click(sendOffer);
  await expect(
    page.getByRole('status').filter({ hasText: 'Pakkumine on esitatud.' }),
  ).toBeVisible();
  await logout();

  await stage(
    'KLIENT · ÜHISTU',
    '♔',
    'Klient võrdleb ja valib',
    'Pakkumine on nähtav. Klient valib selle enne ühistute liitumist.',
  );
  await login('Ostja');
  await navigate('Hanked');
  await fill(label('Otsi hankeid'), title);
  await click(page.getByRole('link', { name: new RegExp(escape(title)) }).first());
  await nextAction('Võrdle ja vali pakkumine');
  await snapshot('client-offer-comparison', timings.comparison);
  await click(button('Vali pakkumine'));
  await expect(page.getByText('Valitud pakkumine', { exact: true })).toBeVisible();
  await snapshot('client-selected-offer', timings.selected);
  await stage(
    'KLIENT · ÜHISTU',
    '♔',
    'Ühine hange on valmis liitumiseks',
    'Kutsed, pakkumine ja valik on tehtud. Järgmine samm on ühistute TEST-liitumine.',
  );

  const remaining = targetSeconds - elapsed();
  if (remaining > 0) await pause(Math.round(remaining * 1000));
  assert.ok(elapsed() >= targetSeconds, `Recording ended early: ${elapsed()} seconds`);
  const { rows: procurementRows } = await recording.query(
    'SELECT status,selected_offer_id FROM procurements WHERE id=$1',
    [procurementId],
  );
  assert.equal(procurementRows[0].status, 'OPEN');
  assert.ok(procurementRows[0].selected_offer_id);
  assert.deepEqual(errors, []);

  const video = page.video();
  await context.close();
  context = undefined;
  const raw = resolve(output, `${videoStem}-raw.webm`);
  await rename(await video.path(), raw);
  const outputVideo = resolve(output, `${videoStem}.mp4`);
  await run('ffmpeg', [
    '-y',
    '-i',
    raw,
    '-t',
    String(targetSeconds),
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
    outputVideo,
  ]);
  const media = JSON.parse(
    await run('ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      outputVideo,
    ]),
  );
  assert.equal(media.streams[0].codec_name, 'h264');
  assert.equal(media.streams[0].width, 1440);
  assert.equal(media.streams[0].height, 900);
  assert.ok(
    Number(media.format.duration) >= targetSeconds - 0.5 &&
      Number(media.format.duration) <= targetSeconds + 0.5,
  );
  await run('ffmpeg', ['-v', 'error', '-xerror', '-i', outputVideo, '-f', 'null', '-']);
  await writeFile(
    resolve(output, 'verification.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        databaseName,
        procurementId,
        excludesAdministrator: true,
        roles: { client: '♔', supplier: '♞' },
        supplierOfferFieldsPrefilled: true,
        mode,
        naturallyPacedNavigation: true,
        offerSubmissionSpotlightSeconds: timings.sendFocus / 1000,
        browserErrors: errors,
        procurement: procurementRows[0],
        media: {
          codec: media.streams[0].codec_name,
          width: 1440,
          height: 900,
          seconds: Number(media.format.duration),
          fullDecodePassed: true,
        },
        chapters,
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(output, 'README.md'),
    `# Ühishange ${versionLabel}\n\nThis real-UI recording excludes administrator work. It shows a client (♔) creating a prefilled request, selecting a neighboring association on the map, then a supplier (♞) submitting a prefilled offer. Navigation is deliberately slower while the static form and result views are shorter. The submission button is highlighted for ${timings.sendFocus / 1000} seconds. All activity is fictional and uses the TEST environment.\n`,
  );
  console.log(`DEMO COMPLETE: ${outputVideo}`);
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      { message: String(error), databaseName, procurementId, chapters, errors },
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
  log.end();
}
