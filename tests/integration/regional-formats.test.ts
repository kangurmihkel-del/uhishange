import { describe, expect, it } from 'vitest';
import {
  coordinate,
  date,
  euro,
  number,
  parseDateInput,
  parseDateTimeInput,
  parseDecimal,
  parseEuroCents,
  utcDateTime,
} from '../../src/client/api.js';
import { serviceSpecFacts } from '../../src/shared/serviceForms.js';

const spaces = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('Estonian regional formats', () => {
  it('formats money and quantities with commas without losing nonzero cents or fractional quantities', () => {
    for (const [cents, expected] of [
      [0, '0 €'],
      [13, '0,13 €'],
      [10_003, '100,03 €'],
      [123_456, '1 234,56 €'],
      [100_000, '1 000 €'],
    ] as const) {
      expect(spaces(euro(cents))).toBe(expected);
    }
    expect(euro(null)).toBe('—');
    expect(euro(undefined)).toBe('—');
    expect(spaces(number(3500.5))).toBe('3 500,5');
    expect(number(0.123456)).toBe('0,123456');
    expect(number(1.23456, 2)).toBe('1,23');
    expect(coordinate(59.405)).toBe('59,40500');
    expect(coordinate(59.405123)).toBe('59,405123');
  });

  it('parses valid Estonian and compatible decimal input, including grouped spaces and signed coordinates', () => {
    for (const [text, expected] of [
      ['3 500,5', 3500.5],
      ['3\u00a0500,5', 3500.5],
      ['3\u202f500,5', 3500.5],
      ['1 234 567,5', 1234567.5],
      ['3500.5', 3500.5],
      [' 59,405123 ', 59.405123],
      ['-24,690456', -24.690456],
      ['0', 0],
    ] as const) {
      expect(parseDecimal(text)).toBe(expected);
    }
  });

  it('rejects ambiguous, malformed and unsafe numeric text rather than partially parsing it', () => {
    for (const text of [
      '',
      ' ',
      '1,234.56',
      '1.234,56',
      '1,2,3',
      '1.2.3',
      '12 34,5',
      '1 23 456',
      '1  234',
      '1e3',
      '0x10',
      'Infinity',
      'NaN',
      '100 €',
      '9007199254740992',
    ]) {
      expect(() => parseDecimal(text), text).toThrow();
    }
  });

  it('converts money text to exact integer cents and rejects excess fractional cents', () => {
    for (const [text, cents] of [
      ['1 234,56', 123456],
      ['1\u00a0234,56', 123456],
      ['1\u202f234.56', 123456],
      ['100,03', 10003],
      ['-100,03', -10003],
      ['0,13', 13],
      ['0.29', 29],
      ['1,2', 120],
      ['1 000,00', 100000],
      ['1000000,00', 100000000],
    ] as const) {
      const parsed = parseEuroCents(text);
      expect(parsed).toBe(cents);
      expect(Number.isSafeInteger(parsed)).toBe(true);
    }
    for (const text of ['1,005', '0.001', '1,230', '1,234.56', '', '9007199254740992']) {
      expect(() => parseEuroCents(text), text).toThrow();
    }
  });

  it('preserves calendar dates in ISO data and displays the same Estonian date in every season', () => {
    for (const [entered, iso, displayed] of [
      ['01.01.2030', '2030-01-01', '01.01.2030'],
      ['15.06.2030', '2030-06-15', '15.06.2030'],
      ['29.02.2028', '2028-02-29', '29.02.2028'],
      ['2030-06-15', '2030-06-15', '15.06.2030'],
    ]) {
      expect(parseDateInput(entered)).toBe(iso);
      expect(date(iso)).toBe(displayed);
      expect(
        serviceSpecFacts({ formId: 'energy', version: 1, answers: { desiredDate: iso } }).find(
          (fact) => fact.label === 'Soovitud tööde kuupäev',
        )?.value,
      ).toBe(displayed);
    }
    expect(date(null)).toBe('—');
    for (const text of ['29.02.2027', '31.04.2030', '15/06/2030', '2030-02-30', '']) {
      expect(() => parseDateInput(text), text).toThrow();
    }
  });

  it('uses 24-hour Tallinn time across midnight and DST while accepting explicit Estonian datetime entry', () => {
    for (const [entered, local, utc, displayed] of [
      ['10.01.2026 12:30', '2026-01-10T12:30', '2026-01-10T10:30:00.000Z', '10.01.2026 12:30'],
      ['10.10.2026 00:00', '2026-10-10T00:00', '2026-10-09T21:00:00.000Z', '10.10.2026 00:00'],
      ['30.06.2030 12:30', '2030-06-30T12:30', '2030-06-30T09:30:00.000Z', '30.06.2030 12:30'],
      ['2026-10-10T12:30', '2026-10-10T12:30', '2026-10-10T09:30:00.000Z', '10.10.2026 12:30'],
      ['29.03.2026 02:30', '2026-03-29T02:30', '2026-03-29T00:30:00.000Z', '29.03.2026 02:30'],
      ['29.03.2026 04:30', '2026-03-29T04:30', '2026-03-29T01:30:00.000Z', '29.03.2026 04:30'],
      ['25.10.2026 03:30', '2026-10-25T03:30', '2026-10-25T00:30:00.000Z', '25.10.2026 03:30'],
    ]) {
      expect(parseDateTimeInput(entered)).toBe(local);
      expect(utcDateTime(parseDateTimeInput(entered))).toBe(utc);
      expect(date(utc, true)).toBe(displayed);
    }
    expect(date('2026-10-25T01:30:00.000Z', true)).toBe('25.10.2026 03:30');
    expect(() => utcDateTime(parseDateTimeInput('29.03.2026 03:30'))).toThrow();
    for (const text of [
      '31.04.2030 12:30',
      '15.06.2030 24:00',
      '15.06.2030 12:60',
      '',
      'invalid',
    ]) {
      expect(() => parseDateTimeInput(text), text).toThrow();
    }
  });
});
