import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { AuthRequest } from './auth.js';
import {
  createSession,
  hashPassword,
  loadSession,
  removeSession,
  requireAdmin,
  requireUser,
  safeUser,
  verifyPassword,
} from './auth.js';
import { pool, transaction } from './db.js';
import { assert, DomainError } from './errors.js';
import {
  audit,
  authority,
  cancelProcurement,
  captureTestPayment,
  createCommitment,
  databaseNow,
  ensureJoining,
  lockProcurement,
  retryJob,
  withdrawCommitment,
} from './domain.js';
import {
  commitmentById,
  commitmentView,
  CONTRACT_SELECT,
  contractView,
  INVITATION_SELECT,
  invitationView,
  isoDate,
  membershipsFor,
  nearbyOrganizations,
  offerView,
  organizationView,
  PROCUREMENT_SELECT,
  procurementById,
  procurementView,
} from './views.js';
import {
  approvalSchema,
  cancellationSchema,
  commitmentSchema,
  completionSchema,
  importSchema,
  invitationResponseSchema,
  invitationSchema,
  loginSchema,
  membershipSchema,
  offerSchema,
  organizationSchema,
  organizationUpdateSchema,
  paymentSchema,
  previewImport,
  procurementSchema,
  registerSchema,
  selectOfferSchema,
  uuidSchema,
} from './validation.js';

const param = (req: Request, key = 'id'): string => uuidSchema.parse(req.params[key]);

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/v1', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.get('/api/v1/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ready', paymentMode: 'TEST' });
  });
  app.use('/api/v1', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site')
        return next(
          new DomainError(403, 'CROSS_ORIGIN', 'Päring peab pärinema samast portaalist.'),
        );
      if (origin) {
        try {
          if (new URL(origin).origin !== `${req.protocol}://${req.get('host')}`)
            return next(
              new DomainError(403, 'CROSS_ORIGIN', 'Päring peab pärinema samast portaalist.'),
            );
        } catch {
          return next(new DomainError(403, 'CROSS_ORIGIN', 'Päringu päritolu ei ole kehtiv.'));
        }
      }
      if (req.get('content-type') && !req.is('application/json'))
        return next(new DomainError(415, 'JSON_REQUIRED', 'Päring peab kasutama JSON vormingut.'));
    }
    next();
  });
  app.use('/api/v1', loadSession);
  app.get('/api/v1/session', async (req: AuthRequest, res) => {
    res.json({
      user: req.user ?? null,
      memberships: req.user ? await membershipsFor(req.user) : [],
    });
  });
  app.post('/api/v1/register', async (req: AuthRequest, res) => {
    const data = registerSchema.parse(req.body);
    const user = await transaction(async (client) => {
      const result = await client.query(
        'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING *',
        [data.email, data.name, await hashPassword(data.password)],
      );
      await audit(client, result.rows[0].id, null, 'USER_REGISTERED');
      return safeUser(result.rows[0]);
    });
    await removeSession(req, res);
    await createSession(user.id, res);
    res.status(201).json({ user, memberships: [] });
  });
  app.post('/api/v1/login', async (req: AuthRequest, res) => {
    const data = loginSchema.parse(req.body);
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [data.email]);
    const stored = result.rows[0]?.password_hash as string | undefined;
    // Perform scrypt even for unknown accounts to avoid exposing account existence through timing.
    const valid = await verifyPassword(
      data.password,
      stored ?? '00000000000000000000000000000000:' + '0'.repeat(128),
    );
    assert(result.rowCount && valid, 401, 'INVALID_CREDENTIALS', 'E-post või parool ei ole õige.');
    const user = safeUser(result.rows[0]);
    await removeSession(req, res);
    await createSession(user.id, res);
    res.json({ user, memberships: await membershipsFor(user) });
  });
  app.post('/api/v1/logout', async (req, res) => {
    await removeSession(req, res);
    res.json({ ok: true });
  });
  app.get('/api/v1/organizations', async (req: AuthRequest, res) => {
    const user = requireUser(req);
    const result = await pool.query('SELECT * FROM organizations ORDER BY name');
    res.json({ organizations: result.rows.map((row) => organizationView(row, user.isAdmin)) });
  });
  app.post('/api/v1/organizations', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      data = organizationSchema.parse(req.body);
    const organization = await transaction(async (client) => {
      const result = await client.query(
        'INSERT INTO organizations(registry_code,name,org_type,address,latitude,longitude,email) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          data.registryCode,
          data.name,
          data.orgType,
          data.address,
          data.latitude,
          data.longitude,
          data.email || null,
        ],
      );
      await client.query('INSERT INTO memberships(user_id,organization_id) VALUES($1,$2)', [
        user.id,
        result.rows[0].id,
      ]);
      await audit(client, user.id, null, 'ORGANIZATION_CREATED', {
        organizationId: result.rows[0].id,
      });
      return organizationView(result.rows[0], true);
    });
    const memberships = await membershipsFor(user);
    res.status(201).json({
      organization,
      memberships,
      membership: memberships.find((item) => item.organizationId === organization.id),
    });
  });
  app.put('/api/v1/organizations/:id', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = organizationUpdateSchema.parse(req.body);
    const organization = await transaction(async (client) => {
      await authority(client, user, id);
      const result = await client.query(
        'UPDATE organizations SET name=$2,address=$3,latitude=$4,longitude=$5,email=$6 WHERE id=$1 RETURNING *',
        [id, data.name, data.address, data.latitude, data.longitude, data.email || null],
      );
      await audit(client, user.id, null, 'ORGANIZATION_UPDATED', { organizationId: id });
      return organizationView(result.rows[0], true);
    });
    res.json({ organization });
  });
  app.post('/api/v1/organizations/:id/membership', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = membershipSchema.parse(req.body ?? {});
    await transaction(async (client) => {
      assert(
        (await client.query('SELECT id FROM organizations WHERE id=$1', [id])).rowCount,
        404,
        'NOT_FOUND',
        'Organisatsiooni ei leitud.',
      );
      await client.query(
        "INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,organization_id) DO UPDATE SET status=CASE WHEN memberships.status='rejected' THEN 'pending' ELSE memberships.status END",
        [user.id, id, data.role],
      );
      await audit(client, user.id, null, 'MEMBERSHIP_REQUESTED', { organizationId: id });
    });
    const memberships = await membershipsFor(user);
    res.status(201).json({ membership: memberships.find((item) => item.organizationId === id) });
  });
  app.get('/api/v1/procurements', async (req: AuthRequest, res) => {
    const user = requireUser(req);
    const result = await pool.query(
      `${PROCUREMENT_SELECT} WHERE p.status<>'DRAFT' OR $2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=p.organization_id AND m.user_id=$1 AND m.status='approved') ORDER BY p.created_at DESC`,
      [user.id, user.isAdmin],
    );
    res.json({ procurements: result.rows.map(procurementView) });
  });
  app.post('/api/v1/procurements', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      data = procurementSchema.parse(req.body);
    const id = await transaction(async (client) => {
      await authority(client, user, data.organizationId, 'BUYER');
      assert(
        new Date(data.joinDeadlineAt) > (await databaseNow(client)),
        400,
        'DEADLINE_PAST',
        'Liitumise tähtaeg peab olema tulevikus.',
      );
      const result = await client.query<{ id: string }>(
        'INSERT INTO procurements(organization_id,created_by,title,description,radius_m,join_deadline_at,spec,location_latitude,location_longitude) SELECT id,$2,$3,$4,$5,$6,$7,latitude,longitude FROM organizations WHERE id=$1 RETURNING id',
        [
          data.organizationId,
          user.id,
          data.title,
          data.description,
          data.radiusM,
          data.joinDeadlineAt,
          JSON.stringify(data.spec),
        ],
      );
      await audit(client, user.id, result.rows[0].id, 'PROCUREMENT_CREATED');
      return result.rows[0].id;
    });
    res.status(201).json({ procurement: await procurementById(id) });
  });
  app.post('/api/v1/procurements/:id/publish', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req);
    await transaction(async (client) => {
      const p = await lockProcurement(client, id);
      await authority(client, user, p.organization_id, 'BUYER');
      assert(p.status === 'DRAFT', 409, 'INVALID_STATUS', 'Ühishange on juba avaldatud.');
      assert(
        p.join_deadline_at > (await databaseNow(client)),
        409,
        'DEADLINE_PAST',
        'Liitumise tähtaeg on möödunud.',
      );
      await client.query("UPDATE procurements SET status='OPEN' WHERE id=$1", [id]);
      await client.query(
        'INSERT INTO jobs(procurement_id,due_at) VALUES($1,$2) ON CONFLICT(procurement_id,kind) DO NOTHING',
        [id, p.join_deadline_at],
      );
      await audit(client, user.id, id, 'PROCUREMENT_PUBLISHED');
    });
    res.json({ procurement: await procurementById(id) });
  });
  app.get('/api/v1/procurements/:id', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req);
    const procurement = await procurementById(id);
    assert(procurement, 404, 'NOT_FOUND', 'Ühishanget ei leitud.');
    const memberships = await membershipsFor(user);
    const ownOrganizations = memberships
      .filter((m) => m.status === 'approved')
      .map((m) => m.organizationId);
    assert(
      procurement.status !== 'DRAFT' ||
        user.isAdmin ||
        ownOrganizations.includes(procurement.organizationId),
      403,
      'FORBIDDEN',
      'Ühishange ei ole avalik.',
    );
    const [offers, commitments, contracts, invitations, nearby] = await Promise.all([
      pool.query(
        'SELECT f.*,o.name supplier_name FROM offers f JOIN organizations o ON o.id=f.organization_id WHERE f.procurement_id=$1 ORDER BY f.base_price_cents',
        [id],
      ),
      pool.query(
        'SELECT c.*,o.name organization_name FROM commitments c JOIN organizations o ON o.id=c.organization_id WHERE c.procurement_id=$1 AND ($2 OR c.organization_id=ANY($3::uuid[])) ORDER BY c.created_at',
        [id, user.isAdmin, ownOrganizations],
      ),
      pool.query(
        `${CONTRACT_SELECT} WHERE c.procurement_id=$1 AND ($2 OR c.organization_id=ANY($3::uuid[]) OR c.supplier_organization_id=ANY($3::uuid[])) ORDER BY c.created_at`,
        [id, user.isAdmin, ownOrganizations],
      ),
      pool.query(
        `${INVITATION_SELECT} WHERE i.procurement_id=$1 AND ($2 OR i.organization_id=ANY($3::uuid[]) OR $4=ANY($3::uuid[])) ORDER BY i.created_at`,
        [id, user.isAdmin, ownOrganizations, procurement.organizationId],
      ),
      nearbyOrganizations(id),
    ]);
    res.json({
      procurement,
      offers: offers.rows.map(offerView),
      commitments: commitments.rows.map(commitmentView),
      contracts: contracts.rows.map(contractView),
      invitations: invitations.rows.map(invitationView),
      nearby,
    });
  });
  app.post('/api/v1/procurements/:id/invitations', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = invitationSchema.parse(req.body ?? {});
    await transaction(async (client) => {
      const p = await lockProcurement(client, id);
      await authority(client, user, p.organization_id, 'BUYER');
      await ensureJoining(client, p);
      const eligible = await client.query<{ id: string; org_type: string; distance_m: number }>(
        `SELECT o.id,o.org_type,ST_Distance(o.location,p.location) distance_m FROM organizations o JOIN procurements p ON p.id=$1 WHERE o.id<>p.organization_id AND (o.org_type='SUPPLIER' OR ST_DWithin(o.location,p.location,p.radius_m))`,
        [id],
      );
      const targets = data.organizationIds ?? eligible.rows.map((row) => row.id);
      for (const target of new Set(targets)) {
        const organization = eligible.rows.find((row) => row.id === target);
        assert(
          organization,
          400,
          'INELIGIBLE_INVITATION',
          'Valitud organisatsioon jääb hanke piirkonnast välja.',
        );
        await client.query(
          'INSERT INTO invitations(procurement_id,organization_id,distance_m,source) VALUES($1,$2,$3,$4) ON CONFLICT(procurement_id,organization_id) DO NOTHING',
          [
            id,
            target,
            organization.distance_m,
            organization.org_type === 'SUPPLIER' ? 'SUPPLIER' : 'RADIUS',
          ],
        );
      }
      await audit(client, user.id, id, 'INVITATIONS_CREATED', { organizationIds: targets });
    });
    res.status(201).json({
      invitations: (
        await pool.query(`${INVITATION_SELECT} WHERE i.procurement_id=$1 ORDER BY i.created_at`, [
          id,
        ])
      ).rows.map(invitationView),
    });
  });
  app.get('/api/v1/invitations', async (req: AuthRequest, res) => {
    const user = requireUser(req);
    const result = await pool.query(
      `${INVITATION_SELECT} WHERE $2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=i.organization_id AND m.user_id=$1 AND m.status='approved') ORDER BY i.created_at DESC`,
      [user.id, user.isAdmin],
    );
    res.json({ invitations: result.rows.map(invitationView) });
  });
  app.post('/api/v1/invitations/:id/respond', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = invitationResponseSchema.parse(req.body);
    await transaction(async (client) => {
      const result = await client.query('SELECT * FROM invitations WHERE id=$1', [id]);
      assert(result.rowCount, 404, 'NOT_FOUND', 'Kutset ei leitud.');
      await authority(client, user, result.rows[0].organization_id);
      await client.query('UPDATE invitations SET status=$2 WHERE id=$1', [id, data.status]);
      await audit(client, user.id, result.rows[0].procurement_id, 'INVITATION_RESPONDED', {
        invitationId: id,
        status: data.status,
      });
    });
    res.json({
      invitation: invitationView(
        (await pool.query(`${INVITATION_SELECT} WHERE i.id=$1`, [id])).rows[0],
      ),
    });
  });
  app.post('/api/v1/procurements/:id/offers', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = offerSchema.parse(req.body);
    const offerId = await transaction(async (client) => {
      const p = await lockProcurement(client, id);
      await authority(client, user, data.organizationId, 'SUPPLIER');
      const now = await ensureJoining(client, p);
      assert(!p.frozen_at, 409, 'OFFER_FROZEN', 'Pakkumised on liitumiste tõttu lukustatud.');
      assert(
        new Date(data.validUntil) > now,
        400,
        'OFFER_EXPIRED',
        'Pakkumise kehtivus peab olema tulevikus.',
      );
      assert(
        new Date(data.validUntil) >= p.join_deadline_at,
        400,
        'OFFER_VALIDITY_TOO_SHORT',
        'Pakkumine peab kehtima vähemalt liitumise tähtajani.',
      );
      const result = await client.query<{ id: string }>(
        'INSERT INTO offers(procurement_id,organization_id,base_price_cents,deposit_cents,terms,valid_until,tiers) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(procurement_id,organization_id) DO UPDATE SET base_price_cents=EXCLUDED.base_price_cents,deposit_cents=EXCLUDED.deposit_cents,terms=EXCLUDED.terms,valid_until=EXCLUDED.valid_until,tiers=EXCLUDED.tiers RETURNING id',
        [
          id,
          data.organizationId,
          data.basePriceCents,
          data.depositCents,
          data.terms,
          data.validUntil,
          JSON.stringify(data.tiers),
        ],
      );
      await audit(client, user.id, id, 'OFFER_SUBMITTED', { offerId: result.rows[0].id });
      return result.rows[0].id;
    });
    res.status(201).json({
      offer: offerView(
        (
          await pool.query(
            'SELECT f.*,o.name supplier_name FROM offers f JOIN organizations o ON o.id=f.organization_id WHERE f.id=$1',
            [offerId],
          )
        ).rows[0],
      ),
    });
  });
  app.post('/api/v1/procurements/:id/select-offer', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = selectOfferSchema.parse(req.body);
    await transaction(async (client) => {
      const p = await lockProcurement(client, id);
      await authority(client, user, p.organization_id, 'BUYER');
      const now = await ensureJoining(client, p);
      assert(!p.frozen_at, 409, 'OFFER_FROZEN', 'Pakkumine on liitumiste tõttu lukustatud.');
      const result = await client.query('SELECT * FROM offers WHERE id=$1 AND procurement_id=$2', [
        data.offerId,
        id,
      ]);
      assert(result.rowCount, 404, 'NOT_FOUND', 'Pakkumist ei leitud.');
      assert(result.rows[0].valid_until > now, 409, 'OFFER_EXPIRED', 'Pakkumine on aegunud.');
      assert(
        result.rows[0].valid_until >= p.join_deadline_at,
        409,
        'OFFER_VALIDITY_TOO_SHORT',
        'Pakkumine peab kehtima vähemalt liitumise tähtajani.',
      );
      await client.query('UPDATE procurements SET selected_offer_id=$2 WHERE id=$1', [
        id,
        data.offerId,
      ]);
      await audit(client, user.id, id, 'OFFER_SELECTED', { offerId: data.offerId });
    });
    res.json({ procurement: await procurementById(id) });
  });
  app.post('/api/v1/procurements/:id/commitments', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = commitmentSchema.parse(req.body);
    const commitmentId = await createCommitment(user, id, data.organizationId);
    res.status(201).json({ commitment: await commitmentById(commitmentId) });
  });
  app.post('/api/v1/commitments/:id/withdraw', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req);
    await withdrawCommitment(user, id);
    res.json({ commitment: await commitmentById(id) });
  });
  app.post('/api/v1/test-payments/:commitmentId', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req, 'commitmentId'),
      data = paymentSchema.parse(req.body);
    const eventId = data.eventId ?? randomUUID();
    await captureTestPayment(user, id, data.outcome, eventId);
    res.json({
      commitment: await commitmentById(id),
      outcome: data.outcome,
      eventId,
      isTest: true,
    });
  });
  app.get('/api/v1/contracts', async (req: AuthRequest, res) => {
    const user = requireUser(req);
    const result = await pool.query(
      `${CONTRACT_SELECT} WHERE $2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=$1 AND m.status='approved' AND m.organization_id IN (c.organization_id,c.supplier_organization_id)) ORDER BY c.created_at DESC`,
      [user.id, user.isAdmin],
    );
    res.json({ contracts: result.rows.map(contractView) });
  });
  app.post('/api/v1/contracts/:id/complete', async (req: AuthRequest, res) => {
    const user = requireUser(req),
      id = param(req),
      data = completionSchema.parse(req.body);
    await transaction(async (client) => {
      const lookup = await client.query('SELECT procurement_id FROM contracts WHERE id=$1', [id]);
      assert(lookup.rowCount, 404, 'NOT_FOUND', 'Lepingut ei leitud.');
      const p = await lockProcurement(client, lookup.rows[0].procurement_id);
      const contract = (await client.query('SELECT * FROM contracts WHERE id=$1', [id])).rows[0];
      await authority(client, user, contract.organization_id, 'BUYER');
      assert(
        p.status === 'FINALIZED' && contract.status === 'ACTIVE',
        409,
        'CONTRACT_CLOSED',
        'Seda lepingut ei saa lõpetada.',
      );
      await client.query(
        "UPDATE contracts SET status='COMPLETED',completed_at=clock_timestamp(),rating=$2,comment=$3 WHERE id=$1",
        [id, data.rating, data.comment],
      );
      const remaining = await client.query(
        "SELECT id FROM contracts WHERE procurement_id=$1 AND status='ACTIVE' LIMIT 1",
        [p.id],
      );
      if (!remaining.rowCount)
        await client.query("UPDATE procurements SET status='COMPLETED' WHERE id=$1", [p.id]);
      await audit(client, user.id, p.id, 'CONTRACT_COMPLETED', {
        contractId: id,
        rating: data.rating,
      });
    });
    res.json({
      contract: contractView((await pool.query(`${CONTRACT_SELECT} WHERE c.id=$1`, [id])).rows[0]),
    });
  });
  app.get('/api/v1/admin', async (req: AuthRequest, res) => {
    requireAdmin(req);
    const [memberships, organizations, ledger, audits, jobs, procurements] = await Promise.all([
      pool.query(
        'SELECT m.*,u.name user_name,u.email user_email,row_to_json(o) organization FROM memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id ORDER BY m.status,o.name',
      ),
      pool.query('SELECT * FROM organizations ORDER BY name'),
      pool.query('SELECT * FROM ledger ORDER BY created_at DESC LIMIT 1000'),
      pool.query('SELECT * FROM audit ORDER BY created_at DESC LIMIT 1000'),
      pool.query('SELECT * FROM jobs ORDER BY due_at DESC'),
      pool.query(`${PROCUREMENT_SELECT} ORDER BY p.created_at DESC`),
    ]);
    res.json({
      memberships: memberships.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        organizationId: row.organization_id,
        role: row.role,
        status: row.status,
        userName: row.user_name,
        userEmail: row.user_email,
        organization: organizationView(row.organization, true),
      })),
      organizations: organizations.rows.map((row) => organizationView(row, true)),
      ledger: ledger.rows.map((row) => ({
        id: row.id,
        procurementId: row.procurement_id,
        commitmentId: row.commitment_id,
        organizationId: row.organization_id,
        kind: row.kind,
        amountCents: row.amount_cents,
        eventKey: row.event_key,
        createdAt: isoDate(row.created_at),
        isTest: true,
      })),
      audit: audits.rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        procurementId: row.procurement_id,
        action: row.action,
        details: row.details,
        createdAt: isoDate(row.created_at),
      })),
      jobs: jobs.rows.map((row) => ({
        id: row.id,
        procurementId: row.procurement_id,
        kind: row.kind,
        status: row.status,
        dueAt: isoDate(row.due_at),
        attempts: row.attempts,
        lastError: row.last_error,
        createdAt: isoDate(row.created_at),
      })),
      procurements: procurements.rows.map(procurementView),
    });
  });
  app.post('/api/v1/admin/memberships/:id', async (req: AuthRequest, res) => {
    const user = requireAdmin(req),
      id = param(req),
      data = approvalSchema.parse(req.body);
    await transaction(async (client) => {
      const result = await client.query(
        'UPDATE memberships SET status=$2 WHERE id=$1 RETURNING id',
        [id, data.status],
      );
      assert(result.rowCount, 404, 'NOT_FOUND', 'Esindusõiguse taotlust ei leitud.');
      await audit(client, user.id, null, 'MEMBERSHIP_REVIEWED', {
        membershipId: id,
        status: data.status,
      });
    });
    const result = await pool.query(
      'SELECT m.*,row_to_json(o) organization FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1',
      [id],
    );
    const row = result.rows[0];
    res.json({
      membership: {
        id: row.id,
        userId: row.user_id,
        organizationId: row.organization_id,
        role: row.role,
        status: row.status,
        organization: organizationView(row.organization, true),
      },
    });
  });
  app.post('/api/v1/admin/import/preview', (req: AuthRequest, res) => {
    requireAdmin(req);
    res.json(previewImport(importSchema.parse(req.body).csv));
  });
  app.post('/api/v1/admin/import', async (req: AuthRequest, res) => {
    const user = requireAdmin(req),
      preview = previewImport(importSchema.parse(req.body).csv);
    assert(
      preview.errors.length === 0,
      400,
      'IMPORT_INVALID',
      'CSV sisaldab vigu. Paranda eelvaates näidatud read.',
    );
    await transaction(async (client) => {
      for (const row of preview.rows) {
        const existing = await client.query(
          'SELECT org_type FROM organizations WHERE registry_code=$1 FOR UPDATE',
          [row.registryCode],
        );
        assert(
          !existing.rowCount || existing.rows[0].org_type === row.orgType,
          409,
          'IMPORT_TYPE_CONFLICT',
          'Olemasoleva organisatsiooni liiki ei saa impordiga muuta.',
        );
        await client.query(
          'INSERT INTO organizations(registry_code,name,org_type,address,latitude,longitude,email,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(registry_code) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,email=EXCLUDED.email',
          [
            row.registryCode,
            row.name,
            row.orgType,
            row.address,
            row.latitude,
            row.longitude,
            row.email || null,
            row.registryCode.startsWith('DEMO-'),
          ],
        );
      }
      await audit(client, user.id, null, 'ORGANIZATIONS_IMPORTED', { count: preview.rows.length });
    });
    res.status(201).json({ imported: preview.rows.length });
  });
  app.post('/api/v1/admin/procurements/:id/cancel', async (req: AuthRequest, res) => {
    const user = requireAdmin(req),
      id = param(req),
      data = cancellationSchema.parse(req.body);
    await cancelProcurement(user, id, data.reason);
    res.json({ procurement: await procurementById(id) });
  });
  app.post('/api/v1/admin/jobs/:id/retry', async (req: AuthRequest, res) => {
    const user = requireAdmin(req),
      id = param(req);
    await retryJob(user, id);
    res.json({ ok: true });
  });
  app.use('/api/v1', (_req, _res, next) =>
    next(new DomainError(404, 'NOT_FOUND', 'API tegevust ei leitud.')),
  );
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        },
      });
      return;
    }
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    const pgError = error as { code?: string; type?: string; status?: number };
    if (pgError.code === '23505') {
      res
        .status(409)
        .json({ error: { code: 'CONFLICT', message: 'Selline kirje on juba olemas.' } });
      return;
    }
    if (pgError.code === '23503') {
      res
        .status(400)
        .json({ error: { code: 'INVALID_REFERENCE', message: 'Viidatud kirjet ei leitud.' } });
      return;
    }
    if (pgError.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'JSON päring ei ole kehtiv.' } });
      return;
    }
    if (pgError.status === 413) {
      res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Päring on liiga mahukas.' } });
      return;
    }
    console.error('Request failed', error);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Tegevus ebaõnnestus. Proovi uuesti.' } });
  });
  return app;
}
