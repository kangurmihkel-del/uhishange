export type OrganizationType = 'BUYER' | 'SUPPLIER';
export type ProcurementStatus =
  'DRAFT' | 'OPEN' | 'SUCCEEDED' | 'FINALIZED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type CommitmentStatus =
  'PENDING' | 'ACTIVE' | 'WITHDRAWN' | 'CONTRACTED' | 'EXPIRED' | 'CANCELLED';
export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}
export interface Organization {
  id: string;
  registryCode: string;
  name: string;
  orgType: OrganizationType;
  address: string;
  latitude: number;
  longitude: number;
  email?: string | null;
  isDemo: boolean;
}
export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: 'representative' | 'viewer';
  status: 'pending' | 'approved' | 'rejected';
  organization: Organization;
  userName?: string;
  userEmail?: string;
}
export interface SessionResponse {
  user: User | null;
  memberships: Membership[];
}
export interface SnowSpec {
  seasonStart: string;
  seasonEnd: string;
  areaM2: number;
  parkingM2: number;
  walkwayM: number;
  triggerCm: number;
  responseHours: number;
  gritting: boolean;
  snowHauling: boolean;
}
export type ServiceFormId = 'snow' | 'pest' | 'energy' | 'branches' | 'other';
export type ServiceAnswer = string | number | boolean | string[];
export type ServiceAnswers = Record<string, ServiceAnswer>;
export interface ServiceSpec {
  formId: ServiceFormId;
  version: 1;
  answers: ServiceAnswers;
}
export type ProcurementSpec = SnowSpec | ServiceSpec;
export interface PriceTier {
  minParticipants: number;
  priceCents: number;
}
export interface FeePolicy {
  version: 'contract-price-v1' | 'deposit-v1';
  basisPoints: number;
  minimumCents: number;
}
export interface AgreementSnapshot {
  procurementId: string;
  title: string;
  description: string;
  spec: ProcurementSpec;
  locationLatitude: number;
  locationLongitude: number;
  initiatorOrganization: Organization;
  supplierOrganization: Organization;
  joinDeadlineAt: string;
  supplierOrganizationId: string;
  offerId: string;
  basePriceCents: number;
  depositCents: number;
  tiers: PriceTier[];
  terms: string;
  feeBasisPoints: number;
  feePolicy?: FeePolicy;
  currency: 'EUR';
  paymentMode: 'TEST';
}
export interface AcceptanceSnapshot extends AgreementSnapshot {
  buyerOrganizationId: string;
  buyerOrganization: Organization;
  acceptedByUserId: string;
  acceptedAt: string;
  authorityConfirmed: true;
  scopeConfirmed: true;
}
export interface FinalContractSnapshot extends AgreementSnapshot {
  buyerOrganizationId: string;
  buyerOrganization: Organization;
  commitmentId: string;
  finalPriceCents: number;
  depositCreditCents: number;
  remainingInvoiceCents: number;
  serviceFeeCents?: number;
  supplierPayoutCents?: number;
  finalizedAt: string;
}
export interface Procurement {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  radiusM: number;
  joinDeadlineAt: string;
  spec: ProcurementSpec;
  status: ProcurementStatus;
  locationLatitude: number;
  locationLongitude: number;
  selectedOfferId: string | null;
  succeededAt: string | null;
  finalizedAt: string | null;
  frozenAt: string | null;
  feePolicy: FeePolicy;
  bestPriceCents: number | null;
  activeCount: number;
  createdAt: string;
}
export interface Offer {
  id: string;
  procurementId: string;
  organizationId: string;
  supplierName: string;
  basePriceCents: number;
  depositCents: number;
  terms: string;
  validUntil: string;
  tiers: PriceTier[];
  createdAt: string;
}
export interface Commitment {
  id: string;
  procurementId: string;
  organizationId: string;
  organizationName: string;
  status: CommitmentStatus;
  depositCents: number;
  capturedAt: string | null;
  refundedAt: string | null;
  withdrawnAt: string | null;
  acceptanceSnapshot: AcceptanceSnapshot;
  createdAt: string;
}
export interface Contract {
  id: string;
  procurementId: string;
  procurementTitle: string;
  organizationId: string;
  organizationName: string;
  supplierOrganizationId: string;
  supplierName: string;
  commitmentId: string;
  priceCents: number;
  depositCreditCents: number;
  balanceCents: number;
  finalSnapshot: FinalContractSnapshot;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  cancelledAt: string | null;
  completedAt: string | null;
  rating: number | null;
  comment: string | null;
  createdAt: string;
}
export interface Invitation {
  id: string;
  procurementId: string;
  procurementTitle: string;
  organizationId: string;
  organizationName: string;
  distanceM: number | null;
  source: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}
export type MailboxMessageKind =
  | 'INVITATION'
  | 'OFFER_SUBMITTED'
  | 'OFFER_SELECTED'
  | 'SUCCESS_REACHED'
  | 'PROCUREMENT_FINALIZED'
  | 'PROCUREMENT_FAILED'
  | 'SUPPLIER_CANCELLATION'
  | 'TEST_PAYMENT_FAILED'
  | 'TEST_PAYMENT_CAPTURED'
  | 'LATE_PAYMENT_REFUNDED';
export interface MailboxMessage {
  id: string;
  organizationId: string;
  organizationName: string;
  procurementId: string;
  procurementTitle: string;
  kind: MailboxMessageKind;
  subject: string;
  body: string;
  audience: 'MEMBERS' | 'REPRESENTATIVES';
  createdAt: string;
  readAt: string | null;
  invitation: Invitation | null;
}
export interface MailboxResponse {
  messages: MailboxMessage[];
  unreadCount: number;
}
export interface NearbyOrganization extends Organization {
  distanceM: number;
}
export interface ProcurementDetail {
  procurement: Procurement;
  offers: Offer[];
  commitments: Commitment[];
  contracts: Contract[];
  nearby: NearbyOrganization[];
  invitations: Invitation[];
}
export interface LedgerEntry {
  id: string;
  procurementId: string;
  commitmentId: string | null;
  organizationId: string | null;
  kind: string;
  amountCents: number;
  eventKey: string;
  createdAt: string;
  isTest: true;
}
export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  procurementId: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}
export interface Job {
  id: string;
  procurementId: string;
  kind: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  dueAt: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}
export interface AdminResponse {
  memberships: Membership[];
  organizations: Organization[];
  ledger: LedgerEntry[];
  audit: AuditEntry[];
  jobs: Job[];
  procurements: Procurement[];
}
export interface ImportRow {
  registryCode: string;
  name: string;
  orgType: OrganizationType;
  address: string;
  latitude: number;
  longitude: number;
  email?: string;
}
export interface ImportPreview {
  rows: ImportRow[];
  errors: Array<{ row: number; message: string }>;
}
export interface ApiErrorResponse {
  error: { code: string; message: string };
}
