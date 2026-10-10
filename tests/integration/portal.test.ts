import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AdminResponse,
  Contract,
  ImportPreview,
  Invitation,
  MailboxMessageKind,
  MailboxResponse,
  Membership,
  Offer,
  Organization,
  Procurement,
  SessionResponse,
} from '../../src/shared/types.js';
import {
  Client,
  capture,
  commit,
  detail,
  future,
  password,
  registrationPassword,
  procurement,
  procurementInput,
  selectedProcurement,
  startRuntime,
  startWorker,
  waitForFinalization,
  unique,
  waitUntil,
  type Runtime,
} from './helpers.js';

let runtime: Runtime;
beforeAll(async () => {
  runtime = await startRuntime();
});
afterAll(async () => {
  if (runtime) await runtime.close();
});

async function ledger(procurementId: string) {
  const result = await runtime.pool.query<{ kind: string; total: number; count: number }>(
    'SELECT kind, SUM(amount_cents)::integer AS total, COUNT(*)::integer AS count FROM ledger WHERE procurement_id=$1 GROUP BY kind',
    [procurementId],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.kind, { total: row.total, count: row.count }]),
  );
}
async function finalize() {
  const { processDueProcurements } = await import('../../src/server/domain.js');
  await processDueProcurements();
}

async function mailbox(client: Client, procurementId?: string, kind?: MailboxMessageKind) {
  const response = await client.get<MailboxResponse>('/mailbox');
  expect(response.unreadCount).toBe(response.messages.filter((message) => !message.readAt).length);
  return response.messages.filter(
    (message) =>
      (!procurementId || message.procurementId === procurementId) &&
      (!kind || message.kind === kind),
  );
}

describe('accounts, organizations and authorization', () => {
  it('uses database sessions, verifies password hashes, rejects credentials, and logs out', async () => {
    expect(await runtime.anonymous.get('/health')).toEqual({
      status: 'ok',
      database: 'ready',
      paymentMode: 'TEST',
    });
    const client = new Client(runtime.baseUrl);
    await client.error('POST', '/login', { email: 'buyer1@demo.test', password: 'incorrect' }, 401);
    const response = await client.request<SessionResponse>('POST', '/login', {
      email: 'buyer1@demo.test',
      password,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite');
    expect((await client.get<SessionResponse>('/session')).user?.email).toBe('buyer1@demo.test');
    const stored = await runtime.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email=$1',
      ['buyer1@demo.test'],
    );
    expect(stored.rows[0].password_hash).not.toBe(password);
    expect(stored.rows[0].password_hash.length).toBeGreaterThan(32);
    await client.post('/logout');
    expect((await client.get<SessionResponse>('/session')).user).toBeNull();
    await client.error('POST', '/procurements', {}, 401);
  });

  it('registers a representative, approves membership, and prevents pending or viewer buyer authority', async () => {
    const representative = new Client(runtime.baseUrl);
    const email = unique('representative') + '@test.local';
    const session = await representative.post<SessionResponse>('/register', {
      email,
      password: registrationPassword,
      name: 'Uus esindaja',
    });
    expect(session.user?.email).toBe(email);
    representative.session = session;
    const createdResponse = await representative.post<{
      organization: Organization;
      memberships: Membership[];
    }>('/organizations', {
      registryCode: String(80_000_000 + Math.floor(Math.random() * 9_999_999)),
      name: unique('Test KÜ'),
      orgType: 'BUYER',
      address: 'Testi 1, Mustamäe',
      latitude: 59.403,
      longitude: 24.674,
      email: 'private@example.test',
    });
    const created = {
      organization: createdResponse.organization,
      membership: createdResponse.memberships[0],
    };
    expect(created.membership.status).toBe('pending');
    const pendingSession = await representative.get<SessionResponse>('/session');
    representative.session = pendingSession;
    await representative.error(
      'POST',
      '/procurements',
      procurementInput(runtime.buyers[0], { organizationId: created.organization.id }),
      403,
    );
    await runtime.admin.post('/admin/memberships/' + created.membership.id, { status: 'approved' });
    representative.session = await representative.get<SessionResponse>('/session');
    expect(representative.session.memberships[0].status).toBe('approved');
    const p = await procurement(representative);
    expect(p.organizationId).toBe(created.organization.id);
    const updated = await representative.put<{ organization: Organization }>(
      '/organizations/' + created.organization.id,
      {
        name: 'Muudetud KÜ',
        address: 'Testi 2, Mustamäe',
        latitude: 59.4031,
        longitude: 24.6741,
        email: 'new-private@example.test',
      },
    );
    expect(updated.organization.name).toBe('Muudetud KÜ');
    const publicOrganizations = await runtime.buyers[0].get<{ organizations: Organization[] }>(
      '/organizations',
    );
    expect(
      publicOrganizations.organizations.find((o) => o.id === created.organization.id)?.email,
    ).toBeUndefined();
    const viewer = new Client(runtime.baseUrl);
    await viewer.post('/register', {
      email: unique('viewer') + '@test.local',
      password: registrationPassword,
      name: 'Vaatleja',
    });
    const requested = await viewer.post<{ membership: Membership }>(
      '/organizations/' + created.organization.id + '/membership',
      { role: 'viewer' },
    );
    await runtime.admin.post('/admin/memberships/' + requested.membership.id, {
      status: 'approved',
    });
    await viewer.error('POST', '/procurements/' + p.id + '/publish', {}, 403);
    await runtime.buyers[1].error(
      'PUT',
      '/organizations/' + created.organization.id,
      {
        name: 'Unauthorized',
        address: 'Testi 3',
        latitude: 59.403,
        longitude: 24.675,
        email: 'attack@example.test',
      },
      403,
    );
    await representative.error('GET', '/admin', undefined, 403);
  });

  it('rejects cross-origin mutations and unauthorized procurement/supplier operations', async () => {
    const p = await procurement(runtime.buyers[0]);
    await runtime.buyers[1].error('POST', '/procurements/' + p.id + '/publish', {}, 403);
    await runtime.supplier.error('POST', '/procurements', procurementInput(runtime.supplier), 403);
    const response = await fetch(runtime.baseUrl + '/api/v1/logout', {
      method: 'POST',
      headers: { Cookie: runtime.buyers[0].cookie, Origin: 'https://untrusted.example' },
    });
    expect(response.status).toBe(403);
    expect((await runtime.buyers[0].get<SessionResponse>('/session')).user).not.toBeNull();
  });
});

describe('discovery, invitations and offer selection', () => {
  it('uses geography distance, persists invitation source, and invitations confer no authority', async () => {
    const center = runtime.buyers[0].organization;
    const inserted = await runtime.pool.query<{ id: string; registry_code: string }>(
      `WITH center AS (SELECT ST_SetSRID(ST_MakePoint($1,$2),4326)::geography AS point), positions AS (SELECT metres, ST_Project(point,metres,0)::geometry AS point FROM center CROSS JOIN (VALUES (499.0),(501.0)) AS distances(metres)) INSERT INTO organizations(registry_code,name,org_type,address,latitude,longitude,email) SELECT 'GEO-' || metres || '-' || $3, 'Boundary ' || metres,'BUYER','Mustamäe',ST_Y(point),ST_X(point),'private@boundary.test' FROM positions RETURNING id,registry_code`,
      [center.longitude, center.latitude, unique('radius')],
    );
    const inside = inserted.rows.find((row) => row.registry_code.startsWith('GEO-499'))!;
    const outside = inserted.rows.find((row) => row.registry_code.startsWith('GEO-501'))!;
    const requestedOutside = await runtime.buyers[7].post<{ membership: Membership }>(
      '/organizations/' + outside.id + '/membership',
      {},
    );
    await runtime.admin.post('/admin/memberships/' + requestedOutside.membership.id, {
      status: 'approved',
    });
    const outsideGroup = await selectedProcurement(runtime);
    await runtime.buyers[7].error(
      'POST',
      '/procurements/' + outsideGroup.procurement.id + '/commitments',
      { organizationId: outside.id, authorityConfirmed: true, scopeConfirmed: true },
      403,
    );
    const p = await procurement(runtime.buyers[0]);
    await runtime.buyers[0].post('/procurements/' + p.id + '/publish');
    const before = await detail(runtime.buyers[0], p.id);
    expect(before.nearby.find((o) => o.id === inside.id)?.distanceM).toBeCloseTo(499, 1);
    expect(before.nearby.some((o) => o.id === outside.id)).toBe(false);
    expect(before.nearby.every((o) => o.email === undefined)).toBe(true);
    expect(before.nearby.map((o) => o.distanceM)).toEqual(
      [...before.nearby.map((o) => o.distanceM)].sort((a, b) => a - b),
    );
    await runtime.buyers[0].post('/procurements/' + p.id + '/invitations', {
      organizationIds: [inside.id, runtime.buyers[1].organization.id],
    });
    const after = await detail(runtime.buyers[0], p.id);
    const invitation = after.invitations.find((i) => i.organizationId === inside.id);
    expect(invitation?.distanceM).toBeCloseTo(499, 1);
    expect(['RADIUS', 'MANUAL']).toContain(invitation?.source);
    const inbox = await runtime.buyers[1].get<{ invitations: Invitation[] }>('/invitations');
    const buyerInvitation = inbox.invitations.find((i) => i.procurementId === p.id)!;
    await runtime.buyers[1].post('/invitations/' + buyerInvitation.id + '/respond', {
      status: 'ACCEPTED',
    });
    await runtime.buyers[1].error('POST', '/procurements/' + p.id + '/publish', {}, 403);
    const wider = await procurement(runtime.buyers[0], { radiusM: 600 });
    await runtime.buyers[0].post('/procurements/' + wider.id + '/publish');
    expect(
      (await detail(runtime.buyers[0], wider.id)).nearby.some((o) => o.id === outside.id),
    ).toBe(true);
  });

  it('validates snow specification and tiers, selects only for the initiator, and freezes accepted terms', async () => {
    await runtime.buyers[0].error(
      'POST',
      '/procurements',
      { organizationId: runtime.buyers[0].organization.id, title: 'Invalid specification' },
      400,
    );
    const p = await procurement(runtime.buyers[0]);
    await runtime.buyers[0].post('/procurements/' + p.id + '/publish');
    const offerInput = {
      organizationId: runtime.supplier.organization.id,
      basePriceCents: 100_000,
      depositCents: 10_000,
      terms: 'Test terms',
      validUntil: future(),
      tiers: [
        { minParticipants: 2, priceCents: 90_000 },
        { minParticipants: 3, priceCents: 95_000 },
      ],
    };
    await runtime.supplier.error('POST', '/procurements/' + p.id + '/offers', offerInput, 400);
    await runtime.supplier.error(
      'POST',
      '/procurements/' + p.id + '/offers',
      { ...offerInput, depositCents: 100_000, tiers: [{ minParticipants: 2, priceCents: 90_000 }] },
      400,
    );
    await runtime.buyers[0].error(
      'POST',
      '/procurements/' + p.id + '/offers',
      {
        ...offerInput,
        organizationId: runtime.buyers[0].organization.id,
        tiers: [{ minParticipants: 2, priceCents: 90_000 }],
      },
      403,
    );
    const { procurement: selected, offer } = await selectedProcurement(runtime);
    await runtime.buyers[1].error(
      'POST',
      '/procurements/' + selected.id + '/select-offer',
      { offerId: offer.id },
      403,
    );
    await runtime.buyers[0].error(
      'POST',
      '/procurements/' + selected.id + '/commitments',
      {
        organizationId: runtime.buyers[0].organization.id,
        authorityConfirmed: false,
        scopeConfirmed: true,
      },
      400,
    );
    const accepted = await commit(runtime.buyers[0], selected.id);
    expect(accepted.status).toBe('PENDING');
    const d = await detail(runtime.buyers[0], selected.id);
    expect(d.procurement.frozenAt).not.toBeNull();
    expect(d.procurement.activeCount).toBe(0);
    await runtime.buyers[0].error(
      'POST',
      '/procurements/' + selected.id + '/select-offer',
      { offerId: offer.id },
      409,
    );
    await expect(
      runtime.pool.query('UPDATE offers SET terms=$1 WHERE id=$2', ['Changed', offer.id]),
    ).rejects.toThrow('frozen');
    await expect(
      runtime.pool.query('UPDATE commitments SET acceptance_snapshot=$1 WHERE id=$2', [
        { tampered: true },
        accepted.id,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      runtime.pool.query('UPDATE procurements SET spec=$1 WHERE id=$2', [
        { tampered: true },
        selected.id,
      ]),
    ).rejects.toThrow('Frozen');
    await runtime.buyers[1].error(
      'POST',
      '/procurements/' + selected.id + '/commitments',
      {
        organizationId: runtime.buyers[0].organization.id,
        authorityConfirmed: true,
        scopeConfirmed: true,
      },
      403,
    );
    const list = await runtime.buyers[0].get<{ procurements: Procurement[] }>('/procurements');
    expect(list.procurements.some((item) => item.id === selected.id)).toBe(true);
  });
});

describe('durable organization mailbox', () => {
  it('deduplicates invitations and persists private per-user reads without granting authority', async () => {
    await runtime.anonymous.error('GET', '/mailbox', undefined, 401);
    const seed = (await mailbox(runtime.buyers[1])).find(
      (message) => message.kind === 'INVITATION' && message.invitation?.status === 'PENDING',
    );
    expect(seed).toBeDefined();
    expect(seed!.organizationId).toBe(runtime.buyers[1].organization.id);
    expect(seed!.procurementTitle).toBe(seed!.invitation!.procurementTitle);
    expect(seed!.audience).toBe('MEMBERS');
    await runtime.anonymous.error('POST', '/mailbox/' + seed!.id + '/read', {}, 401);

    const p = await procurement(runtime.buyers[0]);
    await runtime.buyers[0].post('/procurements/' + p.id + '/publish');
    const invitationInput = { organizationIds: [runtime.buyers[1].organization.id] };
    await runtime.buyers[0].post('/procurements/' + p.id + '/invitations', invitationInput);
    await runtime.buyers[0].post('/procurements/' + p.id + '/invitations', invitationInput);
    const messages = await mailbox(runtime.buyers[1], p.id, 'INVITATION');
    expect(messages).toHaveLength(1);
    const message = messages[0];
    expect(message.readAt).toBeNull();
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.body.length).toBeGreaterThan(0);
    expect(message.invitation?.organizationId).toBe(runtime.buyers[1].organization.id);
    expect(message.invitation?.distanceM).toBeGreaterThan(0);
    expect(JSON.stringify(message)).not.toContain('buyer2@demo.test');
    expect(await mailbox(runtime.buyers[2], p.id)).toHaveLength(0);
    await runtime.buyers[2].error('POST', '/mailbox/' + message.id + '/read', {}, 404);
    await runtime.buyers[1].error(
      'POST',
      '/mailbox/00000000-0000-4000-8000-000000000000/read',
      {},
      404,
    );

    const viewer = new Client(runtime.baseUrl);
    const viewerEmail = unique('mailbox-viewer') + '@test.local';
    await viewer.post('/register', {
      name: 'Postkasti vaatleja',
      email: viewerEmail,
      password: registrationPassword,
    });
    const requested = await viewer.post<{ membership: Membership }>(
      '/organizations/' + runtime.buyers[1].organization.id + '/membership',
      { role: 'viewer' },
    );
    expect(await mailbox(viewer)).toHaveLength(0);
    await viewer.error('POST', '/mailbox/' + message.id + '/read', {}, 404);
    await runtime.admin.post('/admin/memberships/' + requested.membership.id, {
      status: 'approved',
    });
    expect((await mailbox(viewer, p.id))[0].readAt).toBeNull();
    const viewed = await viewer.post<{ message: MailboxResponse['messages'][number] }>(
      '/mailbox/' + message.id + '/read',
    );
    expect(viewed.message.readAt).not.toBeNull();
    expect((await mailbox(runtime.buyers[1], p.id))[0].readAt).toBeNull();
    await viewer.error(
      'POST',
      '/invitations/' + message.invitation!.id + '/respond',
      { status: 'ACCEPTED' },
      403,
    );
    const beforeReading = await runtime.buyers[1].get<MailboxResponse>('/mailbox');
    const readResponses = await Promise.all([
      runtime.buyers[1].post<{ message: MailboxResponse['messages'][number] }>(
        '/mailbox/' + message.id + '/read',
      ),
      runtime.buyers[1].post<{ message: MailboxResponse['messages'][number] }>(
        '/mailbox/' + message.id + '/read',
      ),
    ]);
    expect(readResponses[0].message.readAt).not.toBeNull();
    expect(readResponses[1].message.readAt).toBe(readResponses[0].message.readAt);
    expect((await runtime.buyers[1].get<MailboxResponse>('/mailbox')).unreadCount).toBe(
      beforeReading.unreadCount - 1,
    );
    await expect(
      runtime.pool.query('UPDATE mailbox_messages SET body=$1 WHERE id=$2', [
        'Rewritten message',
        message.id,
      ]),
    ).rejects.toThrow('Append-only');
    await expect(
      runtime.pool.query('DELETE FROM mailbox_reads WHERE user_id=$1 AND message_id=$2', [
        runtime.buyers[1].session.user!.id,
        message.id,
      ]),
    ).rejects.toThrow('Append-only');
    await runtime.buyers[1].post('/logout');
    await runtime.buyers[1].post('/login', { email: 'buyer2@demo.test', password });
    expect((await mailbox(runtime.buyers[1], p.id))[0].readAt).toBe(
      readResponses[0].message.readAt,
    );
    const { bootstrap } = await import('../../src/server/bootstrap.js');
    await bootstrap({ seed: true });
    expect(await mailbox(runtime.buyers[1], p.id, 'INVITATION')).toHaveLength(1);
    expect((await mailbox(runtime.buyers[1], p.id))[0].readAt).toBe(
      readResponses[0].message.readAt,
    );
    const inspection = await mailbox(runtime.admin, p.id, 'INVITATION');
    expect(inspection).toHaveLength(1);
    expect(inspection[0].readAt).toBeNull();
    await runtime.admin.post('/mailbox/' + message.id + '/read');
    expect((await mailbox(runtime.buyers[1], p.id))[0].readAt).toBe(
      readResponses[0].message.readAt,
    );
    await runtime.buyers[1].post('/invitations/' + message.invitation!.id + '/respond', {
      status: 'ACCEPTED',
    });
    expect((await mailbox(runtime.buyers[1], p.id))[0].invitation?.status).toBe('ACCEPTED');
    expect((await detail(runtime.buyers[1], p.id)).commitments).toHaveLength(0);
    await runtime.buyers[1].error('POST', '/procurements/' + p.id + '/publish', {}, 403);
  });

  it('delivers offer and TEST payment messages to the correct audiences without replay duplicates', async () => {
    const p = await procurement(runtime.buyers[0]);
    await runtime.buyers[0].post('/procurements/' + p.id + '/publish');
    await runtime.buyers[0].post('/procurements/' + p.id + '/invitations', {
      organizationIds: [runtime.buyers[1].organization.id, runtime.supplier.organization.id],
    });
    const offerInput = {
      organizationId: runtime.supplier.organization.id,
      basePriceCents: 100_000,
      depositCents: 10_003,
      terms: 'Postkasti hanke tingimused.',
      validUntil: future(172_800_000),
      tiers: [{ minParticipants: 2, priceCents: 90_000 }],
    };
    const { offer } = await runtime.supplier.post<{ offer: Offer }>(
      '/procurements/' + p.id + '/offers',
      offerInput,
    );
    expect(await mailbox(runtime.buyers[0], p.id, 'OFFER_SUBMITTED')).toHaveLength(1);
    expect(await mailbox(runtime.buyers[1], p.id, 'OFFER_SUBMITTED')).toHaveLength(0);
    await runtime.buyers[0].post('/procurements/' + p.id + '/select-offer', { offerId: offer.id });
    await runtime.buyers[0].post('/procurements/' + p.id + '/select-offer', { offerId: offer.id });
    expect(await mailbox(runtime.supplier, p.id, 'OFFER_SELECTED')).toHaveLength(1);
    expect(await mailbox(runtime.buyers[1], p.id, 'OFFER_SELECTED')).toHaveLength(1);

    const first = await commit(runtime.buyers[0], p.id);
    const failedEvent = unique('mailbox-failed');
    await runtime.buyers[0].post('/test-payments/' + first.id, {
      outcome: 'failed',
      eventId: failedEvent,
    });
    await runtime.buyers[0].post('/test-payments/' + first.id, {
      outcome: 'failed',
      eventId: failedEvent,
    });
    const failed = await mailbox(runtime.buyers[0], p.id, 'TEST_PAYMENT_FAILED');
    expect(failed).toHaveLength(1);
    expect(failed[0].audience).toBe('REPRESENTATIVES');
    expect(failed[0].subject + ' ' + failed[0].body).toMatch(/TEST/);
    const capturedEvent = unique('mailbox-captured');
    await capture(runtime.buyers[0], first.id, capturedEvent);
    await capture(runtime.buyers[0], first.id, capturedEvent);
    await capture(runtime.buyers[0], first.id, unique('mailbox-capture-replay'));
    const captured = await mailbox(runtime.buyers[0], p.id, 'TEST_PAYMENT_CAPTURED');
    expect(captured).toHaveLength(1);
    expect(captured[0].audience).toBe('REPRESENTATIVES');
    expect(captured[0].subject + ' ' + captured[0].body).toMatch(/TEST/);
    expect(await mailbox(runtime.buyers[1], p.id, 'TEST_PAYMENT_CAPTURED')).toHaveLength(0);

    const viewer = new Client(runtime.baseUrl);
    await viewer.post('/register', {
      name: 'Finantsteadete vaatleja',
      email: unique('payment-viewer') + '@test.local',
      password: registrationPassword,
    });
    const requested = await viewer.post<{ membership: Membership }>(
      '/organizations/' + runtime.buyers[0].organization.id + '/membership',
      { role: 'viewer' },
    );
    await runtime.admin.post('/admin/memberships/' + requested.membership.id, {
      status: 'approved',
    });
    expect(await mailbox(viewer, p.id, 'OFFER_SUBMITTED')).toHaveLength(1);
    expect((await mailbox(viewer, p.id)).every((message) => message.audience === 'MEMBERS')).toBe(
      true,
    );
    await viewer.error('POST', '/mailbox/' + captured[0].id + '/read', {}, 404);
    const second = await commit(runtime.buyers[1], p.id);
    await capture(runtime.buyers[1], second.id);
    await capture(runtime.buyers[1], second.id);
    for (const client of [runtime.buyers[0], runtime.buyers[1], runtime.supplier]) {
      expect(await mailbox(client, p.id, 'SUCCESS_REACHED')).toHaveLength(1);
    }
    expect(await mailbox(viewer, p.id, 'SUCCESS_REACHED')).toHaveLength(1);
    expect(await mailbox(runtime.buyers[2], p.id)).toHaveLength(0);
  });

  it('keeps more than 200 historical letters readable with an exact unread count', async () => {
    const owner = runtime.buyers[1];
    const p = await procurement(owner);
    await owner.post('/procurements/' + p.id + '/publish');
    const eventPrefix = unique('mailbox-history');
    const history = await runtime.pool.query<{ id: string; event_key: string }>(
      `INSERT INTO mailbox_messages(organization_id,organization_name,procurement_id,procurement_title,kind,audience,subject,body,event_key,created_at)
       SELECT $1::uuid,$2,$3::uuid,$4,'OFFER_SUBMITTED','MEMBERS',
        'Varasem pakkumise teavitus ' || n::text,
        'Teenusepakkuja uuendas selle hanke pakkumist.',
        $5 || ':' || n::text,clock_timestamp()-(206-n)*INTERVAL '1 second'
       FROM generate_series(1,205) AS entries(n)
       RETURNING id,event_key`,
      [owner.organization.id, owner.organization.name, p.id, p.title, eventPrefix],
    );
    const oldestId = history.rows.find((row) => row.event_key === eventPrefix + ':1')!.id;
    const before = await owner.get<MailboxResponse>('/mailbox');
    const visibleHistory = before.messages.filter((message) => message.procurementId === p.id);
    expect(visibleHistory).toHaveLength(205);
    expect(visibleHistory.at(-1)?.id).toBe(oldestId);
    expect(visibleHistory.every((message) => message.readAt === null)).toBe(true);
    expect(before.unreadCount).toBe(before.messages.filter((message) => !message.readAt).length);
    expect(await mailbox(runtime.buyers[0], p.id)).toHaveLength(0);
    await runtime.buyers[0].error('POST', '/mailbox/' + oldestId + '/read', {}, 404);
    const read = await owner.post<{ message: MailboxResponse['messages'][number] }>(
      '/mailbox/' + oldestId + '/read',
    );
    expect(read.message.readAt).not.toBeNull();
    const after = await owner.get<MailboxResponse>('/mailbox');
    expect(after.messages.filter((message) => message.procurementId === p.id)).toHaveLength(205);
    expect(after.unreadCount).toBe(before.unreadCount - 1);
    expect(after.messages.find((message) => message.id === oldestId)?.readAt).toBe(
      read.message.readAt,
    );
  });
});

describe('transactional commitments and test payments', () => {
  it('prevents duplicate organization acceptances under concurrency', async () => {
    const { procurement: p } = await selectedProcurement(runtime);
    const body = {
      organizationId: runtime.buyers[0].organization.id,
      authorityConfirmed: true,
      scopeConfirmed: true,
    };
    const results = await Promise.all([
      runtime.buyers[0].request('POST', '/procurements/' + p.id + '/commitments', body),
      runtime.buyers[0].request('POST', '/procurements/' + p.id + '/commitments', body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await detail(runtime.buyers[0], p.id)).commitments).toHaveLength(1);
  });

  it('latches success once for parallel threshold captures and ignores repeated/new-event transaction replays', async () => {
    const { procurement: p } = await selectedProcurement(runtime);
    const accepted = await Promise.all(
      runtime.buyers.slice(0, 2).map((client) => commit(client, p.id)),
    );
    await Promise.all(
      accepted.map((c, i) => capture(runtime.buyers[i], c.id, 'threshold-' + c.id)),
    );
    const after = await detail(runtime.buyers[0], p.id);
    expect(after.procurement.status).toBe('SUCCEEDED');
    expect(after.procurement.activeCount).toBe(2);
    expect(after.procurement.bestPriceCents).toBe(90_000);
    const succeededAt = after.procurement.succeededAt;
    await expect(
      runtime.pool.query('UPDATE procurements SET succeeded_at=NULL WHERE id=$1', [p.id]),
    ).rejects.toThrow('Success history is immutable');
    await expect(
      runtime.pool.query('UPDATE procurements SET best_price_cents=$2 WHERE id=$1', [
        p.id,
        100_000,
      ]),
    ).rejects.toThrow('Achieved price cannot increase');
    await expect(
      runtime.pool.query('UPDATE procurements SET best_price_cents=NULL WHERE id=$1', [p.id]),
    ).rejects.toThrow('Achieved price cannot increase');
    await expect(
      runtime.pool.query('DELETE FROM payment_events WHERE event_id=$1', [
        'threshold-' + accepted[0].id,
      ]),
    ).rejects.toThrow('Append-only');
    const successes = await runtime.pool.query<{ count: number }>(
      'SELECT COUNT(*)::integer AS count FROM audit WHERE procurement_id=$1 AND action=$2',
      [p.id, 'SUCCESS_REACHED'],
    );
    expect(successes.rows[0].count).toBe(1);
    await capture(runtime.buyers[0], accepted[0].id, 'threshold-' + accepted[0].id);
    await capture(runtime.buyers[0], accepted[0].id, unique('same-transaction-new-event'));
    await runtime.buyers[1].error(
      'POST',
      '/test-payments/' + accepted[1].id,
      { outcome: 'captured', eventId: 'threshold-' + accepted[0].id },
      409,
    );
    await runtime.buyers[0].error(
      'POST',
      '/test-payments/' + accepted[0].id,
      { outcome: 'failed', eventId: 'threshold-' + accepted[0].id },
      409,
    );
    expect((await detail(runtime.buyers[0], p.id)).procurement.succeededAt).toBe(succeededAt);
    expect((await ledger(p.id)).DEPOSIT).toEqual({ count: 2, total: 20_006 });
    await runtime.buyers[1].error(
      'POST',
      '/test-payments/' + accepted[0].id,
      { outcome: 'captured', eventId: unique('unauthorized') },
      403,
    );
  });

  it('retries failed captures and refunds captures arriving after withdrawal without participation', async () => {
    const { procurement: p } = await selectedProcurement(runtime);
    const first = await commit(runtime.buyers[0], p.id);
    const failed = await runtime.buyers[0].post<{ isTest: boolean }>('/test-payments/' + first.id, {
      outcome: 'failed',
      eventId: unique('failed'),
    });
    expect(failed.isTest).toBe(true);
    expect((await detail(runtime.buyers[0], p.id)).procurement.activeCount).toBe(0);
    expect((await ledger(p.id)).DEPOSIT).toBeUndefined();
    expect((await capture(runtime.buyers[0], first.id)).isTest).toBe(true);
    await runtime.buyers[0].post('/commitments/' + first.id + '/withdraw');
    expect((await ledger(p.id)).REFUND.total).toBe(10_003);
    const second = await commit(runtime.buyers[1], p.id);
    await runtime.buyers[1].post('/commitments/' + second.id + '/withdraw');
    await capture(runtime.buyers[1], second.id);
    await capture(runtime.buyers[1], second.id);
    const after = await detail(runtime.buyers[0], p.id);
    expect(after.procurement.activeCount).toBe(0);
    expect(after.procurement.succeededAt).toBeNull();
    expect((await ledger(p.id)).DEPOSIT).toEqual({ count: 2, total: 20_006 });
    expect((await ledger(p.id)).REFUND).toEqual({ count: 2, total: 20_006 });
  });

  it('keeps the best achieved tier after post-success withdrawals and later joining', async () => {
    const { procurement: p } = await selectedProcurement(runtime);
    const accepted = await Promise.all(
      runtime.buyers.slice(0, 3).map((client) => commit(client, p.id)),
    );
    for (const [index, c] of accepted.entries()) await capture(runtime.buyers[index], c.id);
    const succeededAt = (await detail(runtime.buyers[0], p.id)).procurement.succeededAt;
    await runtime.buyers[2].post('/commitments/' + accepted[2].id + '/withdraw');
    const after = await detail(runtime.buyers[0], p.id);
    expect(after.procurement.bestPriceCents).toBe(70_000);
    expect(after.procurement.activeCount).toBe(2);
    expect(after.procurement.succeededAt).toBe(succeededAt);
    expect((await ledger(p.id)).REFUND).toBeUndefined();
    const later = await commit(runtime.buyers[3], p.id);
    await capture(runtime.buyers[3], later.id);
    expect((await detail(runtime.buyers[0], p.id)).procurement.bestPriceCents).toBe(70_000);
  });

  it('serializes withdrawal racing threshold success consistently', async () => {
    const { procurement: p } = await selectedProcurement(runtime);
    const first = await commit(runtime.buyers[0], p.id);
    const second = await commit(runtime.buyers[1], p.id);
    await capture(runtime.buyers[0], first.id);
    await Promise.all([
      runtime.buyers[0].post('/commitments/' + first.id + '/withdraw'),
      capture(runtime.buyers[1], second.id),
    ]);
    const after = await detail(runtime.buyers[0], p.id);
    expect(after.procurement.activeCount).toBe(1);
    const entries = await ledger(p.id);
    if (after.procurement.succeededAt) {
      expect(after.procurement.status).toBe('SUCCEEDED');
      expect(entries.REFUND).toBeUndefined();
    } else {
      expect(after.procurement.status).toBe('OPEN');
      expect(entries.REFUND).toEqual({ count: 1, total: 10_003 });
    }
    expect(after.commitments.find((c) => c.id === first.id)?.status).toBe('WITHDRAWN');
  });
});

describe('deadline processing, historical records and administration', () => {
  it('recovers due finalization after a worker restart, creates buyer contracts, rounds fees and reverses cancellation payouts', async () => {
    const deadline = future(5_000);
    const { procurement: p } = await selectedProcurement(runtime, { deadline });
    const accepted = await Promise.all(
      runtime.buyers.slice(0, 4).map((client) => commit(client, p.id)),
    );
    for (const [index, c] of accepted.entries()) await capture(runtime.buyers[index], c.id);
    await runtime.buyers[3].post('/commitments/' + accepted[3].id + '/withdraw');
    const acceptance = accepted[0].acceptanceSnapshot;
    const originalWorker = await startWorker(runtime);
    try {
      expect((await detail(runtime.admin, p.id)).procurement.status).toBe('SUCCEEDED');
    } finally {
      await originalWorker.stop();
    }
    await waitUntil(deadline);
    const restartedWorker = await startWorker(runtime);
    try {
      await waitForFinalization(runtime, p.id);
    } finally {
      await restartedWorker.stop();
    }
    await finalize();
    await finalize();
    const after = await detail(runtime.admin, p.id);
    expect(after.procurement.status).toBe('FINALIZED');
    expect(after.contracts).toHaveLength(3);
    for (const client of [...runtime.buyers.slice(0, 3), runtime.supplier]) {
      const messages = await mailbox(client, p.id, 'PROCUREMENT_FINALIZED');
      expect(messages).toHaveLength(1);
      expect(messages[0].subject + ' ' + messages[0].body).toMatch(/TEST/);
    }
    const buyerDetail = await detail(runtime.buyers[0], p.id);
    expect(buyerDetail.contracts).toHaveLength(1);
    expect(buyerDetail.commitments).toHaveLength(1);
    expect(buyerDetail.contracts[0].organizationId).toBe(runtime.buyers[0].organization.id);
    for (const contract of after.contracts) {
      expect(contract.priceCents).toBe(70_000);
      expect(contract.depositCreditCents).toBe(10_003);
      expect(contract.balanceCents).toBe(59_997);
      expect(contract.finalSnapshot).not.toEqual(acceptance);
    }
    const financial = await ledger(p.id);
    expect(financial.DEPOSIT).toEqual({ count: 4, total: 40_012 });
    expect(financial.PLATFORM_FEE).toEqual({ count: 4, total: 1_600 });
    expect(financial.SUPPLIER_PAYOUT).toEqual({ count: 4, total: 38_412 });
    const contracts = await runtime.buyers[0].get<{ contracts: Contract[] }>('/contracts');
    expect(contracts.contracts.some((c) => c.procurementId === p.id)).toBe(true);
    const ownContract = after.contracts.find(
      (c) => c.organizationId === runtime.buyers[0].organization.id,
    )!;
    await runtime.buyers[1].error(
      'POST',
      '/contracts/' + ownContract.id + '/complete',
      { rating: 5, comment: 'Unauthorized' },
      403,
    );
    const complete = await runtime.buyers[0].post<{ contract: Contract }>(
      '/contracts/' + ownContract.id + '/complete',
      { rating: 5, comment: 'Õigeaegne hooldus.' },
    );
    expect(complete.contract.completedAt).not.toBeNull();
    expect(complete.contract.rating).toBe(5);
    await runtime.buyers[0].error('POST', '/commitments/' + accepted[0].id + '/withdraw', {}, 409);
    await runtime.buyers[1].post('/commitments/' + accepted[1].id + '/withdraw');
    const withdrewAfterFinalization = await detail(runtime.admin, p.id);
    expect(
      withdrewAfterFinalization.contracts.find((c) => c.commitmentId === accepted[1].id)?.status,
    ).toBe('CANCELLED');
    expect(withdrewAfterFinalization.commitments.find((c) => c.id === accepted[1].id)?.status).toBe(
      'WITHDRAWN',
    );
    expect(withdrewAfterFinalization.procurement.bestPriceCents).toBe(70_000);
    expect((await ledger(p.id)).REFUND).toBeUndefined();
    await expect(
      runtime.pool.query('UPDATE contracts SET final_snapshot=$1 WHERE id=$2', [
        { tampered: true },
        ownContract.id,
      ]),
    ).rejects.toThrow('immutable');
    const auditRow = await runtime.pool.query<{ id: string }>(
      'SELECT id FROM audit WHERE procurement_id=$1 LIMIT 1',
      [p.id],
    );
    await expect(
      runtime.pool.query('DELETE FROM audit WHERE id=$1', [auditRow.rows[0].id]),
    ).rejects.toThrow('Append-only');
    await expect(
      runtime.pool.query('UPDATE ledger SET amount_cents=$1 WHERE procurement_id=$2', [0, p.id]),
    ).rejects.toThrow('Append-only');
    await runtime.supplier.error(
      'POST',
      '/admin/procurements/' + p.id + '/cancel',
      { reason: 'Supplier cancellation' },
      403,
    );
    await runtime.admin.post('/admin/procurements/' + p.id + '/cancel', {
      reason: 'Pakkuja ei saa lepingut täita.',
    });
    await runtime.admin.post('/admin/procurements/' + p.id + '/cancel', {
      reason: 'Repeated cancellation',
    });
    const cancelled = await detail(runtime.admin, p.id);
    expect(cancelled.procurement.status).toBe('CANCELLED');
    expect(cancelled.procurement.succeededAt).toBe(after.procurement.succeededAt);
    const reversed = await ledger(p.id);
    expect(reversed.REFUND).toEqual({ count: 4, total: 40_012 });
    expect(reversed.SUPPLIER_REVERSAL).toEqual(financial.SUPPLIER_PAYOUT);
    expect(reversed.FEE_REVERSAL).toEqual(financial.PLATFORM_FEE);
    expect(cancelled.contracts).toHaveLength(3);
    expect(cancelled.commitments.find((c) => c.id === accepted[0].id)?.acceptanceSnapshot).toEqual(
      acceptance,
    );
    for (const client of [...runtime.buyers.slice(0, 4), runtime.supplier]) {
      const messages = await mailbox(client, p.id, 'SUPPLIER_CANCELLATION');
      expect(messages).toHaveLength(1);
      expect(messages[0].subject + ' ' + messages[0].body).toMatch(/TEST/);
    }
  });

  it('fails below-threshold groups and refunds late captures without duplicates', async () => {
    const deadline = future(2_000);
    const { procurement: p } = await selectedProcurement(runtime, { deadline });
    const first = await commit(runtime.buyers[0], p.id);
    const late = await commit(runtime.buyers[1], p.id);
    await capture(runtime.buyers[0], first.id);
    await waitUntil(deadline);
    await capture(runtime.buyers[1], late.id);
    await capture(runtime.buyers[1], late.id);
    await finalize();
    await finalize();
    const after = await detail(runtime.buyers[0], p.id);
    expect(after.procurement.status).toBe('FAILED');
    expect(after.procurement.succeededAt).toBeNull();
    expect(after.contracts).toHaveLength(0);
    expect((await ledger(p.id)).DEPOSIT).toEqual({ count: 2, total: 20_006 });
    expect((await ledger(p.id)).REFUND).toEqual({ count: 2, total: 20_006 });
    expect((await ledger(p.id)).SUPPLIER_PAYOUT).toBeUndefined();
    expect(await mailbox(runtime.buyers[0], p.id, 'PROCUREMENT_FAILED')).toHaveLength(1);
    expect(await mailbox(runtime.buyers[1], p.id, 'PROCUREMENT_FAILED')).toHaveLength(1);
    const lateMessages = await mailbox(runtime.buyers[1], p.id, 'LATE_PAYMENT_REFUNDED');
    expect(lateMessages).toHaveLength(1);
    expect(lateMessages[0].subject + ' ' + lateMessages[0].body).toMatch(/TEST/);
    await runtime.buyers[2].error(
      'POST',
      '/procurements/' + p.id + '/commitments',
      {
        organizationId: runtime.buyers[2].organization.id,
        authorityConfirmed: true,
        scopeConfirmed: true,
      },
      409,
    );
  });

  it('retries failed durable jobs and keeps completion idempotent', async () => {
    const deadline = future(1_500);
    const { procurement: p } = await selectedProcurement(runtime, {
      deadline,
      tiers: [{ minParticipants: 1, priceCents: 90_000 }],
      deposit: 13,
    });
    const accepted = await commit(runtime.buyers[0], p.id);
    await capture(runtime.buyers[0], accepted.id);
    await runtime.pool.query('CREATE TABLE test_worker_failures (id uuid PRIMARY KEY)');
    await runtime.pool.query('INSERT INTO test_worker_failures(id) VALUES($1)', [p.id]);
    await runtime.pool.query(
      `CREATE FUNCTION test_fail_contract() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM test_worker_failures WHERE id=NEW.procurement_id) THEN RAISE EXCEPTION 'Injected contract storage failure'; END IF; RETURN NEW; END $$`,
    );
    await runtime.pool.query(
      'CREATE TRIGGER test_contract_storage_failure BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION test_fail_contract()',
    );
    await waitUntil(deadline);
    try {
      await finalize();
      const failed = await runtime.pool.query<{ status: string; last_error: string }>(
        'SELECT status,last_error FROM jobs WHERE procurement_id=$1',
        [p.id],
      );
      expect(failed.rows[0].status).toBe('FAILED');
      expect(failed.rows[0].last_error).toContain('Injected contract storage failure');
      expect((await detail(runtime.admin, p.id)).contracts).toHaveLength(0);
      expect((await ledger(p.id)).SUPPLIER_PAYOUT).toBeUndefined();
      expect(await mailbox(runtime.buyers[0], p.id, 'PROCUREMENT_FINALIZED')).toHaveLength(0);
    } finally {
      await runtime.pool.query('DROP TRIGGER test_contract_storage_failure ON contracts');
      await runtime.pool.query('DROP FUNCTION test_fail_contract()');
      await runtime.pool.query('DROP TABLE test_worker_failures');
    }
    const jobResult = await runtime.pool.query<{ id: string }>(
      'SELECT id FROM jobs WHERE procurement_id=$1',
      [p.id],
    );
    await runtime.admin.post('/admin/jobs/' + jobResult.rows[0].id + '/retry');
    await waitUntil(deadline);
    await finalize();
    await finalize();
    expect((await detail(runtime.buyers[0], p.id)).procurement.status).toBe('FINALIZED');
    expect((await ledger(p.id)).PLATFORM_FEE.total).toBe(1);
    expect((await ledger(p.id)).SUPPLIER_PAYOUT.total).toBe(12);
    expect(await mailbox(runtime.buyers[0], p.id, 'PROCUREMENT_FINALIZED')).toHaveLength(1);
    const done = await runtime.pool.query<{ status: string; attempts: number }>(
      'SELECT status,attempts FROM jobs WHERE procurement_id=$1',
      [p.id],
    );
    expect(done.rows[0].status).toBe('DONE');
    expect(done.rows[0].attempts).toBeGreaterThanOrEqual(2);
    const admin = await runtime.admin.get<AdminResponse>('/admin');
    expect(admin.ledger.some((row) => row.procurementId === p.id && row.isTest)).toBe(true);
    expect(admin.audit.some((row) => row.procurementId === p.id)).toBe(true);
    expect(admin.jobs.some((row) => row.id === jobResult.rows[0].id && row.status === 'DONE')).toBe(
      true,
    );
  });

  it('previews CSV, validates all rows before an atomic import, and restricts contacts', async () => {
    const code = 'CSV-' + unique('').slice(0, 20);
    const header = 'registryCode,name,orgType,address,latitude,longitude,email';
    const csv =
      header +
      '\n' +
      code +
      ',Test imporditud KÜ,BUYER,Mustamäe 1,59.403,24.675,private@import.test';
    const preview = await runtime.admin.post<ImportPreview>('/admin/import/preview', { csv });
    expect(preview.errors).toHaveLength(0);
    expect(preview.rows).toHaveLength(1);
    expect(
      (await runtime.pool.query('SELECT id FROM organizations WHERE registry_code=$1', [code]))
        .rowCount,
    ).toBe(0);
    const invalid = [
      csv,
      'INVALID-' + Date.now() + ',Bad coordinates,BUYER,Mustamäe 2,999,24.675,test@import.test',
      'BAD!,,OTHER,,,not-a-number,invalid-email',
      'LONGITUDE-' + Date.now() + ',Bad longitude,BUYER,Mustamäe 3,59.403,-181,',
      csv.split('\n')[1],
    ].join('\n');
    const invalidPreview = await runtime.admin.post<ImportPreview>('/admin/import/preview', {
      csv: invalid,
    });
    expect(invalidPreview.errors).toEqual([
      {
        row: 3,
        message: 'Laiuskraad: sisesta arv vahemikus −90 kuni 90; kümnendkohad eralda punktiga.',
      },
      {
        row: 4,
        message: [
          'Registrikood: kasuta 4–30 ladina tähte, numbrit või sidekriipsu.',
          'Nimi: sisesta organisatsiooni nimi (1–500 tähemärki).',
          'Organisatsiooni tüüp: kasuta BUYER (korteriühistu) või SUPPLIER (pakkuja).',
          'Aadress: sisesta organisatsiooni aadress (1–500 tähemärki).',
          'Laiuskraad: sisesta arv vahemikus −90 kuni 90; kümnendkohad eralda punktiga.',
          'Pikkuskraad: sisesta arv vahemikus −180 kuni 180; kümnendkohad eralda punktiga.',
          'E-post: sisesta kehtiv e-posti aadress (kuni 254 tähemärki) või jäta väli tühjaks.',
        ].join(' '),
      },
      {
        row: 5,
        message: 'Pikkuskraad: sisesta arv vahemikus −180 kuni 180; kümnendkohad eralda punktiga.',
      },
      {
        row: 6,
        message:
          'Registrikood: sama kood esineb failis korduvalt; jäta iga organisatsiooni kohta üks rida.',
      },
    ]);
    await runtime.admin.error('POST', '/admin/import', { csv: invalid }, 400);
    expect(
      (await runtime.pool.query('SELECT id FROM organizations WHERE registry_code=$1', [code]))
        .rowCount,
    ).toBe(0);
    await runtime.admin.post('/admin/import', { csv });
    await runtime.admin.post('/admin/import', { csv });
    const stored = await runtime.pool.query<{ email: string }>(
      'SELECT email FROM organizations WHERE registry_code=$1',
      [code],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].email).toBe('private@import.test');
    const rollbackCode = 'ROLLBACK-' + Date.now();
    const conflicting =
      header +
      '\n' +
      rollbackCode +
      ',Atomic new row,BUYER,Mustamäe 3,59.403,24.675,' +
      '\n' +
      code +
      ',Type conflict,SUPPLIER,Mustamäe 4,59.403,24.675,';
    expect(
      (await runtime.admin.post<ImportPreview>('/admin/import/preview', { csv: conflicting }))
        .errors,
    ).toHaveLength(0);
    await runtime.admin.error('POST', '/admin/import', { csv: conflicting }, 409);
    expect(
      (
        await runtime.pool.query('SELECT id FROM organizations WHERE registry_code=$1', [
          rollbackCode,
        ])
      ).rowCount,
    ).toBe(0);
    const publicList = await runtime.buyers[0].get<{ organizations: Organization[] }>(
      '/organizations',
    );
    expect(publicList.organizations.find((o) => o.registryCode === code)?.email).toBeUndefined();
    const privateList = await runtime.admin.get<AdminResponse>('/admin');
    expect(privateList.organizations.find((o) => o.registryCode === code)?.email).toBe(
      'private@import.test',
    );
    await runtime.buyers[0].error('POST', '/admin/import', { csv }, 403);
  });
});
