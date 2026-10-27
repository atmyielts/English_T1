import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluate } from '../src/lib/calc.ts';

const value = (input: string, mode: 'deg' | 'rad' = 'deg', ans = 0) => { const r = evaluate(input, mode, ans); return r.ok ? r.text : r.error; };

Deno.test('Calculator: precedence, unary minus, powers and implicit multiplication', () => {
  assertEquals(value('2+3*4'), '14');
  assertEquals(value('(2+3)*4'), '20');
  assertEquals(value('-2^2'), '-4');
  assertEquals(value('2^3^2'), '512');
  assertEquals(value('2^-1'), '0.5');
  assertEquals(value('7÷2'), '3.5');
  assertEquals(value('3 × 4 − 5'), '7');
  assertEquals(value('2π'), String(Number((2 * Math.PI).toPrecision(12))));
  assertEquals(value('3(4+1)'), '15');
  assertEquals(value('2√9'), '6');
  assertEquals(value('5!'), '120');
  assertEquals(value('0.1+0.2'), '0.3');
  assertEquals(value('ans*2', 'deg', 21), '42');
});

Deno.test('Calculator: functions in degree and radian mode', () => {
  assertEquals(value('sin(30)'), '0.5');
  assertEquals(value('cos(90)'), '0');
  assertEquals(value('tan(45)'), '1');
  assertEquals(value('asin(1)'), '90');
  assertEquals(value('sin(pi/2)', 'rad'), '1');
  assertEquals(value('sqrt(2)^2'), '2');
  assertEquals(value('log(1000)'), '3');
  assertEquals(value('ln(e)'), '1');
  assertEquals(value('abs(-3)'), '3');
  assertEquals(value('cbrt(27)'), '3');
});

Deno.test('Calculator: errors are reported, never evaluated as code', () => {
  for (const input of ['2+', '(1', '1)', 'alert(1)', 'constructor', '1..2', '2**', '#']) assertEquals(evaluate(input).ok, false, input);
  assertEquals(value('1/0'), 'math');
  assertEquals(value('sqrt(-1)'), 'math');
  assertEquals(value('tan(90)'), 'math');
  assertEquals(value(''), 'empty');
});
