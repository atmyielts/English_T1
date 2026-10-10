import { parentReportReadStatus } from './public-boundary.ts';
const assert = (value: unknown) => { if (!value) throw Error('Report scope assertion failed'); };
Deno.test('parent report accepts only matching stored academy and student identities', () => {
  assert(parentReportReadStatus('academy-a', 'student-a', { id: 'student-a', academy_id: 'academy-a' }, { id: 'academy-a' }, []) === 200);
});
Deno.test('parent report denies a contact from another academy even if its foreign key is valid', () => {
  assert(parentReportReadStatus('academy-a', 'student-b', { id: 'student-b', academy_id: 'academy-b' }, { id: 'academy-a' }, []) === 404);
});
Deno.test('parent report denies missing or mismatched student and academy data', () => {
  for (const contact of [null, {}, { id: 'student-b', academy_id: 'academy-a' }]) {
    assert(parentReportReadStatus('academy-a', 'student-a', contact, { id: 'academy-a' }, []) === 404);
  }
  for (const academy of [null, {}, { id: 'academy-b' }]) {
    assert(parentReportReadStatus('academy-a', 'student-a', { id: 'student-a', academy_id: 'academy-a' }, academy, []) === 404);
  }
});
Deno.test('parent report query failures cannot masquerade as an empty successful report', () => {
  for (let index = 0; index < 5; index++) {
    const errors = Array.from({ length: 5 }, (_, i) => i === index ? { message: 'private-query-marker' } : null);
    assert(parentReportReadStatus('academy-a', 'student-a', { id: 'student-a', academy_id: 'academy-a' }, { id: 'academy-a' }, errors) === 503);
  }
});
