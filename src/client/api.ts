const messages: Record<string, string> = {
  UNAUTHORIZED: 'Palun logi sisse.',
  FORBIDDEN: 'Sul puudub selle toimingu jaoks kinnitatud esindusõigus.',
  NOT_FOUND: 'Soovitud kirjet ei leitud.',
  VALIDATION_ERROR: 'Kontrolli sisestatud andmeid ja proovi uuesti.',
  CONFLICT: 'Toimingut ei saa praeguses olekus teha. Värskenda andmeid.',
  INVALID_CREDENTIALS: 'E-posti aadress või parool on vale.',
};

export async function api<T>(path: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers:
      body === undefined
        ? { Accept: 'application/json' }
        : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      messages[data?.error?.code] || data?.error?.message || 'Toiming ebaõnnestus. Proovi uuesti.',
    );
  }
  return data as T;
}

export const euro = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? '—'
    : new Intl.NumberFormat('et-EE', {
        style: 'currency',
        currency: 'EUR',
        useGrouping: 'always',
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);

export const number = (value: number, maximumFractionDigits = 20) =>
  new Intl.NumberFormat('et-EE', { useGrouping: 'always', maximumFractionDigits }).format(value);

export const coordinate = (value: number) =>
  new Intl.NumberFormat('et-EE', {
    useGrouping: false,
    minimumFractionDigits: 5,
    maximumFractionDigits: 6,
  }).format(value);

export const date = (value: string | null | undefined, includeTime = false) => {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('et-EE', {
    timeZone: 'Europe/Tallinn',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hourCycle: 'h23',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).formatToParts(new Date(value));
  const get = (name: string) => parts.find((part) => part.type === name)?.value;
  return `${get('day')}.${get('month')}.${get('year')}${includeTime ? ` ${get('hour')}:${get('minute')}` : ''}`;
};

/** Accept decimal comma/point and properly grouped space-separated thousands. */
function decimalParts(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length > 96 ||
    !/^[+-]?(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d+)?$/.test(trimmed)
  )
    throw new Error('Sisesta korrektne arv. Kümnendkohad eralda komaga, näiteks 1 234,56.');
  const normalized = trimmed.replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  const [integer, fraction = ''] = normalized.split('.');
  return { normalized, integer, fraction };
}

export function parseDecimal(value: string): number {
  const parsed = Number(decimalParts(value).normalized);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER)
    throw new Error('Sisestatud arv on liiga suur.');
  return parsed;
}

/** Convert the decimal string directly to cents; never round fractional cents. */
export function parseEuroCents(value: string): number {
  const { integer, fraction } = decimalParts(value);
  if (fraction.length > 2) throw new Error('Rahal saab olla kuni kaks kohta pärast koma.');
  const negative = integer.startsWith('-');
  const unsigned = integer.replace(/^[+-]/, '');
  const cents = (BigInt(unsigned) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(-Number.MAX_SAFE_INTEGER))
    throw new Error('Sisestatud rahasumma on liiga suur.');
  return Number(cents);
}

export function parseDateInput(value: string): string {
  const trimmed = value.trim();
  const regional = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  const iso = regional
    ? `${regional[3]}-${regional[2].padStart(2, '0')}-${regional[1].padStart(2, '0')}`
    : trimmed;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new Error('Sisesta korrektne kuupäev kujul pp.kk.aaaa.');
  return iso;
}

export function parseDateTimeInput(value: string): string {
  const trimmed = value.trim();
  const regional = /^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{2}):(\d{2})$/.exec(trimmed);
  const canonical = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(trimmed);
  const parts = regional ?? canonical;
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59)
    throw new Error('Sisesta kuupäev ja kellaaeg kujul pp.kk.aaaa hh:mm (24 tunni kell).');
  return `${parseDateInput(parts[1])}T${parts[2]}:${parts[3]}`;
}

export function formatDateInput(value: string): string {
  const [year, month, day] = parseDateInput(value).split('-');
  return `${day}.${month}.${year}`;
}

export function formatDateTimeInput(value: string): string {
  const [day, time] = parseDateTimeInput(value).split('T');
  return `${formatDateInput(day)} ${time}`;
}

export function localDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (name: string) => parts.find((part) => part.type === name)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function utcDateTime(value: string) {
  const guess = new Date(`${value}:00Z`);
  if (!Number.isFinite(guess.getTime())) throw new Error('Sisesta korrektne kuupäev ja kellaaeg.');
  const offsets = new Set(
    [-24, 0, 24].map((hours) => {
      const sample = new Date(guess.getTime() + hours * 3_600_000);
      return new Date(`${localDateTime(sample)}:00Z`).getTime() - sample.getTime();
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(guess.getTime() - offset))
    .filter((candidate) => localDateTime(candidate) === value)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length)
    throw new Error(
      'Seda kellaaega Tallinna aja järgi ei ole (suveajale üleminek). Vali teine kellaaeg.',
    );
  return candidates[0].toISOString();
}
