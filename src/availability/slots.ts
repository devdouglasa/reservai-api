import { DateTime } from 'luxon';
import type { WeeklySchedule } from '../database/schema.js';
import { fail } from '../common/errors.js';
export const TIME_ZONE = 'America/Sao_Paulo';
export function parseDay(date: string, now: DateTime = DateTime.now()) {
  const day = DateTime.fromISO(date, { zone: TIME_ZONE });
  const today = now.setZone(TIME_ZONE).startOf('day');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !day.isValid ||
    day < today ||
    day > today.plus({ days: 90 })
  )
    fail(
      400,
      'INVALID_DATE',
      'Escolha uma data entre hoje e os próximos 90 dias.',
    );
  return day;
}
export function generateSlots(
  date: string,
  duration: number,
  intervals: Pick<WeeklySchedule, 'weekday' | 'startTime' | 'endTime'>[],
) {
  const day = DateTime.fromISO(date, { zone: TIME_ZONE });
  const slots: { startsAt: string; endsAt: string }[] = [];
  for (const interval of intervals.filter(
    (item) => item.weekday === day.weekday % 7,
  )) {
    let start = DateTime.fromISO(`${date}T${interval.startTime}`, {
      zone: TIME_ZONE,
    });
    const end = DateTime.fromISO(`${date}T${interval.endTime}`, {
      zone: TIME_ZONE,
    });
    while (start.plus({ minutes: duration }) <= end) {
      slots.push({
        startsAt: start.toUTC().toISO()!,
        endsAt: start.plus({ minutes: duration }).toUTC().toISO()!,
      });
      start = start.plus({ minutes: duration });
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
export function validateSchedule(
  intervals: Pick<WeeklySchedule, 'weekday' | 'startTime' | 'endTime'>[],
) {
  const sorted = [...intervals].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    if (
      item.startTime >= item.endTime ||
      (previous?.weekday === item.weekday && previous.endTime > item.startTime)
    )
      fail(
        400,
        'INVALID_SCHEDULE',
        'Os intervalos devem terminar no mesmo dia e não podem se sobrepor.',
      );
  });
}
