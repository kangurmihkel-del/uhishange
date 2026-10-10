CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, is_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registry_code text NOT NULL UNIQUE, name text NOT NULL,
 org_type text NOT NULL CHECK (org_type IN ('BUYER','SUPPLIER')), address text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED,
 email text, is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX organizations_location ON organizations USING gist(location);
CREATE TABLE memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 role text NOT NULL DEFAULT 'representative' CHECK(role IN ('representative','viewer')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), UNIQUE(user_id,organization_id)
);
CREATE TABLE procurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), created_by uuid NOT NULL REFERENCES users(id),
 title text NOT NULL, description text NOT NULL, radius_m integer NOT NULL CHECK(radius_m BETWEEN 50 AND 10000), join_deadline_at timestamptz NOT NULL,
 spec jsonb NOT NULL, location_latitude double precision NOT NULL, location_longitude double precision NOT NULL,
 location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(location_longitude,location_latitude),4326)::geography) STORED,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','SUCCEEDED','FINALIZED','COMPLETED','FAILED','CANCELLED')),
 selected_offer_id uuid, succeeded_at timestamptz, finalized_at timestamptz, frozen_at timestamptz,
 frozen_snapshot jsonb, best_price_cents integer CHECK(best_price_cents>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 base_price_cents integer NOT NULL CHECK(base_price_cents>0), deposit_cents integer NOT NULL CHECK(deposit_cents>0),
 terms text NOT NULL, valid_until timestamptz NOT NULL, tiers jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(procurement_id,organization_id)
);
ALTER TABLE procurements ADD CONSTRAINT selected_offer_fk FOREIGN KEY(selected_offer_id) REFERENCES offers(id);
CREATE TABLE invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 distance_m double precision, source text NOT NULL CHECK(source IN ('RADIUS','SUPPLIER','MANUAL')),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(procurement_id,organization_id)
);
CREATE TABLE commitments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','WITHDRAWN','CONTRACTED','EXPIRED','CANCELLED')),
 deposit_cents integer NOT NULL CHECK(deposit_cents>0), acceptance_snapshot jsonb NOT NULL,
 captured_at timestamptz, refunded_at timestamptz, withdrawn_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX one_current_commitment ON commitments(procurement_id,organization_id) WHERE status IN ('PENDING','ACTIVE','CONTRACTED');
CREATE TABLE payment_events (
 event_id text PRIMARY KEY, commitment_id uuid NOT NULL REFERENCES commitments(id), outcome text NOT NULL CHECK(outcome IN ('captured','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 supplier_organization_id uuid NOT NULL REFERENCES organizations(id), commitment_id uuid NOT NULL UNIQUE REFERENCES commitments(id),
 price_cents integer NOT NULL CHECK(price_cents>0), deposit_credit_cents integer NOT NULL CHECK(deposit_credit_cents>0 AND deposit_credit_cents<=price_cents),
 balance_cents integer NOT NULL CHECK(balance_cents>=0), final_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')), cancelled_at timestamptz,
 completed_at timestamptz, rating integer CHECK(rating BETWEEN 1 AND 5), comment text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), commitment_id uuid REFERENCES commitments(id),
 organization_id uuid REFERENCES organizations(id), kind text NOT NULL CHECK(kind IN ('DEPOSIT','REFUND','SUPPLIER_PAYOUT','PLATFORM_FEE','SUPPLIER_REVERSAL','FEE_REVERSAL')),
 amount_cents integer NOT NULL CHECK(amount_cents>=0), event_key text NOT NULL UNIQUE,
 is_test boolean NOT NULL DEFAULT true CHECK(is_test), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id), procurement_id uuid REFERENCES procurements(id),
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id), kind text NOT NULL DEFAULT 'FINALIZE',
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','FAILED')), due_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(procurement_id,kind)
);
CREATE INDEX jobs_due ON jobs(due_at) WHERE status='PENDING';
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only history cannot be changed'; END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_acceptance_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.acceptance_snapshot IS DISTINCT FROM OLD.acceptance_snapshot OR NEW.deposit_cents IS DISTINCT FROM OLD.deposit_cents OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.procurement_id IS DISTINCT FROM OLD.procurement_id THEN RAISE EXCEPTION 'Acceptance snapshot is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER commitment_snapshot BEFORE UPDATE ON commitments FOR EACH ROW EXECUTE FUNCTION protect_acceptance_snapshot();
CREATE TRIGGER commitment_history_delete BEFORE DELETE ON commitments FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_final_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.final_snapshot IS DISTINCT FROM OLD.final_snapshot OR NEW.price_cents IS DISTINCT FROM OLD.price_cents OR NEW.deposit_credit_cents IS DISTINCT FROM OLD.deposit_credit_cents OR NEW.balance_cents IS DISTINCT FROM OLD.balance_cents OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.commitment_id IS DISTINCT FROM OLD.commitment_id OR NEW.procurement_id IS DISTINCT FROM OLD.procurement_id OR NEW.supplier_organization_id IS DISTINCT FROM OLD.supplier_organization_id THEN RAISE EXCEPTION 'Final contract snapshot is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER contract_snapshot BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION protect_final_snapshot();
CREATE TRIGGER contract_history_delete BEFORE DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_frozen_procurement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.frozen_at IS NOT NULL AND (NEW.frozen_snapshot IS DISTINCT FROM OLD.frozen_snapshot OR NEW.selected_offer_id IS DISTINCT FROM OLD.selected_offer_id OR NEW.spec IS DISTINCT FROM OLD.spec OR NEW.join_deadline_at IS DISTINCT FROM OLD.join_deadline_at OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.location_latitude IS DISTINCT FROM OLD.location_latitude OR NEW.location_longitude IS DISTINCT FROM OLD.location_longitude) THEN RAISE EXCEPTION 'Frozen procurement cannot be changed'; END IF; RETURN NEW; END $$;
CREATE TRIGGER procurement_snapshot BEFORE UPDATE ON procurements FOR EACH ROW EXECUTE FUNCTION protect_frozen_procurement();
CREATE FUNCTION protect_success_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.succeeded_at IS NOT NULL AND NEW.succeeded_at IS DISTINCT FROM OLD.succeeded_at THEN RAISE EXCEPTION 'Success history is immutable'; END IF;
 IF OLD.succeeded_at IS NOT NULL AND OLD.best_price_cents IS NOT NULL AND (NEW.best_price_cents IS NULL OR NEW.best_price_cents>OLD.best_price_cents) THEN RAISE EXCEPTION 'Achieved price cannot increase'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER procurement_success_history BEFORE UPDATE ON procurements FOR EACH ROW EXECUTE FUNCTION protect_success_history();
CREATE FUNCTION protect_frozen_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM procurements WHERE id=OLD.procurement_id AND selected_offer_id=OLD.id AND frozen_at IS NOT NULL) THEN RAISE EXCEPTION 'Selected offer is frozen'; END IF; RETURN NEW; END $$;
CREATE TRIGGER offer_snapshot BEFORE UPDATE OR DELETE ON offers FOR EACH ROW EXECUTE FUNCTION protect_frozen_offer();
