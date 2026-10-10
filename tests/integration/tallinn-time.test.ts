import { describe, expect, it } from 'vitest';
import { localDateTime, utcDateTime } from '../../src/client/api.js';

describe('Europe/Tallinn business time', () => {
  it.each([
    ['2026-10-10T12:30', '2026-10-10T09:30:00.000Z'],
    ['2026-01-10T12:30', '2026-01-10T10:30:00.000Z'],
    ['2026-10-10T00:00', '2026-10-09T21:00:00.000Z'],
  ])('converts %s to UTC independently of the host timezone', (local, utc) => {
    expect(utcDateTime(local)).toBe(utc);
    expect(localDateTime(new Date(utc))).toBe(local);
  });

  it('rejects a nonexistent local time when spring daylight saving starts', () => {
    expect(() => utcDateTime('2026-03-29T03:30')).toThrow();
    expect(utcDateTime('2026-03-29T02:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(utcDateTime('2026-03-29T04:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('chooses the earlier instant for the repeated autumn local time and round trips both instants', () => {
    expect(utcDateTime('2026-10-25T03:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(localDateTime(new Date('2026-10-25T00:30:00.000Z'))).toBe('2026-10-25T03:30');
    expect(localDateTime(new Date('2026-10-25T01:30:00.000Z'))).toBe('2026-10-25T03:30');
  });

  it('rejects malformed and impossible calendar values', () => {
    expect(() => utcDateTime('invalid')).toThrow();
    expect(() => utcDateTime('2026-02-30T12:30')).toThrow();
  });
});
