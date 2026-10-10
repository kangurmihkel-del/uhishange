CREATE TABLE mailbox_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 organization_name text NOT NULL,
 procurement_id uuid NOT NULL REFERENCES procurements(id),
 procurement_title text NOT NULL,
 invitation_id uuid UNIQUE REFERENCES invitations(id),
 kind text NOT NULL CHECK(kind IN ('INVITATION','OFFER_SUBMITTED','OFFER_SELECTED','SUCCESS_REACHED','PROCUREMENT_FINALIZED','PROCUREMENT_FAILED','SUPPLIER_CANCELLATION','TEST_PAYMENT_FAILED','TEST_PAYMENT_CAPTURED','LATE_PAYMENT_REFUNDED')),
 audience text NOT NULL CHECK(audience IN ('MEMBERS','REPRESENTATIVES')),
 subject text NOT NULL,
 body text NOT NULL,
 event_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='INVITATION')=(invitation_id IS NOT NULL))
);
CREATE INDEX mailbox_organization_created ON mailbox_messages(organization_id,created_at DESC);
CREATE TABLE mailbox_reads (
 user_id uuid NOT NULL REFERENCES users(id),
 message_id uuid NOT NULL REFERENCES mailbox_messages(id),
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,message_id)
);
CREATE TRIGGER mailbox_message_append_only BEFORE UPDATE OR DELETE ON mailbox_messages FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER mailbox_read_append_only BEFORE UPDATE OR DELETE ON mailbox_reads FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Upgrade existing pilot databases without resetting their invitations or financial history.
INSERT INTO mailbox_messages(organization_id,organization_name,procurement_id,procurement_title,invitation_id,kind,audience,subject,body,event_key,created_at)
SELECT i.organization_id,o.name,i.procurement_id,p.title,i.id,'INVITATION','MEMBERS',
 'Kutse ühishankesse: ' || p.title,
 CASE WHEN o.org_type='SUPPLIER' THEN
  'Teid on kutsutud esitama lumekoristuse pakkumist. Avage ühishange, tutvuge tööde kirjeldusega ja lisage pakkumine. Kutse ei anna organisatsiooni esindusõigust.'
 ELSE
  'Teie ühistu on kutsutud ühisesse lumekoristuse hankesse. Avage ühishange ning tutvuge naabrite ja tingimustega. Kutse vastuvõtmine on eraldi liitumisest ja TEST ettemakse tasumisest. Kutse ei anna organisatsiooni esindusõigust.'
 END,
 'INVITATION:' || i.id::text,i.created_at
FROM invitations i JOIN organizations o ON o.id=i.organization_id JOIN procurements p ON p.id=i.procurement_id
ON CONFLICT(event_key) DO NOTHING;
