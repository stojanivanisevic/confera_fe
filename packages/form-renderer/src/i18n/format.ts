/**
 * Dates, times, numbers and amounts as each language writes them (NFR-I18N-04, ADR-23): the
 * platform's formatting with explicit options, always in the conference's time zone.
 *
 *   English  12 October 2026    12 October 2026, 16:56    25,280.00 EUR    20.5
 *   Serbian  12.10.2026.        12.10.2026. u 16:56       25.280,00 EUR    20,5
 *
 * A time is stored once, as an instant (UTC); it is shown in the conference's zone. 22:30 UTC on
 * 12 October is already 13 October in Belgrade, and the clock change moves that hour twice a year:
 * `tests/form-format.test.ts` holds both. The currency code goes after the amount. The frontend
 * only formats amounts; the server does the arithmetic.
 */
import type { FormLanguage } from './catalogue';

/** The locale of each language. Serbian is Latin script (NFR-I18N-02). */
export const LOCALES: Readonly<Record<FormLanguage, string>> = { en: 'en-GB', sr: 'sr-Latn-RS' };

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, make: () => T): T {
  let format = cache.get(key) as T | undefined;
  if (!format) {
    format = make();
    cache.set(key, format);
  }
  return format;
}

const dateFormat = (language: FormLanguage, timeZone: string) =>
  cached(`d|${language}|${timeZone}`, () =>
    new Intl.DateTimeFormat(LOCALES[language], language === 'sr' ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone } : { day: 'numeric', month: 'long', year: 'numeric', timeZone }),
  );
const timeFormat = (language: FormLanguage, timeZone: string) =>
  cached(`t|${language}|${timeZone}`, () => new Intl.DateTimeFormat(LOCALES[language], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }));

const toInstant = (value: string | number | Date): number => (value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value));

/** A day: an instant shown in the zone, or a calendar day (`2026-10-12`) as it is. Unreadable input comes back as it was. */
export function formatDate(value: string | number | Date, language: FormLanguage, timeZone: string): string {
  // A calendar day has no zone: 12 October is 12 October everywhere. Read it at noon UTC and show it in UTC.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateFormat(language, 'UTC').format(Date.parse(`${value}T12:00:00Z`));
  const instant = toInstant(value);
  return Number.isFinite(instant) ? dateFormat(language, timeZone).format(instant) : String(value);
}

/** A day and a time of day in the zone ("12 October 2026, 16:56"; "12.10.2026. u 16:56"). */
export function formatDateTime(value: string | number | Date, language: FormLanguage, timeZone: string): string {
  const instant = toInstant(value);
  if (!Number.isFinite(instant)) return String(value);
  const date = dateFormat(language, timeZone).format(instant);
  const time = timeFormat(language, timeZone).format(instant);
  return language === 'sr' ? `${date} u ${time}` : `${date}, ${time}`;
}

/** A plain number ("1,234.5"; "1.234,5"). */
export function formatNumber(value: number, language: FormLanguage, fractionDigits: { min?: number; max?: number } = {}): string {
  const min = fractionDigits.min ?? 0;
  const max = Math.max(min, fractionDigits.max ?? 2);
  return cached(`n|${language}|${min}|${max}`, () => new Intl.NumberFormat(LOCALES[language], { minimumFractionDigits: min, maximumFractionDigits: max })).format(value);
}

/** An amount with two decimals and the currency code after it ("25,280.00 EUR"; "25.280,00 EUR"). */
export function formatAmount(value: number, currency: string, language: FormLanguage): string {
  return `${formatNumber(value, language, { min: 2, max: 2 })} ${currency}`;
}

/** A size of a file as people read it: whole megabytes, kilobytes below one ("20 MB", "1,5 MB", "820 KB"). */
export function formatBytes(bytes: number, language: FormLanguage): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) return `${formatNumber(Math.round((bytes / MB) * 10) / 10, language, { max: 1 })} MB`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)), language, { max: 0 })} KB`;
}

/** The name of the zone in the language, generic ("Central European Time"; "centralnoevropsko vreme"). */
export function zoneName(timeZone: string, language: FormLanguage, at: number = Date.now()): string {
  try {
    const parts = cached(`z|${language}|${timeZone}`, () => new Intl.DateTimeFormat(LOCALES[language], { timeZone, timeZoneName: 'longGeneric' })).formatToParts(at);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * The calendar day an instant falls on in a zone (`2026-10-13`). The deadline of a form is such a
 * day: it ends at the end of that day in the conference's zone (FR-DL-01).
 */
export function dayInZone(value: string | number | Date, timeZone: string): string {
  const instant = toInstant(value);
  const parts = cached(`day|${timeZone}`, () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
