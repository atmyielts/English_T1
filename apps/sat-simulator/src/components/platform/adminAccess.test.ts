import test from 'node:test';
import assert from 'node:assert/strict';
import { firstAllowedAdminRoute, hasAdminPermission } from './adminAccess.ts';

test('hasAdminPermission accepts direct and wildcard permissions', () => {
  assert.equal(hasAdminPermission(['admin.tests.manage'], 'admin.tests.manage'), true);
  assert.equal(hasAdminPermission(['admin.*'], 'admin.assets.manage'), true);
  assert.equal(hasAdminPermission(['admin.tests.manage'], 'admin.assets.manage'), false);
});

test('firstAllowedAdminRoute prefers the first accessible SAT admin surface', () => {
  assert.equal(firstAllowedAdminRoute(['admin.tests.manage']), '/admin/tests');
  assert.equal(firstAllowedAdminRoute(['admin.builder.manage']), '/admin/builder');
  assert.equal(firstAllowedAdminRoute(['admin.assets.manage']), '/admin/assets');
  assert.equal(firstAllowedAdminRoute(['admin.portal.access']), null);
});
