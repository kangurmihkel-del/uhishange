import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import type { ImportPreview, ImportRow } from '../shared/types.js';
import { DEFAULT_RADIUS_M } from '../shared/constants.js';
import { findServiceForm, validateServiceAnswers } from '../shared/serviceForms.js';
import { calculatePlatformFee, CURRENT_FEE_POLICY } from '../shared/pricing.js';

const integer = z.number().int().nonnegative().max(100000000);
const coordinate = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
const text = z.string().trim().min(1).max(500);
const email = z.string().trim().toLowerCase().email().max(254);
export const uuidSchema = z.string().uuid();
export const registerSchema = z
  .object({ name: text.max(120), email, password: z.string().min(10).max(200) })
  .strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export const organizationSchema = z
  .object({
    registryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,30}$/),
    name: text,
    orgType: z.enum(['BUYER', 'SUPPLIER']),
    address: text,
    ...coordinate,
    email: email.optional().or(z.literal('')),
  })
  .strict();
export const organizationUpdateSchema = organizationSchema.omit({
  registryCode: true,
  orgType: true,
});
export const membershipSchema = z
  .object({ role: z.enum(['representative', 'viewer']).default('representative') })
  .strict();
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    'Kuupäev ei ole kehtiv.',
  );
const legacySnowSpecSchema = z
  .object({
    seasonStart: calendarDate,
    seasonEnd: calendarDate,
    areaM2: integer,
    parkingM2: integer,
    walkwayM: integer,
    triggerCm: z.number().min(0.1).max(100),
    responseHours: z.number().min(0.1).max(168),
    gritting: z.boolean(),
    snowHauling: z.boolean(),
  })
  .strict()
  .refine((spec) => spec.seasonEnd > spec.seasonStart, 'Hooaja lõpp peab olema pärast algust.');
export const serviceSpecSchema = z
  .object({
    formId: z.enum(['snow', 'pest', 'energy', 'branches', 'other']),
    version: z.literal(1),
    answers: z.record(
      z.string().max(80),
      z.union([
        z.string().max(10000),
        z.number().finite(),
        z.boolean(),
        z.array(z.string().max(200)).max(30),
      ]),
    ),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const form = findServiceForm(spec.formId, spec.version);
    if (!form) {
      ctx.addIssue({
        code: 'custom',
        path: ['formId'],
        message: 'Tundmatu vorm või vormi versioon.',
      });
      return;
    }
    for (const issue of validateServiceAnswers(form, spec.answers)) {
      ctx.addIssue({ code: 'custom', path: ['answers', issue.fieldId], message: issue.message });
    }
  });
export const specSchema = z.union([legacySnowSpecSchema, serviceSpecSchema]);
export const procurementSchema = z
  .object({
    organizationId: uuidSchema,
    title: text.max(160),
    description: z.string().trim().max(10000).default(''),
    radiusM: z.number().int().min(50).max(10000).default(DEFAULT_RADIUS_M),
    joinDeadlineAt: z.iso.datetime({ offset: true }),
    spec: specSchema,
  })
  .strict();
export const offerSchema = z
  .object({
    organizationId: uuidSchema,
    basePriceCents: integer.positive(),
    depositCents: integer.positive(),
    terms: z.string().trim().min(1).max(10000),
    validUntil: z.iso.datetime({ offset: true }),
    tiers: z
      .array(
        z
          .object({
            minParticipants: z.number().int().min(1).max(10000),
            priceCents: integer.positive(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((offer, ctx) => {
    // Zod can collect range/array-size issues and still run this refinement.
    // Leave malformed tier prices to their field validators before fee arithmetic.
    if (
      !offer.tiers.length ||
      offer.tiers.some((tier) => !Number.isSafeInteger(tier.priceCents) || tier.priceCents <= 0)
    )
      return;
    if (offer.tiers[0].priceCents > offer.basePriceCents)
      ctx.addIssue({ code: 'custom', message: 'Esimese taseme hind ei tohi ületada baashinda.' });
    for (let i = 1; i < offer.tiers.length; i++)
      if (
        offer.tiers[i].minParticipants <= offer.tiers[i - 1].minParticipants ||
        offer.tiers[i].priceCents > offer.tiers[i - 1].priceCents
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Osalejate lävendid peavad suurenema ja hinnad ei tohi tõusta.',
        });
    if (offer.depositCents > offer.tiers.at(-1)!.priceCents)
      ctx.addIssue({ code: 'custom', message: 'Tagatisraha ei tohi ületada soodsaimat hinda.' });
    const maximumFee = calculatePlatformFee(offer.tiers[0].priceCents, CURRENT_FEE_POLICY);
    if (offer.depositCents < maximumFee)
      ctx.addIssue({
        code: 'custom',
        path: ['depositCents'],
        message: `Tagatisraha peab katma esimese hinnataseme portaali teenustasu (${new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(maximumFee / 100)}).`,
      });
  });
export const selectOfferSchema = z.object({ offerId: uuidSchema }).strict();
export const commitmentSchema = z
  .object({
    organizationId: uuidSchema,
    authorityConfirmed: z.literal(true),
    scopeConfirmed: z.literal(true),
  })
  .strict();
export const paymentSchema = z
  .object({
    outcome: z.enum(['captured', 'failed']),
    eventId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const invitationSchema = z
  .object({ organizationIds: z.array(uuidSchema).max(1000).optional() })
  .strict();
export const invitationResponseSchema = z
  .object({ status: z.enum(['ACCEPTED', 'DECLINED']) })
  .strict();
export const approvalSchema = z.object({ status: z.enum(['approved', 'rejected']) }).strict();
export const completionSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).default(''),
  })
  .strict();
export const cancellationSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
export const importSchema = z.object({ csv: z.string().min(1).max(1000000) }).strict();
const importFieldCorrections: Record<string, string> = {
  registryCode: 'Registrikood: kasuta 4–30 ladina tähte, numbrit või sidekriipsu.',
  name: 'Nimi: sisesta organisatsiooni nimi (1–500 tähemärki).',
  orgType: 'Organisatsiooni tüüp: kasuta BUYER (korteriühistu) või SUPPLIER (pakkuja).',
  address: 'Aadress: sisesta organisatsiooni aadress (1–500 tähemärki).',
  latitude: 'Laiuskraad: sisesta arv vahemikus −90 kuni 90; kümnendkohad eralda punktiga.',
  longitude: 'Pikkuskraad: sisesta arv vahemikus −180 kuni 180; kümnendkohad eralda punktiga.',
  email: 'E-post: sisesta kehtiv e-posti aadress (kuni 254 tähemärki) või jäta väli tühjaks.',
};

export function previewImport(csv: string): ImportPreview {
  const rows: ImportRow[] = [];
  const errors: ImportPreview['errors'] = [];
  const seen = new Set<string>();
  try {
    const records: Record<string, string>[] = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: false,
    });
    if (!records.length) errors.push({ row: 1, message: 'CSV ei sisalda andmeridu.' });
    if (records.length > 5000)
      return { rows: [], errors: [{ row: 1, message: 'Korraga saab importida kuni 5000 rida.' }] };
    for (const [index, record] of records.entries()) {
      const orgType = record.orgType ?? record.org_type;
      const result = organizationSchema.safeParse({
        registryCode: record.registryCode ?? record.registry_code,
        name: record.name,
        orgType:
          orgType === 'housing_association' || orgType === 'buyer'
            ? 'BUYER'
            : orgType === 'supplier'
              ? 'SUPPLIER'
              : orgType,
        address: record.address,
        latitude: record.latitude?.trim() ? Number(record.latitude) : NaN,
        longitude: record.longitude?.trim() ? Number(record.longitude) : NaN,
        ...(record.email ? { email: record.email } : {}),
      });
      if (!result.success) {
        errors.push({
          row: index + 2,
          message: result.error.issues
            .map(
              (issue) =>
                importFieldCorrections[String(issue.path[0])] ??
                'Rida: kontrolli, et kõik nõutud väljad vastaksid CSV mallile.',
            )
            .join(' '),
        });
        continue;
      }
      if (seen.has(result.data.registryCode)) {
        errors.push({
          row: index + 2,
          message:
            'Registrikood: sama kood esineb failis korduvalt; jäta iga organisatsiooni kohta üks rida.',
        });
        continue;
      }
      seen.add(result.data.registryCode);
      rows.push(result.data);
    }
  } catch {
    errors.push({
      row: 1,
      message: 'CSV struktuur ei ole kehtiv. Kasuta komadega eraldatud päisega faili.',
    });
  }
  return { rows, errors };
}
