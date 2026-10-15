/** Dates and times as the office reads them (English only in 0.2.0; platform formatting, ADR-23). */
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isFinite(time) ? DATE_TIME.format(time) : iso;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isFinite(time) ? DATE.format(time) : iso;
}

/** True when `iso` is within the last `days` days. */
export function withinDays(iso: string | null | undefined, days: number, now: number = Date.now()): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && now - time >= 0 && now - time < days * 24 * 60 * 60 * 1000;
}
