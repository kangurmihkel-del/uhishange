import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type {
  ApiErrorResponse,
  Organization,
  Procurement,
  ProcurementDetail,
  Commitment,
  Offer,
  SessionResponse,
  PriceTier,
} from '../../src/shared/types.js';

export const unique = (prefix: string) => prefix + '-' + randomUUID();
export const password = 'Demo2026!';
export const registrationPassword = 'Demo2026!!';
export const future = (milliseconds = 86_400_000) =>
  new Date(Date.now() + milliseconds).toISOString();

export interface HttpResponse<T> {
  status: number;
  body: T;
  headers: Headers;
}
export class Client {
  cookie = '';
  session!: SessionResponse;
  constructor(readonly baseUrl: string) {}
  async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
    const response = await fetch(this.baseUrl + '/api/v1' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: this.baseUrl,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const setCookie of response.headers.getSetCookie()) {
      this.cookie = setCookie.split(';')[0];
    }
    return {
      status: response.status,
      body: (await response.json()) as T,
      headers: response.headers,
    };
  }
  async ok<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>(method, path, body);
    expect(response.status, JSON.stringify(response.body)).toBeGreaterThanOrEqual(200);
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body;
  }
  async error(method: string, path: string, body?: unknown, status = 403) {
    const response = await this.request<ApiErrorResponse>(method, path, body);
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    expect(response.body.error.code).toBeTruthy();
    expect(response.body.error.message).toBeTruthy();
    return response.body.error;
  }
  get<T>(path: string) {
    return this.ok<T>('GET', path);
  }
  post<T>(path: string, body?: unknown) {
    return this.ok<T>('POST', path, body);
  }
  put<T>(path: string, body: unknown) {
    return this.ok<T>('PUT', path, body);
  }
  get organization(): Organization {
    const organization = this.session.memberships.find(
      (m) => m.status === 'approved' && m.role === 'representative',
    )?.organization;
    if (!organization) throw new Error('Fixture user has no approved representative organization');
    return organization;
  }
}

export interface Runtime {
  baseUrl: string;
  pool: Pool;
  server: Server;
  admin: Client;
  supplier: Client;
  buyers: Client[];
  anonymous: Client;
  close(): Promise<void>;
}
export async function startRuntime(): Promise<Runtime> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
    throw new Error('Integration tests require an isolated database ending in _test');
  const { pool } = await import('../../src/server/db.js');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  const { bootstrap } = await import('../../src/server/bootstrap.js');
  await bootstrap({ seed: true });
  const { createApp } = await import('../../src/server/app.js');
  const server = createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP server failed to bind');
  const baseUrl = 'http://127.0.0.1:' + address.port;
  async function login(email: string) {
    const client = new Client(baseUrl);
    const response = await client.request<SessionResponse>('POST', '/login', { email, password });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    client.session = response.body;
    return client;
  }
  const [admin, supplier, ...buyers] = await Promise.all(
    ['admin', 'supplier', ...Array.from({ length: 8 }, (_, index) => 'buyer' + (index + 1))].map(
      (name) => login(name + '@demo.test'),
    ),
  );
  return {
    baseUrl,
    pool,
    server,
    admin,
    supplier,
    buyers,
    anonymous: new Client(baseUrl),
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    },
  };
}

export function procurementInput(client: Client, overrides: Record<string, unknown> = {}) {
  const year = new Date().getUTCFullYear() + 1;
  return {
    organizationId: client.organization.id,
    title: unique('Test lumekoristus'),
    description: 'Parkla ja kõnniteede ühine talvine hooldus.',
    radiusM: 500,
    joinDeadlineAt: future(),
    spec: {
      seasonStart: year + '-11-01',
      seasonEnd: year + 1 + '-04-01',
      areaM2: 400,
      parkingM2: 200,
      walkwayM: 60,
      triggerCm: 5,
      responseHours: 4,
      gritting: true,
      snowHauling: false,
    },
    ...overrides,
  };
}
export async function procurement(
  client: Client,
  overrides: Record<string, unknown> = {},
): Promise<Procurement> {
  const result = await client.post<{ procurement: Procurement }>(
    '/procurements',
    procurementInput(client, overrides),
  );
  return result.procurement;
}
export async function selectedProcurement(
  runtime: Runtime,
  options: { deadline?: string; tiers?: PriceTier[]; deposit?: number } = {},
) {
  const p = await procurement(
    runtime.buyers[0],
    options.deadline ? { joinDeadlineAt: options.deadline } : {},
  );
  await runtime.buyers[0].post('/procurements/' + p.id + '/publish');
  const result = await runtime.supplier.post<{ offer: Offer }>(
    '/procurements/' + p.id + '/offers',
    {
      organizationId: runtime.supplier.organization.id,
      basePriceCents: 100_000,
      depositCents: options.deposit ?? 10_003,
      terms: 'Hooldus vastavalt ühisele teenusekirjeldusele.',
      validUntil: future(172_800_000),
      tiers: options.tiers ?? [
        { minParticipants: 2, priceCents: 90_000 },
        { minParticipants: 3, priceCents: 70_000 },
      ],
    },
  );
  await runtime.buyers[0].post('/procurements/' + p.id + '/select-offer', {
    offerId: result.offer.id,
  });
  return { procurement: p, offer: result.offer };
}
export async function commit(client: Client, procurementId: string) {
  const result = await client.post<{ commitment: Commitment }>(
    '/procurements/' + procurementId + '/commitments',
    { organizationId: client.organization.id, authorityConfirmed: true, scopeConfirmed: true },
  );
  return result.commitment;
}
export async function capture(client: Client, commitmentId: string, eventId = unique('capture')) {
  return client.post<{ commitment: Commitment; outcome: string; isTest: boolean }>(
    '/test-payments/' + commitmentId,
    { outcome: 'captured', eventId },
  );
}
export async function detail(client: Client, procurementId: string) {
  return client.get<ProcurementDetail>('/procurements/' + procurementId);
}
export async function waitUntil(iso: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, new Date(iso).getTime() - Date.now()) + 50),
  );
}

export async function startWorker(runtime: Runtime) {
  const applicationName = unique('test-worker');
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/server/worker.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PGAPPNAME: applicationName },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', (chunk) => {
    output = (output + String(chunk)).slice(-4_000);
  });
  worker.stderr.on('data', (chunk) => {
    output = (output + String(chunk)).slice(-4_000);
  });
  await once(worker, 'spawn');
  async function stop() {
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    const exited = once(worker, 'exit');
    worker.kill('SIGTERM');
    await exited;
  }
  try {
    const until = Date.now() + 5_000;
    while (Date.now() < until) {
      if (worker.exitCode !== null || worker.signalCode !== null)
        throw new Error('Worker exited before readiness: ' + output);
      const sessions = await runtime.pool.query(
        'SELECT pid FROM pg_stat_activity WHERE application_name=$1',
        [applicationName],
      );
      if (sessions.rowCount) return { stop };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Worker did not connect to PostgreSQL: ' + output);
  } catch (error) {
    await stop();
    throw error;
  }
}
export async function waitForFinalization(runtime: Runtime, procurementId: string) {
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    const row = await runtime.pool.query<{ status: string }>(
      'SELECT status FROM procurements WHERE id=$1',
      [procurementId],
    );
    if (row.rows[0]?.status === 'FINALIZED') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Restarted worker did not finalize the due procurement');
}
