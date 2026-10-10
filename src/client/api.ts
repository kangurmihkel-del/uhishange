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
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);

export const date = (value: string | null | undefined, includeTime = false) =>
  value
    ? new Intl.DateTimeFormat('et-EE', {
        timeZone: 'Europe/Tallinn',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
    : '—';

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
