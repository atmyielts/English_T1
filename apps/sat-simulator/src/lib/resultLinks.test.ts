import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDY_PLAN_COPY, practiceLabUrl, studyPlanUrl } from './resultLinks.ts';

test('study plan link carries the simulator source and session id', () => {
  const url = new URL(studyPlanUrl('11111111-2222-4333-8444-555555555555'));
  assert.equal(url.origin + url.pathname, 'https://playbook.sat.schood.online/diagnostic');
  assert.equal(url.searchParams.get('source'), 'sat-simulator');
  assert.equal(url.searchParams.get('session_id'), '11111111-2222-4333-8444-555555555555');
  assert.equal(new URL(studyPlanUrl(undefined)).searchParams.has('session_id'), false);
});

test('practice link still opens the missed-question bank', () => {
  const url = new URL(practiceLabUrl());
  assert.equal(url.origin + url.pathname, 'https://practice.sat.schood.online/bank');
  assert.equal(url.searchParams.get('mistake_history'), 'previously_missed');
});

test('study plan copy exists in every locale', () => {
  for (const locale of ['en', 'uz', 'ru'] as const) {
    for (const value of Object.values(STUDY_PLAN_COPY[locale])) assert.ok(value.trim().length > 0);
  }
});
