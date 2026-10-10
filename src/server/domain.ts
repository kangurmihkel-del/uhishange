import type { PoolClient } from 'pg';
import type {
  User,
  SnowSpec,
  PriceTier,
  OrganizationType,
  AgreementSnapshot,
  AcceptanceSnapshot,
  FinalContractSnapshot,
} from '../shared/types.js';
import { pool, transaction } from './db.js';
import { assert, DomainError } from './errors.js';
import { organizationView } from './views.js';
import { PLATFORM_FEE_BASIS_POINTS } from '../shared/constants.js';

export interface ProcurementRow {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string;
  radius_m: number;
  join_deadline_at: Date;
  spec: SnowSpec;
  status: string;
  selected_offer_id: string | null;
  succeeded_at: Date | null;
  finalized_at: Date | null;
  frozen_at: Date | null;
  frozen_snapshot: AgreementSnapshot | null;
  best_price_cents: number | null;
  location_latitude: number;
  location_longitude: number;
}
interface OfferRow {
  id: string;
  procurement_id: string;
  organization_id: string;
  base_price_cents: number;
  deposit_cents: number;
  terms: string;
  valid_until: Date;
  tiers: PriceTier[];
}
interface CommitmentRow {
  id: string;
  procurement_id: string;
  organization_id: string;
  status: string;
  deposit_cents: number;
  captured_at: Date | null;
  refunded_at: Date | null;
  acceptance_snapshot: AcceptanceSnapshot;
}
export async function audit(
  client: PoolClient,
  userId: string | null,
  procurementId: string | null,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    'INSERT INTO audit(actor_user_id,procurement_id,action,details) VALUES($1,$2,$3,$4)',
    [userId, procurementId, action, JSON.stringify(details)],
  );
}
export async function authority(
  client: PoolClient,
  user: User,
  organizationId: string,
  orgType?: OrganizationType,
): Promise<void> {
  const organization = await client.query('SELECT org_type FROM organizations WHERE id=$1', [
    organizationId,
  ]);
  assert(organization.rowCount, 404, 'NOT_FOUND', 'Organisatsiooni ei leitud.');
  assert(
    !orgType || organization.rows[0].org_type === orgType,
    403,
    'WRONG_ORGANIZATION_TYPE',
    'Organisatsiooni liik ei võimalda seda tegevust.',
  );
  const result = await client.query(
    "SELECT id FROM memberships WHERE user_id=$1 AND organization_id=$2 AND status='approved' AND role='representative'",
    [user.id, organizationId],
  );
  assert(
    result.rowCount || user.isAdmin,
    403,
    'MEMBERSHIP_REQUIRED',
    'Vajalik on kinnitatud esindusõigus.',
  );
}
export async function lockProcurement(client: PoolClient, id: string): Promise<ProcurementRow> {
  const result = await client.query<ProcurementRow>(
    'SELECT * FROM procurements WHERE id=$1 FOR UPDATE',
    [id],
  );
  assert(result.rowCount, 404, 'NOT_FOUND', 'Ühishanget ei leitud.');
  return result.rows[0];
}
export async function databaseNow(client: PoolClient): Promise<Date> {
  return (await client.query<{ now: Date }>('SELECT clock_timestamp() now')).rows[0].now;
}
export async function ensureJoining(client: PoolClient, p: ProcurementRow): Promise<Date> {
  const now = await databaseNow(client);
  assert(
    ['OPEN', 'SUCCEEDED'].includes(p.status) && now < p.join_deadline_at,
    409,
    'JOINING_CLOSED',
    'Selle ühishankega liitumine on lõppenud.',
  );
  return now;
}
async function ledger(
  client: PoolClient,
  p: ProcurementRow,
  commitment: CommitmentRow,
  kind: string,
  amount: number,
  organizationId: string | null = commitment.organization_id,
): Promise<void> {
  await client.query(
    'INSERT INTO ledger(procurement_id,commitment_id,organization_id,kind,amount_cents,event_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING',
    [p.id, commitment.id, organizationId, kind, amount, `${kind}:${commitment.id}`],
  );
}
async function refund(
  client: PoolClient,
  p: ProcurementRow,
  commitment: CommitmentRow,
): Promise<void> {
  if (!commitment.captured_at || commitment.refunded_at) return;
  await ledger(client, p, commitment, 'REFUND', commitment.deposit_cents);
  await client.query(
    'UPDATE commitments SET refunded_at=COALESCE(refunded_at,clock_timestamp()) WHERE id=$1',
    [commitment.id],
  );
}
export async function createCommitment(
  user: User,
  procurementId: string,
  organizationId: string,
): Promise<string> {
  return transaction(async (client) => {
    const p = await lockProcurement(client, procurementId);
    await authority(client, user, organizationId, 'BUYER');
    const now = await ensureJoining(client, p);
    const eligible = await client.query(
      'SELECT o.id FROM organizations o JOIN procurements p ON p.id=$1 WHERE o.id=$2 AND (o.id=p.organization_id OR ST_DWithin(o.location,p.location,p.radius_m))',
      [p.id, organizationId],
    );
    assert(
      eligible.rowCount,
      403,
      'OUTSIDE_RADIUS',
      'Organisatsioon jääb selle ühishanke piirkonnast välja.',
    );
    assert(p.selected_offer_id, 409, 'OFFER_REQUIRED', 'Algataja peab esmalt pakkumise valima.');
    const offer = (
      await client.query<OfferRow>('SELECT * FROM offers WHERE id=$1', [p.selected_offer_id])
    ).rows[0];
    assert(
      p.frozen_at || offer.valid_until > now,
      409,
      'OFFER_EXPIRED',
      'Valitud pakkumine on aegunud.',
    );
    const profiles = await client.query('SELECT * FROM organizations WHERE id=ANY($1::uuid[])', [
      [p.organization_id, offer.organization_id, organizationId],
    ]);
    const profile = (id: string) => organizationView(profiles.rows.find((row) => row.id === id));
    const snapshot: AgreementSnapshot = p.frozen_snapshot ?? {
      procurementId: p.id,
      title: p.title,
      description: p.description,
      spec: p.spec,
      locationLatitude: p.location_latitude,
      locationLongitude: p.location_longitude,
      initiatorOrganization: profile(p.organization_id),
      supplierOrganization: profile(offer.organization_id),
      joinDeadlineAt: p.join_deadline_at.toISOString(),
      supplierOrganizationId: offer.organization_id,
      offerId: offer.id,
      basePriceCents: offer.base_price_cents,
      depositCents: offer.deposit_cents,
      tiers: offer.tiers,
      terms: offer.terms,
      feeBasisPoints: PLATFORM_FEE_BASIS_POINTS,
      currency: 'EUR',
      paymentMode: 'TEST',
    };
    if (!p.frozen_at)
      await client.query(
        'UPDATE procurements SET frozen_at=clock_timestamp(),frozen_snapshot=$2 WHERE id=$1',
        [p.id, JSON.stringify(snapshot)],
      );
    const duplicate = await client.query(
      "SELECT id FROM commitments WHERE procurement_id=$1 AND organization_id=$2 AND status IN ('PENDING','ACTIVE','CONTRACTED')",
      [p.id, organizationId],
    );
    assert(
      !duplicate.rowCount,
      409,
      'DUPLICATE_COMMITMENT',
      'Organisatsioon on selle ühishankega juba liitunud.',
    );
    const result = await client.query<{ id: string }>(
      'INSERT INTO commitments(procurement_id,organization_id,deposit_cents,acceptance_snapshot) VALUES($1,$2,$3,$4) RETURNING id',
      [
        p.id,
        organizationId,
        offer.deposit_cents,
        JSON.stringify({
          ...snapshot,
          buyerOrganizationId: organizationId,
          buyerOrganization: profile(organizationId),
          acceptedByUserId: user.id,
          acceptedAt: now.toISOString(),
          authorityConfirmed: true,
          scopeConfirmed: true,
        }),
      ],
    );
    await audit(client, user.id, p.id, 'COMMITMENT_CREATED', {
      commitmentId: result.rows[0].id,
      organizationId,
    });
    return result.rows[0].id;
  });
}
export async function captureTestPayment(
  user: User,
  commitmentId: string,
  outcome: 'captured' | 'failed',
  eventId: string,
): Promise<void> {
  await transaction(async (client) => {
    const lookup = await client.query<{ procurement_id: string }>(
      'SELECT procurement_id FROM commitments WHERE id=$1',
      [commitmentId],
    );
    assert(lookup.rowCount, 404, 'NOT_FOUND', 'Liitumist ei leitud.');
    const p = await lockProcurement(client, lookup.rows[0].procurement_id);
    const c = (
      await client.query<CommitmentRow>('SELECT * FROM commitments WHERE id=$1', [commitmentId])
    ).rows[0];
    await authority(client, user, c.organization_id, 'BUYER');
    const existing = await client.query<{ commitment_id: string; outcome: string }>(
      'SELECT commitment_id,outcome FROM payment_events WHERE event_id=$1',
      [eventId],
    );
    if (existing.rowCount) {
      assert(
        existing.rows[0].commitment_id === c.id && existing.rows[0].outcome === outcome,
        409,
        'EVENT_CONFLICT',
        'Maksesündmuse tunnus on juba kasutusel.',
      );
      return;
    }
    await client.query(
      'INSERT INTO payment_events(event_id,commitment_id,outcome) VALUES($1,$2,$3)',
      [eventId, c.id, outcome],
    );
    if (outcome === 'failed') {
      await audit(client, user.id, p.id, 'TEST_PAYMENT_FAILED', { commitmentId, eventId });
      return;
    }
    if (c.captured_at) return;
    const now = await databaseNow(client);
    await ledger(client, p, c, 'DEPOSIT', c.deposit_cents);
    await client.query('UPDATE commitments SET captured_at=$2 WHERE id=$1', [c.id, now]);
    c.captured_at = now;
    if (
      c.status !== 'PENDING' ||
      !['OPEN', 'SUCCEEDED'].includes(p.status) ||
      now >= p.join_deadline_at
    ) {
      await refund(client, p, c);
      if (c.status === 'PENDING')
        await client.query("UPDATE commitments SET status='EXPIRED' WHERE id=$1", [c.id]);
      await audit(client, user.id, p.id, 'LATE_PAYMENT_REFUNDED', { commitmentId, eventId });
      return;
    }
    await client.query("UPDATE commitments SET status='ACTIVE' WHERE id=$1", [c.id]);
    const count = Number(
      (
        await client.query<{ count: string }>(
          "SELECT count(*) FROM commitments WHERE procurement_id=$1 AND status='ACTIVE'",
          [p.id],
        )
      ).rows[0].count,
    );
    const tiers = p.frozen_snapshot!.tiers as PriceTier[];
    const reached = tiers.filter((tier) => count >= tier.minParticipants).at(-1);
    if (reached) {
      await client.query(
        "UPDATE procurements SET status='SUCCEEDED',succeeded_at=COALESCE(succeeded_at,$2),best_price_cents=LEAST(COALESCE(best_price_cents,$3),$3) WHERE id=$1",
        [p.id, now, reached.priceCents],
      );
      if (!p.succeeded_at)
        await audit(client, user.id, p.id, 'SUCCESS_REACHED', {
          participantCount: count,
          priceCents: reached.priceCents,
        });
    }
    await audit(client, user.id, p.id, 'TEST_PAYMENT_CAPTURED', {
      commitmentId,
      eventId,
      participantCount: count,
    });
  });
}
export async function withdrawCommitment(user: User, commitmentId: string): Promise<void> {
  await transaction(async (client) => {
    const lookup = await client.query<{ procurement_id: string }>(
      'SELECT procurement_id FROM commitments WHERE id=$1',
      [commitmentId],
    );
    assert(lookup.rowCount, 404, 'NOT_FOUND', 'Liitumist ei leitud.');
    const p = await lockProcurement(client, lookup.rows[0].procurement_id);
    const c = (
      await client.query<CommitmentRow>('SELECT * FROM commitments WHERE id=$1', [commitmentId])
    ).rows[0];
    await authority(client, user, c.organization_id, 'BUYER');
    if (c.status === 'WITHDRAWN') return;
    if (p.status === 'FINALIZED' && c.status === 'CONTRACTED') {
      const contract = await client.query<{ status: string }>(
        'SELECT status FROM contracts WHERE commitment_id=$1',
        [c.id],
      );
      assert(
        contract.rowCount && contract.rows[0].status === 'ACTIVE',
        409,
        'WITHDRAWAL_CLOSED',
        'Lõpetatud lepingust ei saa loobuda.',
      );
      await client.query(
        "UPDATE contracts SET status='CANCELLED',cancelled_at=clock_timestamp() WHERE commitment_id=$1",
        [c.id],
      );
      await client.query(
        "UPDATE commitments SET status='WITHDRAWN',withdrawn_at=clock_timestamp() WHERE id=$1",
        [c.id],
      );
      await audit(client, user.id, p.id, 'CONTRACT_WITHDRAWAL_DEPOSIT_RETAINED', { commitmentId });
      return;
    }
    await ensureJoining(client, p);
    assert(
      ['PENDING', 'ACTIVE'].includes(c.status),
      409,
      'WITHDRAWAL_CLOSED',
      'Seda liitumist ei saa enam tagasi võtta.',
    );
    await client.query(
      "UPDATE commitments SET status='WITHDRAWN',withdrawn_at=clock_timestamp() WHERE id=$1",
      [c.id],
    );
    if (!p.succeeded_at) await refund(client, p, c);
    await audit(
      client,
      user.id,
      p.id,
      p.succeeded_at && c.captured_at ? 'WITHDRAWAL_DEPOSIT_RETAINED' : 'WITHDRAWAL_REFUNDED',
      { commitmentId },
    );
  });
}
async function finalizeLocked(client: PoolClient, p: ProcurementRow): Promise<boolean> {
  if (['FINALIZED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(p.status)) return true;
  if ((await databaseNow(client)) < p.join_deadline_at) return false;
  const commitments = (
    await client.query<CommitmentRow>(
      'SELECT * FROM commitments WHERE procurement_id=$1 ORDER BY id',
      [p.id],
    )
  ).rows;
  if (!p.succeeded_at) {
    for (const c of commitments) await refund(client, p, c);
    await client.query(
      "UPDATE commitments SET status='EXPIRED' WHERE procurement_id=$1 AND status IN ('PENDING','ACTIVE')",
      [p.id],
    );
    await client.query(
      "UPDATE procurements SET status='FAILED',finalized_at=clock_timestamp() WHERE id=$1",
      [p.id],
    );
    await audit(client, null, p.id, 'PROCUREMENT_FAILED', {});
    return true;
  }
  const snapshot = p.frozen_snapshot!;
  const supplier = snapshot.supplierOrganizationId;
  const price = p.best_price_cents!;
  for (const c of commitments) {
    if (c.status === 'ACTIVE' && c.captured_at && !c.refunded_at) {
      const final: FinalContractSnapshot = {
        ...snapshot,
        buyerOrganizationId: c.organization_id,
        buyerOrganization: c.acceptance_snapshot.buyerOrganization,
        commitmentId: c.id,
        finalPriceCents: price,
        depositCreditCents: c.deposit_cents,
        remainingInvoiceCents: price - c.deposit_cents,
        finalizedAt: (await databaseNow(client)).toISOString(),
      };
      await client.query(
        'INSERT INTO contracts(procurement_id,organization_id,supplier_organization_id,commitment_id,price_cents,deposit_credit_cents,balance_cents,final_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(commitment_id) DO NOTHING',
        [
          p.id,
          c.organization_id,
          supplier,
          c.id,
          price,
          c.deposit_cents,
          price - c.deposit_cents,
          JSON.stringify(final),
        ],
      );
      await client.query("UPDATE commitments SET status='CONTRACTED' WHERE id=$1", [c.id]);
    }
    if (
      c.captured_at &&
      !c.refunded_at &&
      ['ACTIVE', 'WITHDRAWN', 'CONTRACTED'].includes(c.status)
    ) {
      const fee = Math.floor((c.deposit_cents * PLATFORM_FEE_BASIS_POINTS + 5000) / 10000);
      await ledger(client, p, c, 'PLATFORM_FEE', fee, null);
      await ledger(client, p, c, 'SUPPLIER_PAYOUT', c.deposit_cents - fee, supplier);
    }
  }
  await client.query(
    "UPDATE commitments SET status='EXPIRED' WHERE procurement_id=$1 AND status='PENDING'",
    [p.id],
  );
  await client.query(
    "UPDATE procurements SET status='FINALIZED',finalized_at=clock_timestamp() WHERE id=$1",
    [p.id],
  );
  await audit(client, null, p.id, 'PROCUREMENT_FINALIZED', { priceCents: price });
  return true;
}
export async function cancelProcurement(
  user: User,
  procurementId: string,
  reason: string,
): Promise<void> {
  assert(
    user.isAdmin,
    403,
    'FORBIDDEN',
    'Ainult haldur saab teenusepakkuja tühistamise kinnitada.',
  );
  await transaction(async (client) => {
    const p = await lockProcurement(client, procurementId);
    if (p.status === 'CANCELLED') return;
    const commitments = (
      await client.query<CommitmentRow>(
        'SELECT * FROM commitments WHERE procurement_id=$1 ORDER BY id',
        [p.id],
      )
    ).rows;
    for (const c of commitments) {
      const allocations = await client.query<{
        kind: string;
        amount_cents: number;
        organization_id: string | null;
      }>(
        "SELECT kind,amount_cents,organization_id FROM ledger WHERE commitment_id=$1 AND kind IN ('PLATFORM_FEE','SUPPLIER_PAYOUT')",
        [c.id],
      );
      for (const allocation of allocations.rows)
        await ledger(
          client,
          p,
          c,
          allocation.kind === 'PLATFORM_FEE' ? 'FEE_REVERSAL' : 'SUPPLIER_REVERSAL',
          allocation.amount_cents,
          allocation.organization_id,
        );
      await refund(client, p, c);
    }
    await client.query(
      "UPDATE commitments SET status='CANCELLED' WHERE procurement_id=$1 AND status IN ('PENDING','ACTIVE','CONTRACTED')",
      [p.id],
    );
    await client.query(
      "UPDATE contracts SET status='CANCELLED',cancelled_at=COALESCE(cancelled_at,clock_timestamp()) WHERE procurement_id=$1",
      [p.id],
    );
    await client.query(
      "UPDATE procurements SET status='CANCELLED',finalized_at=COALESCE(finalized_at,clock_timestamp()) WHERE id=$1",
      [p.id],
    );
    await client.query("UPDATE jobs SET status='DONE',last_error=NULL WHERE procurement_id=$1", [
      p.id,
    ]);
    await audit(client, user.id, p.id, 'SUPPLIER_CANCELLATION', { reason });
  });
}
export async function processJobs(limit = 50): Promise<number> {
  let handled = 0;
  for (let index = 0; index < limit; index++) {
    let jobId: string | undefined;
    try {
      const candidate = await pool.query<{ id: string; procurement_id: string }>(
        "SELECT id,procurement_id FROM jobs WHERE status='PENDING' AND due_at<=clock_timestamp() ORDER BY due_at LIMIT 1",
      );
      if (!candidate.rowCount) break;
      const found = await transaction(async (client) => {
        const p = await lockProcurement(client, candidate.rows[0].procurement_id);
        const job = await client.query<{ id: string }>(
          "SELECT id FROM jobs WHERE id=$1 AND status='PENDING' AND due_at<=clock_timestamp() FOR UPDATE SKIP LOCKED",
          [candidate.rows[0].id],
        );
        if (!job.rowCount) return false;
        jobId = job.rows[0].id;
        await client.query("UPDATE jobs SET status='RUNNING',attempts=attempts+1 WHERE id=$1", [
          jobId,
        ]);
        const done = await finalizeLocked(client, p);
        await client.query('UPDATE jobs SET status=$2,due_at=$3,last_error=NULL WHERE id=$1', [
          jobId,
          done ? 'DONE' : 'PENDING',
          p.join_deadline_at,
        ]);
        return true;
      });
      if (!found) continue;
      handled++;
    } catch (error) {
      if (!jobId) throw error;
      await pool.query(
        "UPDATE jobs SET status='FAILED',attempts=attempts+1,last_error=$2 WHERE id=$1 AND status='PENDING'",
        [jobId, error instanceof Error ? error.message.slice(0, 1000) : 'Worker error'],
      );
      handled++;
    }
  }
  return handled;
}
export const processDueProcurements = processJobs;
export async function retryJob(user: User, id: string): Promise<void> {
  await transaction(async (client) => {
    const lookup = await client.query<{ procurement_id: string }>(
      'SELECT procurement_id FROM jobs WHERE id=$1',
      [id],
    );
    assert(lookup.rowCount, 404, 'NOT_FOUND', 'Tööd ei leitud.');
    await lockProcurement(client, lookup.rows[0].procurement_id);
    const job = await client.query<{ id: string; procurement_id: string; status: string }>(
      'SELECT * FROM jobs WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (job.rows[0].status === 'DONE')
      throw new DomainError(409, 'JOB_DONE', 'Töö on juba lõpetatud.');
    await client.query("UPDATE jobs SET status='PENDING',last_error=NULL WHERE id=$1", [id]);
    await audit(client, user.id, job.rows[0].procurement_id, 'JOB_RETRIED', { jobId: id });
  });
}
