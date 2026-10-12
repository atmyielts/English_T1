import {assertEquals,assertThrows} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {academyWallTime,academyWallTimeToIso} from '../apps/academy/src/lib/academyTime.ts';
Deno.test('lesson form converts the selected branch clock independently of the browser clock',()=>{
  assertEquals(academyWallTimeToIso('2026-10-12T14:00','Asia/Tashkent'),'2026-10-12T09:00:00.000Z');
  assertEquals(academyWallTimeToIso('2026-10-12T14:00','America/Los_Angeles'),'2026-10-12T21:00:00.000Z');
  assertEquals(academyWallTimeToIso('2026-10-12T14:00','Asia/Kathmandu'),'2026-10-12T08:15:00.000Z');
  assertEquals(academyWallTime(new Date('2026-10-12T09:00Z'),'Asia/Tashkent'),'2026-10-12T14:00');
});
Deno.test('invalid dates, DST gaps and DST folds do not silently create shifted lessons',()=>{
  for(const value of ['2026-02-29T14:00','2026-10-12T24:00','','2026-10-12T14:00Z'])assertThrows(()=>academyWallTimeToIso(value,'Asia/Tashkent'),Error,'valid date');
  assertThrows(()=>academyWallTimeToIso('2026-03-08T02:30','America/New_York'),Error,'does not exist');
  assertThrows(()=>academyWallTimeToIso('2026-11-01T01:30','America/New_York'),Error,'occurs twice');
  assertEquals(academyWallTimeToIso('2026-03-08T03:30','America/New_York'),'2026-03-08T07:30:00.000Z');
  assertEquals(academyWallTimeToIso('2026-11-01T02:30','America/New_York'),'2026-11-01T07:30:00.000Z');
});
