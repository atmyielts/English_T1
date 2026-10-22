async (page) => {
  // Actual institution app and encrypted browser request journal; API/processing are explicit UI fixtures.
  const actor = '00000000-0000-4000-8000-000000000001', tenant = '10000000-0000-4000-8000-000000000001',
    bank = '20000000-0000-4000-8000-000000000001', id = '30000000-0000-4000-8000-000000000001',
    blockedId = '30000000-0000-4000-8000-000000000002', importId = '40000000-0000-4000-8000-000000000001';
  const errors = [], receipts = new Map(), requests = [];
  page.on('pageerror', error => errors.push(error.message));
  let job = null, staged = null, loseBegin = true, losePart = true, partCalls = 0, adopted = 0, revoked = false;
  const proposal = (line) => ({ line, identifier: 'item-' + line, source_path: `items/${line}.xml`,
    item: { schema_version: 'assessment.item.v1', type: 'single_choice', locale: 'en', prompt: `QTI placement question ${line} <script>inert</script>`, options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }], max_score: 1, tags: [] },
    key: { correct: 'B' }, fingerprint: String(line).repeat(64), warnings: ['Check the source licensing before adoption.'] });
  const blocked = { id: blockedId, bank_id: bank, filename: 'unsupported.zip', created_by: actor, state: 'blocked', revision: 4,
    source_hash: 'b'.repeat(64), byte_length: 22, received_parts: [0], review_hash: 'c'.repeat(64), total: 0, rows: [], adoption: null,
    blocked: [{ path: 'test.xml', code: 'unsupported_test_structure', message: 'This test structure needs explicit conversion; it was not silently imported.' }] };
  const legacy = { ...blocked, id: '30000000-0000-4000-8000-000000000003', filename: 'historical.zip', state: 'review_ready', rows: [proposal(1)], total: 1, blocked: [], scan: { verdict: 'clean', byte_verified: false, reason: 'historical_metadata', engine_version: 'Old metadata, not AV proof', signature_version: 'e'.repeat(64) } };
  await page.context().clearCookies();
  await page.route('https://assessment-tests.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    let data = [], status = 200, raw = null;
    if (pathname.includes('/auth/v1/token')) {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      raw = { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: actor, exp, role: 'authenticated' })) + '.test', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user: { id: actor, aud: 'authenticated', email: 'author@example.test', app_metadata: {}, user_metadata: {} } };
    } else if (pathname.endsWith('/workspaces')) data = [{ tenant_id: tenant, role: 'owner', tenants: { name: 'QTI placement center' } }];
    else if (pathname.endsWith('/grading/access')) data = { can_read_banks: true, can_write_items: true };
    else if (pathname.endsWith('/item-banks')) data = [{ id: bank, title: 'Center placement bank' }];
    else if (pathname.endsWith('/artifacts/library')) data = { items: [], next_cursor: null };
    else if (pathname.includes('/qti/')) {
      if (revoked) { status = 403; raw = { code: 'access_denied', error: 'Question-bank access was revoked.' }; }
      else if (pathname.endsWith('/commands')) {
        const body = request.postDataJSON(), key = request.headers()['idempotency-key'];
        requests.push(body.action);
        if (receipts.has(key)) {
          const previous = receipts.get(key);
          if (JSON.stringify(previous.body) !== JSON.stringify(body)) throw new Error('Saved QTI request changed on retry');
          data = previous.data;
        } else {
          if (body.action === 'source.begin') {
            job = { ...body.data, id, state: 'uploading', revision: 1, created_by: actor, received_parts: [], total: 0, review_hash: null, rows: [], blocked: [], adoption: null };
            data = { id, state: job.state, revision: 1 };
          } else if (body.action === 'adopt') {
            if (!body.data.acknowledged || body.data.review_hash !== job.review_hash || body.data.expected_revision !== job.revision) throw new Error('Adoption was not bound to reviewed content');
            adopted++; job.state = 'adopted'; job.revision++; job.adoption = { import_id: importId };
            staged = { id: importId, bank_id: bank, source_name: job.filename, source_hash: job.review_hash, review_hash: 'e'.repeat(64), state: 'staged', revision: 1, total: 2, processed: 0, authorized_by: null, rows: [proposal(1), proposal(2)].map(row => ({ ...row, state: 'staged', item_version_id: null })) };
            data = { id, state: job.state, revision: job.revision };
          } else if (body.action === 'cancel') { job.state = 'cancelled'; job.revision++; data = { id, state: job.state }; }
          else throw new Error('Unexpected QTI mutation ' + body.action);
          receipts.set(key, { body, data });
          if (body.action === 'source.begin' && loseBegin) { loseBegin = false; status = 503; raw = { code: 'reply_lost', error: 'The package request committed, but its receipt reply was lost.' }; }
        }
      } else if (pathname.endsWith('/jobs')) data = [...(job ? [job] : []), blocked, legacy];
      else if (pathname.endsWith('/' + blockedId)) data = blocked;
      else if (pathname.endsWith('/' + legacy.id)) data = legacy;
      else if (pathname.endsWith('/' + id)) data = { ...job, rows: job.total ? (Number(url.searchParams.get('after') || 0) ? [proposal(2)] : [proposal(1)]) : [] };
      else throw new Error('Unexpected QTI UI read');
    } else if (pathname.endsWith('/imports/jobs')) data = staged ? [staged] : [];
    else if (pathname.endsWith('/imports/jobs/' + importId)) data = staged;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(raw ?? { data }) });
  });
  await page.route('https://qti-tests.invalid/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/parts/0')) {
      partCalls++; job.received_parts = [0];
      if (losePart) { losePart = false; await route.fulfill({ status: 503, json: { code: 'reply_lost', error: 'A package part was saved but its reply was lost. Resume the same file.' } }); return; }
    } else if (path.endsWith('/complete')) {
      job.state = 'review_ready'; job.revision = 4; job.review_hash = 'd'.repeat(64); job.total = 2;
      job.scan = { verdict: 'clean', byte_verified: true, reason: 'clean', engine_version: 'UI fixture only, not AV', signature_version: 'f'.repeat(64) };
    } else throw new Error('Unexpected QTI transfer');
    await route.fulfill({ status: 200, json: { data: { job_id: id } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:5179/');
  await page.getByLabel('Email', { exact: true }).fill('author@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Import & export', exact: true }).click();
  await page.getByRole('button', { name: 'Review package: unsupported.zip', exact: true }).click();
  await page.getByText(blocked.blocked[0].message, { exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).count()) throw new Error('Blocked package offered adoption');
  await page.getByRole('button', { name: 'Review package: historical.zip', exact: true }).click();
  await page.getByText('Only historical scan metadata is available. Exact-byte security clearance has not been verified.', { exact: true }).waitFor();
  await page.getByLabel('Reason for package decision', { exact: true }).fill('Historical metadata cannot substitute for actual byte clearance.');
  await page.getByRole('checkbox', { name: 'I reviewed all proposed questions', exact: false }).check();
  if (!await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).isDisabled()) throw new Error('Historical metadata unlocked adoption');
  await page.getByRole('combobox', { name: 'QTI destination question bank', exact: true }).selectOption(bank);
  const select = bytes => page.getByLabel('QTI package file', { exact: true }).setInputFiles({ name: 'placement.zip', mimeType: 'application/zip', buffer: Buffer.alloc(22, bytes) });
  await select(1);
  await page.getByRole('button', { name: 'Upload QTI package for review', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Import & export', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Review QTI package', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'QTI destination question bank', exact: true }).selectOption(bank);
  await select(2); await page.getByRole('button', { name: 'Resume selected package upload', exact: true }).click();
  await page.getByText('Select the identical package and destination bank to resume this upload.', { exact: true }).waitFor();
  if (partCalls) throw new Error('Different bytes were sent as a resumed source');
  await select(1); await page.getByRole('button', { name: 'Resume selected package upload', exact: true }).click();
  await page.getByText('A package part was saved but its reply was lost. Resume the same file.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume selected package upload', exact: true }).click();
  const adopt = page.getByRole('button', { name: 'Adopt package for draft import', exact: true });
  await adopt.waitFor();
  await page.getByLabel('Reason for package decision', { exact: true }).fill('Reviewed all questions, keys and source rights.');
  await page.getByRole('checkbox', { name: 'I reviewed all proposed questions', exact: false }).check();
  if (!await adopt.isDisabled()) throw new Error('Unloaded proposal pages were implicitly acknowledged');
  await page.getByRole('button', { name: 'Load more QTI questions', exact: true }).click();
  await page.getByText(proposal(2).item.prompt, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).click();
  await page.getByRole('button', { name: 'Continue draft import review', exact: true }).click();
  await page.getByRole('heading', { name: 'Review imported questions', exact: true }).waitFor();
  if (!await page.getByRole('heading', { name: 'Review imported questions', exact: true }).evaluate(el => el === document.activeElement)) throw new Error('Draft import handoff did not move keyboard focus');
  if (adopted !== 1 || partCalls !== 2 || !requests.includes('adopt')) throw new Error('QTI recovery/adoption counts differ');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('QTI horizontal overflow at ' + width);
    await page.screenshot({ path: `output/playwright/assessment-cloud/qti-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Refresh package status', exact: true }).focus();
  if (!await page.getByRole('button', { name: 'Refresh package status', exact: true }).evaluate(el => el === document.activeElement)) throw new Error('QTI refresh cannot receive focus');
  revoked = true;
  await page.getByRole('button', { name: 'Refresh package status', exact: true }).press('Enter');
  await page.getByRole('heading', { name: 'QTI access changed', exact: true }).waitFor();
  if (await page.getByRole('heading', { name: 'Review QTI package', exact: true }).count()) throw new Error('QTI proposals survived permission teardown');
  if (errors.length) throw new Error(errors.join('\n'));
  return { actual_institution_ui: true, synthetic_api_and_processing: true, uncertain_begin_recovered_after_reload: true, exact_file_required: true, part_reply_recovery: true, all_pages_review_gate: true, blocked_diagnostics: true, staged_import_handoff: true, widths: 5, permission_teardown: true };
}
