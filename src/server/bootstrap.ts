import { pathToFileURL } from 'node:url';
import { migrate, pool, transaction } from './db.js';
import { hashPassword } from './auth.js';
import { backfillInvitationMessages } from './mailbox.js';

export async function bootstrap(options: { seed?: boolean } = { seed: true }): Promise<void> {
  await migrate();
  if (!options.seed) return;
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('uhishange:seed'))");
    if ((await client.query("SELECT id FROM users WHERE email='admin@demo.test'")).rowCount) return;
    const passwordHash = await hashPassword('Demo2026!');
    await client.query(
      "INSERT INTO users(email,name,password_hash,is_admin) VALUES('admin@demo.test','Demo haldur',$1,true)",
      [passwordHash],
    );
    const supplier = (
      await client.query<{ id: string }>(
        "INSERT INTO organizations(registry_code,name,org_type,address,latitude,longitude,email,is_demo) VALUES('DEMO-9001','Lumering OÜ (demo)','SUPPLIER','Kadaka tee 5, Tallinn',59.4157,24.6795,'supplier@demo.test',true) RETURNING id",
      )
    ).rows[0].id;
    const supplierUser = (
      await client.query<{ id: string }>(
        "INSERT INTO users(email,name,password_hash) VALUES('supplier@demo.test','Marten Lumering',$1) RETURNING id",
        [passwordHash],
      )
    ).rows[0].id;
    await client.query(
      "INSERT INTO memberships(user_id,organization_id,status) VALUES($1,$2,'approved')",
      [supplierUser, supplier],
    );
    const points = [
      [59.405, 24.69, 'Sõpruse pst 212'],
      [59.4056, 24.691, 'Sõpruse pst 214'],
      [59.4043, 24.6886, 'Sõpruse pst 210'],
      [59.406, 24.6885, 'Tammsaare tee 93'],
      [59.4065, 24.6922, 'Tammsaare tee 95'],
      [59.4033, 24.6914, 'Akadeemia tee 18'],
      [59.4055, 24.694, 'Sõpruse pst 218'],
      [59.4026, 24.689, 'Akadeemia tee 20'],
    ] as const;
    const buyers: Array<{ organizationId: string; userId: string }> = [];
    for (const [index, point] of points.entries()) {
      const email = `buyer${index + 1}@demo.test`;
      const organizationId = (
        await client.query<{ id: string }>(
          "INSERT INTO organizations(registry_code,name,org_type,address,latitude,longitude,email,is_demo) VALUES($1,$2,'BUYER',$3,$4,$5,$6,true) RETURNING id",
          [
            `DEMO-${1001 + index}`,
            `KÜ ${point[2]} (demo)`,
            `${point[2]}, Mustamäe, Tallinn`,
            point[0],
            point[1],
            email,
          ],
        )
      ).rows[0].id;
      const userId = (
        await client.query<{ id: string }>(
          'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',
          [email, `Demo esindaja ${index + 1}`, passwordHash],
        )
      ).rows[0].id;
      await client.query(
        "INSERT INTO memberships(user_id,organization_id,status) VALUES($1,$2,'approved')",
        [userId, organizationId],
      );
      buyers.push({ organizationId, userId });
    }
    const deadline = new Date(Date.now() + 7 * 86400000).toISOString();
    const spec = JSON.stringify({
      seasonStart: '2026-11-01',
      seasonEnd: '2027-04-01',
      areaM2: 1200,
      parkingM2: 850,
      walkwayM: 180,
      triggerCm: 3,
      responseHours: 6,
      gritting: true,
      snowHauling: false,
    });
    const procurementId = (
      await client.query<{ id: string }>(
        "INSERT INTO procurements(organization_id,created_by,title,description,radius_m,join_deadline_at,spec,location_latitude,location_longitude,status) VALUES($1,$2,$3,$4,500,$5,$6,59.4050,24.6900,'OPEN') RETURNING id",
        [
          buyers[0].organizationId,
          buyers[0].userId,
          'Sõpruse puiestee lumevaba talv',
          'Ühendame Mustamäe majade talihoolduse. Ühine tellimus aitab hoida hoovid ja kõnniteed turvalisena kogu hooaja.',
          deadline,
          spec,
        ],
      )
    ).rows[0].id;
    const offerId = (
      await client.query<{ id: string }>(
        'INSERT INTO offers(procurement_id,organization_id,base_price_cents,deposit_cents,terms,valid_until,tiers) VALUES($1,$2,48000,7500,$3,$4,$5) RETURNING id',
        [
          procurementId,
          supplier,
          'Hind sisaldab käibemaksu, lume lükkamist ja libedustõrjet kokkulepitud aladel. Ülejäänud hooajatasu arveldatakse otse teenusepakkujaga. Tegemist on fiktiivse demo pakkumisega.',
          deadline,
          JSON.stringify([
            { minParticipants: 3, priceCents: 42000 },
            { minParticipants: 5, priceCents: 36000 },
            { minParticipants: 8, priceCents: 31000 },
          ]),
        ],
      )
    ).rows[0].id;
    await client.query('UPDATE procurements SET selected_offer_id=$2 WHERE id=$1', [
      procurementId,
      offerId,
    ]);
    await client.query('INSERT INTO jobs(procurement_id,due_at) VALUES($1,$2)', [
      procurementId,
      deadline,
    ]);
    await client.query(
      "INSERT INTO invitations(procurement_id,organization_id,distance_m,source) SELECT $1,o.id,ST_Distance(o.location,p.location),CASE WHEN o.org_type='SUPPLIER' THEN 'SUPPLIER' ELSE 'RADIUS' END FROM organizations o JOIN procurements p ON p.id=$1 WHERE o.id<>p.organization_id AND (o.org_type='SUPPLIER' OR ST_DWithin(o.location,p.location,p.radius_m))",
      [procurementId],
    );
  });
  await transaction((client) => backfillInvitationMessages(client));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bootstrap({ seed: process.env.SEED_DEMO !== 'false' });
  await pool.end();
  console.log('Database migrations and demo initialization completed.');
}
