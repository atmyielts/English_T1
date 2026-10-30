/// <reference lib="deno.ns" />
import { formatDate, formatUzbek } from '../src/core/dates.ts';

// Uzbek dates are written out (browsers often lack Uzbek data and print "2026 M10 30").
const at = new Date('2026-10-30T09:05:07Z'); // a Friday; 14:05:07 in Tashkent
const zone = { timeZone: 'Asia/Tashkent' };
const equal = (actual: unknown, expected: unknown) => { if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`); };

Deno.test('Uzbek dates follow CLDR uz patterns with Latin names', () => {
  equal(formatUzbek(at, { dateStyle: 'medium', timeStyle: 'short', ...zone }), '30-okt, 2026, 14:05');
  equal(formatUzbek(at, { dateStyle: 'long', ...zone }), '30-oktabr, 2026');
  equal(formatUzbek(at, { dateStyle: 'full', ...zone }), 'juma, 30-oktabr, 2026');
  equal(formatUzbek(at, { dateStyle: 'short', ...zone }), '30/10/26');
  equal(formatUzbek(at, { dateStyle: 'medium', timeStyle: 'medium', ...zone }), '30-okt, 2026, 14:05:07');
  equal(formatUzbek(at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...zone }), '30-okt, 14:05');
  equal(formatUzbek(at, { weekday: 'short', day: 'numeric', month: 'short', ...zone }), 'Jum, 30-okt');
  equal(formatUzbek(at, { weekday: 'long', hour: '2-digit', minute: '2-digit', ...zone }), 'juma, 14:05');
  equal(formatUzbek(at, { weekday: 'long', ...zone }), 'juma');
  equal(formatUzbek(at, { day: 'numeric', month: 'short', year: 'numeric', ...zone }), '30-okt, 2026');
  equal(formatUzbek(at, { day: '2-digit', month: '2-digit', year: 'numeric', ...zone }), '30.10.2026');
  equal(formatDate('uz', 'not a date'), '—');
  if (!/^30 Oct 2026/.test(formatDate('en', at, { dateStyle: 'medium', ...zone }))) throw new Error('English stays Intl');
});
