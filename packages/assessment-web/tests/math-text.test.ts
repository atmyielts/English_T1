import { hasMath, splitMath } from '../src/math-text.ts';

const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

Deno.test('formulas use LaTeX delimiters and dollar signs stay text', () => {
  equal(splitMath('Solve \\(x^2-5x+6=0\\).'), [{ kind: 'text', value: 'Solve ' }, { kind: 'inline', value: 'x^2-5x+6=0' }, { kind: 'text', value: '.' }]);
  equal(splitMath('\\[\\int_0^1 x\\,dx\\]'), [{ kind: 'display', value: '\\int_0^1 x\\,dx' }]);
  equal(splitMath('A pen costs $2 and a book $5.'), [{ kind: 'text', value: 'A pen costs $2 and a book $5.' }]);
  equal(splitMath('Unclosed \\(x+1'), [{ kind: 'text', value: 'Unclosed \\(x+1' }]);
  equal(splitMath('Empty \\( \\) stays'), [{ kind: 'text', value: 'Empty \\( \\) stays' }]);
  equal([hasMath('plain $5'), hasMath('\\(a\\)')], [false, true]);
});
