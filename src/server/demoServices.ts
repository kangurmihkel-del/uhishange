import type { PoolClient } from 'pg';
import type { ServiceAnswers, ServiceFormId, ServiceSpec } from '../shared/types.js';
import { defaultServiceAnswers } from '../shared/serviceForms.js';
import { serviceSpecSchema } from './validation.js';

interface DemoServiceDefinition {
  id: string;
  offerId: string;
  formId: Exclude<ServiceFormId, 'snow'>;
  title: string;
  description: string;
  answers: ServiceAnswers;
  basePriceCents: number;
  depositCents: number;
  tierPrices: [number, number, number];
}
// Stable identities make upgrades insert-only without resetting existing demo activity.
export const DEMO_SERVICE_PROCUREMENTS: DemoServiceDefinition[] = [
  {
    id: 'd5010001-0000-4000-8000-000000000001',
    offerId: 'd5020001-0000-4000-8000-000000000001',
    formId: 'pest',
    title: 'Mustamäe ühistute kahjuritõrje (demo)',
    description:
      'Fiktiivne näidishange: tellime ühise keldrite ja jäätmeruumide kahjuritõrje ning kokkulepitud regulaarsed kontrollkülastused. Iga ühistu saab oma lepingu ja brutohinna.',
    answers: {
      pests: ['Rotid', 'Hiired'],
      extent:
        'Näriliste jäljed keldrites ja jäätmeruumis. Kontrollida kogu maja üldkasutatavaid ruume ning sulgeda tuvastatud sisenemiskohad.',
      apartments: 48,
      treatment: 'Regulaarne hooldus',
      frequency: 'Kord kvartalis',
      safety:
        'Lukustatud söödakastid; laste ja lemmikloomade juurdepääs peab olema välistatud. Elanikke teavitatakse enne tööde algust.',
      repeat: 'Tulemuse kontroll kaks nädalat pärast esimest tõrjet ning kirjalik külastusraport.',
      access:
        'Keldrivõtmed annab ühistu esindaja. Tööaeg lepitakse kokku vähemalt kolm päeva ette.',
    },
    basePriceCents: 38000,
    depositCents: 5000,
    tierPrices: [32000, 29000, 25000],
  },
  {
    id: 'd5010001-0000-4000-8000-000000000002',
    offerId: 'd5020001-0000-4000-8000-000000000002',
    formId: 'energy',
    title: 'Mustamäe korterelamute energiamärgis (demo)',
    description:
      'Fiktiivne näidishange: olemasolevate korterelamute energiamärgise koostamine koos energiatõhususe soovitustega. Iga maja andmed vaadatakse eraldi läbi.',
    answers: {
      building: 'Olemasolev hoone',
      heatedArea: 3200.5,
      consumption: 'Olemas',
      recommendations: true,
      access:
        'Kolme viimase aasta energiaarved ja hoone põhiandmed annab ühistu esindaja. Kokkuleppel võimaldame tehnoruumide ülevaatuse.',
    },
    basePriceCents: 65000,
    depositCents: 8000,
    tierPrices: [59000, 53000, 48000],
  },
  {
    id: 'd5010001-0000-4000-8000-000000000003',
    offerId: 'd5020001-0000-4000-8000-000000000003',
    formId: 'branches',
    title: 'Mustamäe hoovide okste koristamine (demo)',
    description:
      'Fiktiivne näidishange: koristame hoovidesse kogunenud oksad, teeme kirjeldatud lõikamistööd ning tellime nõuetekohase äraveo.',
    answers: {
      volume: 12.5,
      collected: true,
      cutting: true,
      cuttingScope:
        'Lõigata maapinnal olevad jämedamad oksad transpordiks sobivasse mõõtu. Eluspuude võra lõikamine ei kuulu tellimusse.',
      disposal: true,
      access:
        'Veok pääseb sisehoovi värava kaudu; värava avab ühistu esindaja. Kõnniteed peavad jääma läbitavaks.',
    },
    basePriceCents: 34000,
    depositCents: 4000,
    tierPrices: [28000, 25000, 22000],
  },
  {
    id: 'd5010001-0000-4000-8000-000000000004',
    offerId: 'd5020001-0000-4000-8000-000000000004',
    formId: 'other',
    title: 'Trepikodade aknapesu – ühine tellimus (demo)',
    description:
      'Fiktiivne vabas vormis näidishange: ühendame trepikodade akende kevadise pesu tellimused. Pakkuja täpsustab töömahu kohapealsel ülevaatusel.',
    answers: {
      serviceName: 'Trepikodade aknapesu',
      workDescription:
        'Pesta nelja trepikoja aknad mõlemalt poolt, puhastada raamid ja aknalauad. Hind peab sisaldama ohutuks tööks vajalikku varustust ning puhastusvahendeid.',
      quantity: '80 m² aknapinda, neli trepikoda',
      siteVisit: true,
      access:
        'Trepikodade uksed avab ühistu esindaja. Pesuaeg lepitakse kokku väljaspool hommikust tipptundi.',
    },
    basePriceCents: 30000,
    depositCents: 3000,
    tierPrices: [26000, 22000, 19000],
  },
];

export async function seedServiceProcurements(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('uhishange:service-demo:v1'))");
  const buyer = (
    await client.query<{
      id: string;
      user_id: string;
      address: string;
      latitude: number;
      longitude: number;
    }>(
      "SELECT o.id,u.id AS user_id,o.address,o.latitude,o.longitude FROM organizations o JOIN memberships m ON m.organization_id=o.id AND m.status='approved' AND m.role='representative' JOIN users u ON u.id=m.user_id WHERE o.registry_code='DEMO-1001' AND o.is_demo AND u.email='buyer1@demo.test'",
    )
  ).rows[0];
  const supplier = (
    await client.query<{ id: string }>(
      "SELECT id FROM organizations WHERE registry_code='DEMO-9001' AND is_demo AND org_type='SUPPLIER'",
    )
  ).rows[0];
  if (!buyer || !supplier) return;
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString();
  const desiredDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  for (const definition of DEMO_SERVICE_PROCUREMENTS) {
    const spec: ServiceSpec = {
      formId: definition.formId,
      version: 1,
      answers: {
        ...defaultServiceAnswers(definition.formId, buyer.address),
        ...definition.answers,
        desiredDate,
      },
    };
    serviceSpecSchema.parse(spec);
    const inserted = await client.query(
      "INSERT INTO procurements(id,organization_id,created_by,title,description,radius_m,join_deadline_at,spec,location_latitude,location_longitude,status) VALUES($1,$2,$3,$4,$5,500,$6,$7,$8,$9,'OPEN') ON CONFLICT(id) DO NOTHING RETURNING id",
      [
        definition.id,
        buyer.id,
        buyer.user_id,
        definition.title,
        definition.description,
        deadline,
        JSON.stringify(spec),
        buyer.latitude,
        buyer.longitude,
      ],
    );
    if (!inserted.rowCount) continue;
    await client.query(
      'INSERT INTO offers(id,procurement_id,organization_id,base_price_cents,deposit_cents,terms,valid_until,tiers) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        definition.offerId,
        definition.id,
        supplier.id,
        definition.basePriceCents,
        definition.depositCents,
        'Fiktiivne teenusepakkumine demo tutvustamiseks. Lumering OÜ (demo) illustreerib selles näites teenusepakkujat; tegelikku teenust ei tellita. Hind sisaldab käibemaksu ja kogu hanke kirjeldatud töömahtu ühe ühistu kohta. Tagatisraha on TEST ning ülejäänud teenusetasu arveldatakse väljaspool pilooti.',
        deadline,
        JSON.stringify(
          definition.tierPrices.map((priceCents, index) => ({
            minParticipants: [3, 5, 8][index],
            priceCents,
          })),
        ),
      ],
    );
    await client.query('INSERT INTO jobs(procurement_id,due_at) VALUES($1,$2)', [
      definition.id,
      deadline,
    ]);
    await client.query(
      "INSERT INTO invitations(procurement_id,organization_id,distance_m,source) SELECT $1,o.id,ST_Distance(o.location,p.location),CASE WHEN o.org_type='SUPPLIER' THEN 'SUPPLIER' ELSE 'RADIUS' END FROM organizations o JOIN procurements p ON p.id=$1 WHERE o.is_demo AND o.id<>p.organization_id AND (o.org_type='SUPPLIER' OR ST_DWithin(o.location,p.location,p.radius_m)) ON CONFLICT(procurement_id,organization_id) DO NOTHING",
      [definition.id],
    );
  }
}
