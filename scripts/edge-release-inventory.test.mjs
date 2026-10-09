import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeRuntimeInventory } from './edge-release-inventory.mjs';
test('test-only Academy contract correction requires no unrelated Academy deployment', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/academy/student-center-video-contract.test.ts']), { edgeFunctions: [], sharedEdgeChanged: false });
});
test('actual handler changes are required even alongside tests', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/platform-settings/handler.ts', 'supabase/functions/platform-settings/handler.test.ts']), { edgeFunctions: ['platform-settings'], sharedEdgeChanged: false });
});
test('actual entry point changes remain required', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/me/index.ts']), { edgeFunctions: ['me'], sharedEdgeChanged: false });
});
test('shared authorization source requires a consumer inventory', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/_shared/admin-access.ts', 'supabase/functions/_shared/admin-access.test.ts']), { edgeFunctions: [], sharedEdgeChanged: true });
});
test('shared test-only edits do not trigger backend deployment', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/_shared/example.spec.ts']), { edgeFunctions: [], sharedEdgeChanged: false });
});
test('every actual affected function appears once in stable order', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/zeta/index.ts', 'supabase/functions/alpha/index.ts', 'supabase/functions/zeta/handler.ts']), { edgeFunctions: ['alpha', 'zeta'], sharedEdgeChanged: false });
});
test('non-test function resources remain conservatively included', () => {
  assert.deepEqual(edgeRuntimeInventory(['supabase/functions/example/deno.json', 'supabase/functions/example/template.html']), { edgeFunctions: ['example'], sharedEdgeChanged: false });
});
test('unrelated files do not create Edge deployment work', () => {
  assert.deepEqual(edgeRuntimeInventory(['scripts/example.test.mjs', 'apps/platform/tests/example.spec.ts']), { edgeFunctions: [], sharedEdgeChanged: false });
});
