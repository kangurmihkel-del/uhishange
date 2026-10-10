import type { PoolClient } from 'pg';
import type { MailboxMessage, MailboxResponse, MailboxMessageKind, User } from '../shared/types.js';
import { pool, transaction } from './db.js';
import { invitationView } from './views.js';
import { assert } from './errors.js';

type DbRow = Record<string, any>;
const visible = `($2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=$1 AND m.organization_id=b.organization_id AND m.status='approved' AND (m.role='representative' OR b.audience='MEMBERS')))`;
const selection = `SELECT b.*, r.read_at, row_to_json(i) invitation,
 COUNT(*) FILTER(WHERE r.message_id IS NULL) OVER() unread_count
 FROM mailbox_messages b LEFT JOIN mailbox_reads r ON r.message_id=b.id AND r.user_id=$1
 LEFT JOIN invitations i ON i.id=b.invitation_id`;
function view(row: DbRow): MailboxMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    procurementId: row.procurement_id,
    procurementTitle: row.procurement_title,
    kind: row.kind,
    audience: row.audience,
    subject: row.subject,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    invitation: row.invitation
      ? invitationView({
          ...row.invitation,
          procurement_title: row.procurement_title,
          organization_name: row.organization_name,
        })
      : null,
  };
}
export async function getMailbox(user: User): Promise<MailboxResponse> {
  const result = await pool.query(
    `${selection} WHERE ${visible} ORDER BY b.created_at DESC,b.id DESC`,
    [user.id, user.isAdmin],
  );
  return {
    messages: result.rows.map(view),
    unreadCount: Number(result.rows[0]?.unread_count ?? 0),
  };
}
export async function markMailboxRead(user: User, id: string): Promise<MailboxMessage> {
  return transaction(async (client) => {
    const result = await client.query(`${selection} WHERE b.id=$3 AND ${visible}`, [
      user.id,
      user.isAdmin,
      id,
    ]);
    assert(result.rowCount, 404, 'NOT_FOUND', 'Kirja ei leitud.');
    await client.query(
      'INSERT INTO mailbox_reads(user_id,message_id) VALUES($1,$2) ON CONFLICT(user_id,message_id) DO NOTHING',
      [user.id, id],
    );
    const updated = await client.query(`${selection} WHERE b.id=$3 AND ${visible}`, [
      user.id,
      user.isAdmin,
      id,
    ]);
    assert(updated.rowCount, 404, 'NOT_FOUND', 'Kirja ei leitud.');
    return view(updated.rows[0]);
  });
}
export async function backfillInvitationMessages(
  client: PoolClient,
  procurementId?: string,
): Promise<void> {
  await client.query(
    `INSERT INTO mailbox_messages(organization_id,organization_name,procurement_id,procurement_title,invitation_id,kind,audience,subject,body,event_key,created_at)
 SELECT i.organization_id,o.name,i.procurement_id,p.title,i.id,'INVITATION','MEMBERS',
 'Kutse ühishankesse: ' || p.title,
 CASE WHEN o.org_type='SUPPLIER' THEN 'Teid on kutsutud esitama teenuse pakkumist. Avage ühishange, tutvuge tööde kirjeldusega ja lisage pakkumine. Kutse ei anna organisatsiooni esindusõigust.'
 ELSE 'Teie ühistu on kutsutud ühisesse teenuse hankesse. Avage ühishange ning tutvuge naabrite ja tingimustega. Kutse vastuvõtmine on eraldi liitumisest ja TEST ettemakse tasumisest. Kutse ei anna organisatsiooni esindusõigust.' END,
 'INVITATION:' || i.id::text,i.created_at FROM invitations i JOIN organizations o ON o.id=i.organization_id JOIN procurements p ON p.id=i.procurement_id
 WHERE ($1::uuid IS NULL OR p.id=$1) ON CONFLICT(event_key) DO NOTHING`,
    [procurementId ?? null],
  );
}
const supported = new Set([
  'OFFER_SUBMITTED',
  'OFFER_SELECTED',
  'SUCCESS_REACHED',
  'PROCUREMENT_FINALIZED',
  'PROCUREMENT_FAILED',
  'SUPPLIER_CANCELLATION',
  'TEST_PAYMENT_FAILED',
  'TEST_PAYMENT_CAPTURED',
  'LATE_PAYMENT_REFUNDED',
]);
export async function messagesFromAudit(
  client: PoolClient,
  auditId: string,
  procurementId: string | null,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  if (!procurementId) return;
  if (action === 'INVITATIONS_CREATED') {
    await backfillInvitationMessages(client, procurementId);
    return;
  }
  if (!supported.has(action)) return;
  const p = (
    await client.query(
      'SELECT p.*,o.name initiator_name,s.organization_id supplier_id FROM procurements p JOIN organizations o ON o.id=p.organization_id LEFT JOIN offers s ON s.id=p.selected_offer_id WHERE p.id=$1',
      [procurementId],
    )
  ).rows[0];
  if (!p) return;
  let recipients: string[] = [];
  let subject = '';
  let body = '';
  let audience: 'MEMBERS' | 'REPRESENTATIVES' = 'MEMBERS';
  if (action === 'OFFER_SUBMITTED') {
    recipients = [p.organization_id];
    subject = 'Uus pakkumine: ' + p.title;
    body =
      'Teenusepakkuja lisas või uuendas teenuse pakkumist. Võrdle hindu ja tingimusi ning vali ühine pakkumine enne ühistute liitumist.';
  } else if (action.startsWith('TEST_PAYMENT') || action === 'LATE_PAYMENT_REFUNDED') {
    const c = (
      await client.query('SELECT organization_id FROM commitments WHERE id=$1', [
        details.commitmentId,
      ])
    ).rows[0];
    if (!c) return;
    recipients = [c.organization_id];
    audience = 'REPRESENTATIVES';
    subject =
      (action === 'TEST_PAYMENT_CAPTURED'
        ? 'TEST: tagatisraha makstud'
        : action === 'TEST_PAYMENT_FAILED'
          ? 'TEST: makse ebaõnnestus'
          : 'TEST: hilinenud makse tagastatud') +
      ': ' +
      p.title;
    body =
      action === 'TEST_PAYMENT_CAPTURED'
        ? 'Tagatisraha testmakse on kinnitatud ja ühistu osalemine arvesse võetud. Tegelikku raha ei liigu. Vaata ühishanke edenemist.'
        : action === 'TEST_PAYMENT_FAILED'
          ? 'TEST maksekatse ebaõnnestus. Kontrolli hankevaates oma osalemise ja varasemate maksete seisu. Kinnitamata osalemise puhul saad avatud liitumise ajal testmakset uuesti proovida. Tegelikku raha ei liigu.'
          : 'Makse saabus pärast loobumist või liitumise tähtaega. TEST makse on registreeritud ja täies ulatuses tagastatud; osalejate arv ei suurenenud. Tegelikku raha ei liigu.';
  } else {
    recipients = (
      await client.query(
        `SELECT organization_id FROM invitations WHERE procurement_id=$1 UNION SELECT organization_id FROM commitments WHERE procurement_id=$1 UNION SELECT organization_id FROM procurements WHERE id=$1 UNION SELECT organization_id FROM offers WHERE id=$2`,
        [procurementId, p.selected_offer_id],
      )
    ).rows.map((row) => row.organization_id);
    if (action === 'OFFER_SELECTED') {
      subject = 'Pakkumine valitud: ' + p.title;
      body =
        'Algataja valis ühise teenusepakkuja. Ühistud saavad liitumise tähtajani tingimused kinnitada ja teha TEST tagatisraha makse. Tegelikku raha ei liigu. Kutse vastuvõtmine ei asenda liitumist.';
    } else if (action === 'SUCCESS_REACHED') {
      subject = 'Hange õnnestus: ' + p.title;
      body =
        'Vajalik arv ühistuid on testtagatisraha maksnud. Eesmärk on saavutatud ja parim saavutatud hind ei tõuse. Uued ühistud saavad tähtajani liituda. TEST: tegelikku raha ei liigu.';
    } else if (action === 'PROCUREMENT_FINALIZED') {
      audience = 'REPRESENTATIVES';
      subject = 'Lepingud loodud: ' + p.title;
      body =
        'Liitumise tähtaeg lõppes. Jätkavate ühistute lepingud ja lõplik hinnaarvestus on loodud. TEST tagatis arvestatakse teenuse hinna sisse; ülejäänud tasu arveldatakse otse teenusepakkujaga. Tegelikku raha ei liigu.';
    } else if (action === 'PROCUREMENT_FAILED') {
      audience = 'REPRESENTATIVES';
      subject = 'Hange ei täitunud: ' + p.title;
      body =
        'Osalejate eesmärk jäi tähtajaks täitumata. Kõik makstud TEST tagatisrahad on täies ulatuses tagastatud. Tegelikku raha ei liigu. Varasem osalemise ajalugu säilib.';
    } else {
      audience = 'REPRESENTATIVES';
      subject = 'Hange tühistatud: ' + p.title;
      body =
        'Hange tühistati. Kõik makstud TEST tagatisrahad tagastati ning varasemad testväljamaksed ja teenustasud pöörati tagasi. Tegelikku raha ei liigu. Vaata ühishanke ja lepingute ajalugu.';
      if (typeof details.reason === 'string') body += ' Põhjus: ' + details.reason;
    }
  }
  for (const organizationId of new Set(recipients)) {
    const eventKey =
      action === 'OFFER_SELECTED'
        ? action + ':' + String(details.offerId) + ':' + organizationId
        : action + ':' + auditId + ':' + organizationId;
    await client.query(
      `INSERT INTO mailbox_messages(organization_id,organization_name,procurement_id,procurement_title,kind,audience,subject,body,event_key) SELECT o.id,o.name,$2,$3,$4,$5,$6,$7,$8 FROM organizations o WHERE o.id=$1 ON CONFLICT(event_key) DO NOTHING`,
      [
        organizationId,
        procurementId,
        p.title,
        action as MailboxMessageKind,
        audience,
        subject,
        body,
        eventKey,
      ],
    );
  }
}
