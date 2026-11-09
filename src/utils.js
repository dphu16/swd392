import { AppError } from './errors.js';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export function roundVnd(value) {
  return Math.round(Number(value) || 0);
}

export function parseDateRange(from, to, defaults) {
  const parseOne = (val, def) => {
    if (!val) return new Date(def);
    if (val instanceof Date) return val;
    return String(val).includes('T') ? new Date(val) : new Date(`${val}T00:00:00.000Z`);
  };
  const start = parseOne(from, defaults?.from);
  const end = parseOne(to, defaults?.to);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end) {
    throw new AppError(400, 'INVALID_DATE_RANGE', 'from must be earlier than to; to is exclusive.');
  }
  return { start, end };
}

export function overlapMs(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function eachUtcDay(start, end) {
  const days = [];
  for (let cursor = new Date(start); cursor < end; cursor = new Date(cursor.valueOf() + DAY)) {
    days.push(cursor);
  }
  return days;
}

export function atUtcMinutes(day, minutes) {
  return new Date(Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  ));
}

export function toMinutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function inRange(dateValue, start, end) {
  const value = new Date(dateValue);
  return value >= start && value < end;
}

export function sum(items, selector = (item) => item) {
  return items.reduce((total, item) => total + selector(item), 0);
}

export function percent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

export function csvList(value) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}
