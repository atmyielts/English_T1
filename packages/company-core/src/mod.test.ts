import { assertEquals } from 'jsr:@std/assert@1';
import { INDUSTRIES, INDUSTRY_ROLES, isJobRole, levelGap, overallScore, scoreToLevel } from './mod.ts';

Deno.test('scores map to CEFR bands at the floors', () => {
  assertEquals(scoreToLevel(0), 'pre_a1');
  assertEquals(scoreToLevel(15.9), 'pre_a1');
  assertEquals(scoreToLevel(16), 'a1');
  assertEquals(scoreToLevel(48), 'b1');
  assertEquals(scoreToLevel(79.9), 'b2');
  assertEquals(scoreToLevel(100), 'c2');
  assertEquals(scoreToLevel(140), 'c2');
  assertEquals(scoreToLevel(Number.NaN), 'pre_a1');
});

Deno.test('overall score is the mean of the measured skills', () => {
  assertEquals(overallScore({}), null);
  assertEquals(overallScore({ grammar: 60, reading: 70 }), 65);
  assertEquals(overallScore({ grammar: 60, writing: Number.NaN }), 60);
});

Deno.test('level gap counts the levels still to climb', () => {
  assertEquals(levelGap('a2', 'b2'), 2);
  assertEquals(levelGap('c1', 'b2'), 0);
  assertEquals(levelGap(null, 'a2'), 2);
  assertEquals(levelGap('b1', null), 0);
});

Deno.test('every industry suggests only known job roles', () => {
  for (const industry of INDUSTRIES) for (const role of INDUSTRY_ROLES[industry]) assertEquals(isJobRole(role), true, `${industry}:${role}`);
});
