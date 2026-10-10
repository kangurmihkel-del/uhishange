import type { ProcurementSpec, ServiceAnswer, ServiceAnswers, ServiceFormId } from './types.js';

export interface ServiceOption {
  value: string;
  label: string;
}
export interface ServiceField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'number' | 'checkbox' | 'multiselect';
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  options?: ServiceOption[];
  defaultValue?: ServiceAnswer;
  showWhen?: { field: string; equals: ServiceAnswer };
}
export interface ServiceForm {
  id: ServiceFormId;
  version: 1;
  label: string;
  dateOrder?: [string, string];
  fields: ServiceField[];
}
export interface ServiceAnswerIssue {
  fieldId: string;
  message: string;
}
export interface ServiceFact {
  label: string;
  value: string;
}

// Retain these version 1 definitions for existing frozen agreement snapshots.
// The fields, choices, limits and conditional rules come from Uhishange_vorm.html.
export const SERVICE_FORMS: ServiceForm[] = [
  {
    id: 'snow',
    version: 1,
    label: 'Lumekoristus',
    dateOrder: ['seasonStart', 'seasonEnd'],
    fields: [
      {
        id: 'seasonStart',
        label: 'Hooaja algus',
        type: 'date',
        required: true,
      },
      {
        id: 'seasonEnd',
        label: 'Hooaja lõpp',
        type: 'date',
        required: true,
      },
      {
        id: 'areaM2',
        label: 'Koristusala (m²)',
        type: 'number',
        unit: 'm²',
        required: true,
        min: 1,
        max: 1000000,
        step: 1,
        defaultValue: 600,
      },
      {
        id: 'parkingM2',
        label: 'Parkimisala (m²)',
        type: 'number',
        unit: 'm²',
        required: true,
        min: 0,
        max: 1000000,
        step: 1,
        defaultValue: 200,
      },
      {
        id: 'walkwayM',
        label: 'Kõnnitee (m)',
        type: 'number',
        unit: 'm',
        required: true,
        min: 0,
        max: 100000,
        step: 1,
        defaultValue: 80,
      },
      {
        id: 'triggerCm',
        label: 'Lumekihi paksus (cm)',
        type: 'number',
        unit: 'cm',
        required: true,
        min: 0.1,
        max: 100,
        step: 0.1,
        defaultValue: 3,
      },
      {
        id: 'responseHours',
        label: 'Reageerimisaeg (h)',
        type: 'number',
        unit: 'h',
        required: true,
        min: 0.1,
        max: 168,
        step: 0.1,
        defaultValue: 4,
      },
      {
        id: 'gritting',
        label: 'Libedusetõrje',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        id: 'snowHauling',
        label: 'Lume äravedu',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'snowStorage',
        label: 'Lume kogumise ja äraveo tingimused',
        type: 'textarea',
        required: true,
        max: 2000,
        showWhen: {
          field: 'snowHauling',
          equals: true,
        },
      },
      {
        id: 'location',
        label: 'Tööde asukoht',
        type: 'text',
        required: true,
        max: 500,
      },
      {
        id: 'access',
        label: 'Ligipääs ja eritingimused',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'desiredDate',
        label: 'Soovitud tööde kuupäev',
        type: 'date',
        hint: 'Jäta tühjaks, kui aeg lepitakse kokku.',
      },
      {
        id: 'pricing',
        label: 'Soovitud hinnapakkumise vorm',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Fikseeritud koguhind',
            label: 'Fikseeritud koguhind',
          },
          {
            value: 'Ühikuhind koos koguhinnaga',
            label: 'Ühikuhind koos koguhinnaga',
          },
        ],
        defaultValue: 'Fikseeritud koguhind',
        hint: 'Pakkuja esitab alati ka kogu kirjeldatud töö brutohinna ühe ühistu kohta.',
      },
    ],
  },
  {
    id: 'pest',
    version: 1,
    label: 'Kahjuritõrje',
    fields: [
      {
        id: 'pests',
        label: 'Kahjurid',
        type: 'multiselect',
        required: true,
        options: [
          {
            value: 'Rotid',
            label: 'Rotid',
          },
          {
            value: 'Hiired',
            label: 'Hiired',
          },
          {
            value: 'Prussakad',
            label: 'Prussakad',
          },
          {
            value: 'Sipelgad',
            label: 'Sipelgad',
          },
          {
            value: 'Lutikad',
            label: 'Lutikad',
          },
          {
            value: 'Muu või teadmata',
            label: 'Muu või teadmata',
          },
        ],
      },
      {
        id: 'extent',
        label: 'Probleemi ulatus ja mõjutatud ruumid',
        type: 'textarea',
        required: true,
        max: 4000,
      },
      {
        id: 'apartments',
        label: 'Korterite arv',
        type: 'number',
        required: true,
        min: 1,
        max: 10000,
        step: 1,
      },
      {
        id: 'treatment',
        label: 'Teenuse iseloom',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Ühekordne tõrje',
            label: 'Ühekordne tõrje',
          },
          {
            value: 'Regulaarne hooldus',
            label: 'Regulaarne hooldus',
          },
        ],
      },
      {
        id: 'frequency',
        label: 'Hoolduse sagedus',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Kord kuus',
            label: 'Kord kuus',
          },
          {
            value: 'Kord kvartalis',
            label: 'Kord kvartalis',
          },
          {
            value: 'Kokkuleppel',
            label: 'Kokkuleppel',
          },
        ],
        showWhen: {
          field: 'treatment',
          equals: 'Regulaarne hooldus',
        },
      },
      {
        id: 'safety',
        label: 'Ohutus ja tõrjevahendite piirangud',
        type: 'textarea',
        required: true,
        max: 2000,
        hint: 'Kirjelda laste, lemmikloomade ja ruumide kasutamisega seotud tingimusi.',
      },
      {
        id: 'repeat',
        label: 'Korduskülastuste ja tulemuse kontrolli ootus',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'location',
        label: 'Tööde asukoht',
        type: 'text',
        required: true,
        max: 500,
      },
      {
        id: 'access',
        label: 'Ligipääs ja eritingimused',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'desiredDate',
        label: 'Soovitud tööde kuupäev',
        type: 'date',
        hint: 'Jäta tühjaks, kui aeg lepitakse kokku.',
      },
      {
        id: 'pricing',
        label: 'Soovitud hinnapakkumise vorm',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Fikseeritud koguhind',
            label: 'Fikseeritud koguhind',
          },
          {
            value: 'Ühikuhind koos koguhinnaga',
            label: 'Ühikuhind koos koguhinnaga',
          },
        ],
        defaultValue: 'Fikseeritud koguhind',
        hint: 'Pakkuja esitab alati ka kogu kirjeldatud töö brutohinna ühe ühistu kohta.',
      },
    ],
  },
  {
    id: 'energy',
    version: 1,
    label: 'Energiamärgis',
    fields: [
      {
        id: 'building',
        label: 'Hoone liik',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Olemasolev hoone',
            label: 'Olemasolev hoone',
          },
          {
            value: 'Uus hoone',
            label: 'Uus hoone',
          },
        ],
      },
      {
        id: 'heatedArea',
        label: 'Köetav pind (m²)',
        type: 'number',
        unit: 'm²',
        required: true,
        min: 1,
        max: 1000000,
        step: 0.1,
      },
      {
        id: 'consumption',
        label: 'Energiatarbimise andmed',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Olemas',
            label: 'Olemas',
          },
          {
            value: 'Osaliselt olemas',
            label: 'Osaliselt olemas',
          },
          {
            value: 'Puuduvad',
            label: 'Puuduvad',
          },
        ],
      },
      {
        id: 'recommendations',
        label: 'Soovin ka energiatõhususe soovitusi',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'location',
        label: 'Tööde asukoht',
        type: 'text',
        required: true,
        max: 500,
      },
      {
        id: 'access',
        label: 'Ligipääs ja eritingimused',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'desiredDate',
        label: 'Soovitud tööde kuupäev',
        type: 'date',
        hint: 'Jäta tühjaks, kui aeg lepitakse kokku.',
      },
      {
        id: 'pricing',
        label: 'Soovitud hinnapakkumise vorm',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Fikseeritud koguhind',
            label: 'Fikseeritud koguhind',
          },
          {
            value: 'Ühikuhind koos koguhinnaga',
            label: 'Ühikuhind koos koguhinnaga',
          },
        ],
        defaultValue: 'Fikseeritud koguhind',
        hint: 'Pakkuja esitab alati ka kogu kirjeldatud töö brutohinna ühe ühistu kohta.',
      },
    ],
  },
  {
    id: 'branches',
    version: 1,
    label: 'Okste koristamine',
    fields: [
      {
        id: 'volume',
        label: 'Okste hinnanguline maht (m³)',
        type: 'number',
        unit: 'm³',
        required: true,
        min: 0.1,
        max: 10000,
        step: 0.1,
      },
      {
        id: 'collected',
        label: 'Oksad on kokku kogutud',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'cutting',
        label: 'Vajalik on ka lõikamine',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'cuttingScope',
        label: 'Lõikamistööde kirjeldus',
        type: 'textarea',
        required: true,
        max: 2000,
        showWhen: {
          field: 'cutting',
          equals: true,
        },
      },
      {
        id: 'disposal',
        label: 'Äravedu ja jäätmekäitlus peavad sisalduma hinnas',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        id: 'location',
        label: 'Tööde asukoht',
        type: 'text',
        required: true,
        max: 500,
      },
      {
        id: 'access',
        label: 'Ligipääs ja eritingimused',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'desiredDate',
        label: 'Soovitud tööde kuupäev',
        type: 'date',
        hint: 'Jäta tühjaks, kui aeg lepitakse kokku.',
      },
      {
        id: 'pricing',
        label: 'Soovitud hinnapakkumise vorm',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Fikseeritud koguhind',
            label: 'Fikseeritud koguhind',
          },
          {
            value: 'Ühikuhind koos koguhinnaga',
            label: 'Ühikuhind koos koguhinnaga',
          },
        ],
        defaultValue: 'Fikseeritud koguhind',
        hint: 'Pakkuja esitab alati ka kogu kirjeldatud töö brutohinna ühe ühistu kohta.',
      },
    ],
  },
  {
    id: 'other',
    version: 1,
    label: 'Muu teenus – vabas vormis',
    fields: [
      {
        id: 'serviceName',
        label: 'Teenuse või töö nimetus',
        type: 'text',
        required: true,
        max: 160,
      },
      {
        id: 'workDescription',
        label: 'Tööde kirjeldus',
        type: 'textarea',
        required: true,
        max: 10000,
      },
      {
        id: 'quantity',
        label: 'Töö maht või kogus',
        type: 'text',
        max: 500,
        hint: 'Näiteks 150 m², 5 puud või 1 korterelamu.',
      },
      {
        id: 'siteVisit',
        label: 'Pakkuja peab objektiga kohapeal tutvuma',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'location',
        label: 'Tööde asukoht',
        type: 'text',
        required: true,
        max: 500,
      },
      {
        id: 'access',
        label: 'Ligipääs ja eritingimused',
        type: 'textarea',
        max: 2000,
      },
      {
        id: 'desiredDate',
        label: 'Soovitud tööde kuupäev',
        type: 'date',
        hint: 'Jäta tühjaks, kui aeg lepitakse kokku.',
      },
      {
        id: 'pricing',
        label: 'Soovitud hinnapakkumise vorm',
        type: 'select',
        required: true,
        options: [
          {
            value: 'Fikseeritud koguhind',
            label: 'Fikseeritud koguhind',
          },
          {
            value: 'Ühikuhind koos koguhinnaga',
            label: 'Ühikuhind koos koguhinnaga',
          },
        ],
        defaultValue: 'Fikseeritud koguhind',
        hint: 'Pakkuja esitab alati ka kogu kirjeldatud töö brutohinna ühe ühistu kohta.',
      },
    ],
  },
];

export function findServiceForm(id: string, version = 1): ServiceForm | undefined {
  return SERVICE_FORMS.find((form) => form.id === id && form.version === version);
}
function resolveForm(form: ServiceForm | ServiceFormId): ServiceForm {
  if (typeof form !== 'string') return form;
  const found = findServiceForm(form);
  if (!found) throw new Error('Tundmatu hanketeenus.');
  return found;
}
export function visibleServiceFields(
  form: ServiceForm | ServiceFormId,
  answers: ServiceAnswers,
): ServiceField[] {
  return resolveForm(form).fields.filter(
    (field) => !field.showWhen || answers[field.showWhen.field] === field.showWhen.equals,
  );
}
export function defaultServiceAnswers(
  form: ServiceForm | ServiceFormId,
  location = '',
  year = new Date().getUTCFullYear(),
): ServiceAnswers {
  const definition = resolveForm(form);
  const answers: ServiceAnswers = { location };
  for (const field of definition.fields) {
    if (field.defaultValue !== undefined)
      answers[field.id] = Array.isArray(field.defaultValue)
        ? [...field.defaultValue]
        : field.defaultValue;
  }
  if (definition.id === 'snow') {
    answers.seasonStart = String(year) + '-11-01';
    answers.seasonEnd = String(year + 1) + '-04-01';
  }
  return answers;
}
export function sanitizeServiceAnswers(
  form: ServiceForm | ServiceFormId,
  answers: ServiceAnswers,
): ServiceAnswers {
  return Object.fromEntries(
    visibleServiceFields(form, answers)
      .filter((field) => answers[field.id] !== undefined && answers[field.id] !== '')
      .map((field) => {
        const value = answers[field.id];
        return [field.id, Array.isArray(value) ? [...value] : value];
      }),
  );
}
function validCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateServiceAnswers(
  form: ServiceForm | ServiceFormId,
  answers: ServiceAnswers,
): ServiceAnswerIssue[] {
  const definition = resolveForm(form);
  const fields = visibleServiceFields(definition, answers);
  const allowed = new Set(fields.map((field) => field.id));
  const issues: ServiceAnswerIssue[] = [];
  for (const fieldId of Object.keys(answers)) {
    if (!allowed.has(fieldId))
      issues.push({ fieldId, message: 'Väli ei kuulu sellesse vormi või ei ole praegu nähtav.' });
  }
  for (const field of fields) {
    const value = answers[field.id];
    const empty =
      value === undefined ||
      value === '' ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (empty && field.required) {
      issues.push({ fieldId: field.id, message: field.label + ': täida kohustuslik väli.' });
      continue;
    }
    if (
      value === undefined ||
      (empty &&
        typeof value === 'string' &&
        ['text', 'textarea', 'date', 'select'].includes(field.type)) ||
      (Array.isArray(value) && value.length === 0 && field.type === 'multiselect')
    )
      continue;
    let valid: boolean;
    switch (field.type) {
      case 'number':
        valid =
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= (field.min ?? -Infinity) &&
          value <= (field.max ?? Infinity) &&
          (field.step !== 1 || Number.isInteger(value));
        break;
      case 'checkbox':
        valid = typeof value === 'boolean';
        break;
      case 'multiselect':
        valid =
          Array.isArray(value) &&
          new Set(value).size === value.length &&
          value.every((item) => field.options?.some((option) => option.value === item));
        break;
      case 'select':
        valid =
          typeof value === 'string' && !!field.options?.some((option) => option.value === value);
        break;
      case 'date':
        valid = typeof value === 'string' && validCalendarDate(value);
        break;
      default:
        valid = typeof value === 'string' && value.trim().length <= (field.max ?? 2000);
    }
    if (!valid)
      issues.push({
        fieldId: field.id,
        message:
          field.label +
          ': kontrolli väärtust' +
          (field.type === 'number'
            ? ' (lubatud ' +
              (field.min === undefined ? 'piiranguta' : numberFormat.format(field.min)) +
              '–' +
              (field.max === undefined ? 'piiranguta' : numberFormat.format(field.max)) +
              (field.step === 1 ? ', täisarv' : '') +
              ')'
            : '') +
          '.',
      });
  }
  if (definition.dateOrder) {
    const [start, end] = definition.dateOrder;
    if (
      typeof answers[start] === 'string' &&
      typeof answers[end] === 'string' &&
      answers[end] <= answers[start]
    )
      issues.push({ fieldId: end, message: 'Lõpp peab olema pärast algust.' });
  }
  return issues;
}
export function isSnowService(spec: ProcurementSpec): boolean {
  return !('formId' in spec) || spec.formId === 'snow';
}
export function serviceLabel(spec: ProcurementSpec): string {
  return 'formId' in spec
    ? (findServiceForm(spec.formId, spec.version)?.label ?? 'Tundmatu hanketeenus')
    : 'Lumekoristus';
}
const numberFormat = new Intl.NumberFormat('et-EE', {
  useGrouping: 'always',
  maximumFractionDigits: 20,
});
const dateFormat = new Intl.DateTimeFormat('et-EE', {
  timeZone: 'Europe/Tallinn',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
function dateLabel(value: string): string {
  return validCalendarDate(value) ? dateFormat.format(new Date(value + 'T12:00:00Z')) : value;
}
export function serviceSpecFacts(spec: ProcurementSpec): ServiceFact[] {
  if (!('formId' in spec)) {
    return [
      { label: 'Hooaeg', value: dateLabel(spec.seasonStart) + ' – ' + dateLabel(spec.seasonEnd) },
      { label: 'Koristusala', value: numberFormat.format(spec.areaM2) + ' m²' },
      { label: 'Parkimisala', value: numberFormat.format(spec.parkingM2) + ' m²' },
      { label: 'Kõnnitee', value: numberFormat.format(spec.walkwayM) + ' m' },
      { label: 'Koristuse algus', value: numberFormat.format(spec.triggerCm) + ' cm' },
      { label: 'Reageerimisaeg', value: numberFormat.format(spec.responseHours) + ' h' },
      { label: 'Libedusetõrje', value: spec.gritting ? 'Sisaldub' : 'Ei sisaldu' },
      { label: 'Lume äravedu', value: spec.snowHauling ? 'Sisaldub' : 'Ei sisaldu' },
    ];
  }
  const form = findServiceForm(spec.formId, spec.version);
  if (!form) return [{ label: 'Teenuse ulatus', value: 'Vormi versioon ei ole toetatud.' }];
  return [
    { label: 'Teenus', value: form.label },
    ...visibleServiceFields(form, spec.answers)
      .filter((field) => spec.answers[field.id] !== undefined && spec.answers[field.id] !== '')
      .map((field) => {
        const value = spec.answers[field.id];
        const optionLabel = (item: string) =>
          field.options?.find((option) => option.value === item)?.label ?? item;
        return {
          label: field.label,
          value: Array.isArray(value)
            ? value.map(optionLabel).join(', ')
            : typeof value === 'boolean'
              ? value
                ? 'Jah'
                : 'Ei'
              : typeof value === 'number'
                ? numberFormat.format(value) + (field.unit ? ' ' + field.unit : '')
                : field.type === 'date'
                  ? dateLabel(value)
                  : optionLabel(value),
        };
      }),
  ];
}
