import { DateTime } from 'luxon';
import {
  generateSlots,
  overlaps,
  parseDay,
  validateSchedule,
} from './slots.js';
describe('Availability rules', () => {
  it('uses São Paulo time and discards incomplete slots', () => {
    expect(
      generateSlots('2026-11-09', 60, [
        { weekday: 1, startTime: '08:00', endTime: '10:30' },
      ]),
    ).toEqual([
      {
        startsAt: '2026-11-09T11:00:00.000Z',
        endsAt: '2026-11-09T12:00:00.000Z',
      },
      {
        startsAt: '2026-11-09T12:00:00.000Z',
        endsAt: '2026-11-09T13:00:00.000Z',
      },
    ]);
  });
  it('allows adjacent intervals and rejects overlaps and overnight schedules', () => {
    expect(() =>
      validateSchedule([
        { weekday: 1, startTime: '08:00', endTime: '10:00' },
        { weekday: 1, startTime: '10:00', endTime: '12:00' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSchedule([
        { weekday: 1, startTime: '08:00', endTime: '10:00' },
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
      ]),
    ).toThrow();
    expect(() =>
      validateSchedule([{ weekday: 1, startTime: '22:00', endTime: '02:00' }]),
    ).toThrow();
  });
  it('enforces calendar dates and the ninety-day horizon', () => {
    const now = DateTime.fromISO('2026-11-06T12:00:00-03:00');
    expect(() => parseDay('2026-11-05', now)).toThrow();
    expect(() => parseDay('2026-11-31', now)).toThrow();
    expect(() =>
      parseDay(now.plus({ days: 90 }).toISODate()!, now),
    ).not.toThrow();
    expect(() => parseDay(now.plus({ days: 91 }).toISODate()!, now)).toThrow();
  });
  it('treats adjacent bookings as non-overlapping', () => {
    const a = {
      startsAt: new Date('2026-11-09T11:00Z'),
      endsAt: new Date('2026-11-09T12:00Z'),
    };
    expect(
      overlaps(a, {
        startsAt: a.endsAt,
        endsAt: new Date('2026-11-09T13:00Z'),
      }),
    ).toBe(false);
    expect(
      overlaps(a, {
        startsAt: new Date('2026-11-09T11:30Z'),
        endsAt: new Date('2026-11-09T13:00Z'),
      }),
    ).toBe(true);
  });
});
