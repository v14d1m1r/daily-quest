import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateInZone, timeInZone, zonedISO, shiftDate } from '../src/dates.ts';

test('entry date uses account timezone across UTC midnight', () => {
  const instant = new Date('2026-10-13T23:30:00Z');
  assert.equal(dateInZone(instant, 'Europe/Belgrade'), '2026-10-14');
  assert.equal(dateInZone(instant, 'America/New_York'), '2026-10-13');
  assert.equal(timeInZone(instant, 'Europe/Belgrade'), '01:30');
});
test('manual time converts independent of device timezone', () => {
  assert.equal(zonedISO('2026-10-14','12:00','Europe/Belgrade'), '2026-10-14T10:00:00.000Z');
  assert.equal(zonedISO('2026-01-14','12:00','Europe/Belgrade'), '2026-01-14T11:00:00.000Z');
  assert.equal(zonedISO('2026-10-14','00:00','Asia/Tokyo'), '2026-10-13T15:00:00.000Z');
});
test('spring DST gap is rejected rather than silently shifted', () => {
  assert.throws(() => zonedISO('2026-03-29', '02:30', 'Europe/Belgrade'));
});
test('fall DST overlap returns an instance of the requested wall time', () => {
  const value = new Date(zonedISO('2026-10-25','02:30','Europe/Belgrade'));
  assert.equal(dateInZone(value,'Europe/Belgrade'), '2026-10-25');
  assert.equal(timeInZone(value,'Europe/Belgrade'), '02:30');
});
test('calendar navigation handles leap day and year boundaries', () => {
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
});
