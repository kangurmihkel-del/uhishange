import type { PoolClient } from 'pg';
import type {
  Organization,
  Procurement,
  Offer,
  Commitment,
  Contract,
  Invitation,
  User,
  Membership,
  NearbyOrganization,
} from '../shared/types.js';
import { pool } from './db.js';
import { CURRENT_FEE_POLICY, feePolicyForSnapshot } from '../shared/pricing.js';

type Row = Record<string, any>;
type Queryable = Pick<PoolClient, 'query'>;
const date = (value: unknown): string | null =>
  value == null ? null : new Date(value as string).toISOString();
export function organizationView(row: Row, contacts = false): Organization {
  return {
    id: row.id,
    registryCode: row.registry_code,
    name: row.name,
    orgType: row.org_type,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    ...(contacts ? { email: row.email } : {}),
    isDemo: row.is_demo,
  };
}
export async function membershipsFor(user: User, db: Queryable = pool): Promise<Membership[]> {
  const result = await db.query(
    'SELECT m.*, row_to_json(o) organization FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY o.name',
    [user.id],
  );
  return result.rows.map((row: Row) => ({
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    status: row.status,
    organization: organizationView(
      row.organization,
      user.isAdmin || (row.status === 'approved' && row.role === 'representative'),
    ),
  }));
}
export function procurementView(row: Row): Procurement {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    title: row.title,
    description: row.description,
    radiusM: row.radius_m,
    joinDeadlineAt: date(row.join_deadline_at)!,
    spec: row.spec,
    status: row.status,
    locationLatitude: row.location_latitude,
    locationLongitude: row.location_longitude,
    selectedOfferId: row.selected_offer_id,
    succeededAt: date(row.succeeded_at),
    finalizedAt: date(row.finalized_at),
    frozenAt: date(row.frozen_at),
    feePolicy: row.frozen_snapshot ? feePolicyForSnapshot(row.frozen_snapshot) : CURRENT_FEE_POLICY,
    bestPriceCents: row.best_price_cents,
    activeCount: Number(row.active_count ?? 0),
    createdAt: date(row.created_at)!,
  };
}
export const PROCUREMENT_SELECT = `SELECT p.*,o.name organization_name,(SELECT count(*) FROM commitments c WHERE c.procurement_id=p.id AND c.status IN ('ACTIVE','CONTRACTED')) active_count FROM procurements p JOIN organizations o ON o.id=p.organization_id`;
export async function procurementById(
  id: string,
  db: Queryable = pool,
): Promise<Procurement | undefined> {
  const result = await db.query(`${PROCUREMENT_SELECT} WHERE p.id=$1`, [id]);
  return result.rowCount ? procurementView(result.rows[0]) : undefined;
}
export function offerView(row: Row): Offer {
  return {
    id: row.id,
    procurementId: row.procurement_id,
    organizationId: row.organization_id,
    supplierName: row.supplier_name,
    basePriceCents: row.base_price_cents,
    depositCents: row.deposit_cents,
    terms: row.terms,
    validUntil: date(row.valid_until)!,
    tiers: row.tiers,
    createdAt: date(row.created_at)!,
  };
}
export function commitmentView(row: Row): Commitment {
  return {
    id: row.id,
    procurementId: row.procurement_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    status: row.status,
    depositCents: row.deposit_cents,
    capturedAt: date(row.captured_at),
    refundedAt: date(row.refunded_at),
    withdrawnAt: date(row.withdrawn_at),
    acceptanceSnapshot: row.acceptance_snapshot,
    createdAt: date(row.created_at)!,
  };
}
export function contractView(row: Row): Contract {
  return {
    id: row.id,
    procurementId: row.procurement_id,
    procurementTitle: row.procurement_title,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    supplierOrganizationId: row.supplier_organization_id,
    supplierName: row.supplier_name,
    commitmentId: row.commitment_id,
    priceCents: row.price_cents,
    depositCreditCents: row.deposit_credit_cents,
    balanceCents: row.balance_cents,
    finalSnapshot: row.final_snapshot,
    status: row.status,
    cancelledAt: date(row.cancelled_at),
    completedAt: date(row.completed_at),
    rating: row.rating,
    comment: row.comment,
    createdAt: date(row.created_at)!,
  };
}
export const CONTRACT_SELECT = `SELECT c.*,p.title procurement_title,o.name organization_name,s.name supplier_name FROM contracts c JOIN procurements p ON p.id=c.procurement_id JOIN organizations o ON o.id=c.organization_id JOIN organizations s ON s.id=c.supplier_organization_id`;
export function invitationView(row: Row): Invitation {
  return {
    id: row.id,
    procurementId: row.procurement_id,
    procurementTitle: row.procurement_title,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    distanceM: row.distance_m == null ? null : Number(row.distance_m),
    source: row.source,
    status: row.status,
    createdAt: date(row.created_at)!,
  };
}
export const INVITATION_SELECT = `SELECT i.*,p.title procurement_title,o.name organization_name FROM invitations i JOIN procurements p ON p.id=i.procurement_id JOIN organizations o ON o.id=i.organization_id`;
export async function nearbyOrganizations(
  id: string,
  db: Queryable = pool,
): Promise<NearbyOrganization[]> {
  const result = await db.query(
    `SELECT o.*,ST_Distance(o.location,p.location) distance_m FROM organizations o JOIN procurements p ON p.id=$1 WHERE o.id<>p.organization_id AND o.org_type='BUYER' AND ST_DWithin(o.location,p.location,p.radius_m) ORDER BY distance_m,o.name`,
    [id],
  );
  return result.rows.map((row: Row) => ({
    ...organizationView(row),
    distanceM: Number(row.distance_m),
  }));
}
export async function commitmentById(
  id: string,
  db: Queryable = pool,
): Promise<Commitment | undefined> {
  const result = await db.query(
    'SELECT c.*,o.name organization_name FROM commitments c JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1',
    [id],
  );
  return result.rowCount ? commitmentView(result.rows[0]) : undefined;
}
export const isoDate = date;
