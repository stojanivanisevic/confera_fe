// M3-FE-07 (NFR-I18N-04): goldens of the formats, in the conference's time zone, around midnight
// and on the two days the clock changes in Belgrade (2026: 29 March and 25 October).
import { describe, expect, it } from 'vitest';

import { dayInZone, formatAmount, formatBytes, formatDate, formatDateTime, formatNumber, zoneName } from '../packages/form-renderer/src/i18n/format';

const BELGRADE = 'Europe/Belgrade';

describe('dates', () => {
  it('are written as each language writes them', () => {
    expect(formatDate('2026-10-12T10:00:00Z', 'en', BELGRADE)).toBe('12 October 2026');
    expect(formatDate('2026-10-12T10:00:00Z', 'sr', BELGRADE)).toBe('12.10.2026.');
  });

  it('are the day in the conference’s zone: 22:30 UTC on 12 October is 13 October in Belgrade', () => {
    expect(formatDate('2026-10-12T22:30:00Z', 'en', BELGRADE)).toBe('13 October 2026');
    expect(formatDate('2026-10-12T22:30:00Z', 'sr', BELGRADE)).toBe('13.10.2026.');
    expect(formatDate('2026-10-12T22:30:00Z', 'en', 'UTC')).toBe('12 October 2026');
    expect(dayInZone('2026-10-12T22:30:00Z', BELGRADE)).toBe('2026-10-13');
    expect(dayInZone('2026-10-12T21:59:59Z', BELGRADE)).toBe('2026-10-12');
  });

  it('a calendar day stays that day in every zone', () => {
    expect(formatDate('2027-03-15', 'en', 'Pacific/Kiritimati')).toBe('15 March 2027');
    expect(formatDate('2027-03-15', 'sr', 'America/Los_Angeles')).toBe('15.03.2027.');
  });

  it('come back as they were when they cannot be read', () => {
    expect(formatDate('not a date', 'en', BELGRADE)).toBe('not a date');
    expect(formatDateTime('not a date', 'sr', BELGRADE)).toBe('not a date');
  });
});

describe('times', () => {
  it('are shown in the conference’s zone, with the language’s joining word', () => {
    expect(formatDateTime('2026-10-16T14:56:00Z', 'en', BELGRADE)).toBe('16 October 2026, 16:56');
    expect(formatDateTime('2026-10-16T14:56:00Z', 'sr', BELGRADE)).toBe('16.10.2026. u 16:56');
  });

  it('follow the clock change into summer time (29 March 2026, 02:00 → 03:00)', () => {
    expect(formatDateTime('2026-03-29T00:59:00Z', 'en', BELGRADE)).toBe('29 March 2026, 01:59');
    expect(formatDateTime('2026-03-29T01:00:00Z', 'en', BELGRADE)).toBe('29 March 2026, 03:00');
  });

  it('follow the clock change back (25 October 2026, 03:00 → 02:00): the hour comes twice', () => {
    expect(formatDateTime('2026-10-25T00:30:00Z', 'sr', BELGRADE)).toBe('25.10.2026. u 02:30');
    expect(formatDateTime('2026-10-25T01:30:00Z', 'sr', BELGRADE)).toBe('25.10.2026. u 02:30');
    // The end of the deadline day is midnight in Belgrade, an hour later in UTC than in summer.
    expect(dayInZone('2026-10-25T22:59:59Z', BELGRADE)).toBe('2026-10-25');
    expect(dayInZone('2026-10-25T23:00:00Z', BELGRADE)).toBe('2026-10-26');
    expect(dayInZone('2026-10-24T21:59:59Z', BELGRADE)).toBe('2026-10-24');
    expect(dayInZone('2026-10-24T22:00:00Z', BELGRADE)).toBe('2026-10-25');
  });
});

describe('numbers and amounts', () => {
  it('group and separate as each language does, the currency after the amount', () => {
    expect(formatAmount(25280, 'EUR', 'en')).toBe('25,280.00 EUR');
    expect(formatAmount(25280, 'EUR', 'sr')).toBe('25.280,00 EUR');
    expect(formatAmount(2528, 'RSD', 'sr')).toBe('2.528,00 RSD');
    expect(formatNumber(20.5, 'en')).toBe('20.5');
    expect(formatNumber(20.5, 'sr')).toBe('20,5');
  });

  it('sizes of files', () => {
    expect(formatBytes(20 * 1024 * 1024, 'en')).toBe('20 MB');
    expect(formatBytes(1.5 * 1024 * 1024, 'sr')).toBe('1,5 MB');
    expect(formatBytes(820 * 1024, 'en')).toBe('820 KB');
    expect(formatBytes(10, 'en')).toBe('1 KB');
  });
});

describe('zones', () => {
  it('are named in the language', () => {
    expect(zoneName(BELGRADE, 'en', Date.parse('2026-10-12T10:00:00Z'))).toBe('Central European Time');
    expect(zoneName(BELGRADE, 'sr', Date.parse('2026-10-12T10:00:00Z'))).toBe('Srednjeevropsko vreme');
    expect(zoneName('Not/AZone', 'en')).toBe('Not/AZone');
  });
});
