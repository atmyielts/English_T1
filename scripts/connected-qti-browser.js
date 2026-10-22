async (page) => {
  // No request interception: actual app -> handlers/repos -> PG/Worker/R2/AV/parser.
  // Only identity and PostgREST framing use explicitly isolated fixture adapters.
  const base = new URL(page.url()).origin, info = await (await page.request.get(base + '/test/info')).json(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const region = () => page.getByRole('region', { name: 'Review QTI package', exact: true });
  async function imports() { await page.getByRole('button', { name: 'Import & export', exact: true }).click(); await page.getByRole('heading', { name: 'QTI test packages', exact: true }).waitFor(); }
  async function choose(kind, filename) {
    await page.getByRole('combobox', { name: 'QTI destination question bank', exact: true }).selectOption(info.bank);
    const response = await page.request.get(base + '/test/package?kind=' + kind);
    if (!response.ok()) throw new Error('Generated package unavailable');
    await page.getByLabel('QTI package file', { exact: true }).setInputFiles({ name: filename, mimeType: 'application/zip', buffer: await response.body() });
    await page.getByRole('button', { name: 'Upload QTI package for review', exact: true }).waitFor();
  }
  async function recoverQti() {
    await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).waitFor();
    await page.reload(); await imports();
    await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).click();
    await page.getByRole('button', { name: 'Retry saved QTI request', exact: true }).waitFor({ state: 'detached', timeout: 20000 });
    await region().waitFor();
  }
  async function processRound(key) {
    const start = await page.request.post(base + '/test/process', { data: { key } });
    if (!start.ok()) throw new Error('Processing round could not start');
    const job = await start.json(), replay = await (await page.request.post(base + '/test/process', { data: { key } })).json();
    if (replay.id !== job.id) throw new Error('Observation replay started duplicate processing');
    const deadline = Date.now() + 300000;
    let state;
    do {
      state = await (await page.request.get(base + '/test/process/' + job.id)).json();
      if (state.state === 'running') await page.waitForTimeout(500);
    } while (state.state === 'running' && Date.now() < deadline);
    if (state.state !== 'completed') throw new Error('Canonical processor did not complete: ' + JSON.stringify(state));
    await page.getByRole('button', { name: 'Refresh package status', exact: true }).click();
    return state;
  }
  async function upload(kind, filename) {
    await choose(kind, filename);
    await page.getByRole('button', { name: 'Upload QTI package for review', exact: true }).click();
    await region().getByText('Waiting for security scan', { exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Email', { exact: true }).fill('author@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await imports();
  await choose('clean', 'placement.zip');
  await page.getByRole('button', { name: 'Upload QTI package for review', exact: true }).click();
  await recoverQti();
  await choose('clean', 'placement.zip');
  await page.getByRole('button', { name: 'Resume selected package upload', exact: true }).click();
  await page.getByText('The package part was saved but its receipt reply was lost. Resume the same file.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume selected package upload', exact: true }).click();
  await region().getByText('Waiting for security scan', { exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).count()) throw new Error('Unscanned package offered adoption');
  const before = await (await page.request.get(base + '/test/proof')).json();
  if (before.reports || before.drafts || before.adoptions) throw new Error('Uploading created an unreviewed result/draft');
  const processed = await processRound('clean');
  if (processed.events.length !== 2 || processed.events.map(event => event.stage).join(',') !== 'scan,parse') throw new Error('Processor did not perform real ordered scan/parse');
  await region().getByText(info.prompt, { exact: true }).waitFor();
  await region().getByText('Security scan passed for these exact package bytes. Content compatibility still requires separate review.', { exact: true }).waitFor();
  await region().getByText('Answer key and source reference', { exact: true }).click();
  await region().getByText('Correct answer: A', { exact: true }).waitFor();
  const adopt = page.getByRole('button', { name: 'Adopt package for draft import', exact: true });
  if (!await adopt.isDisabled()) throw new Error('Package adoption skipped explicit human review');
  await page.getByLabel('Reason for package decision', { exact: true }).fill('Reviewed the exact scanned source, question, private answer key and source rights.');
  await page.getByRole('checkbox', { name: 'I reviewed all proposed questions', exact: false }).check();
  await adopt.click(); await recoverQti();
  await page.getByRole('button', { name: 'Continue draft import review', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Review imported questions', exact: true }); await heading.waitFor();
  if (!await heading.evaluate(element => element === document.activeElement)) throw new Error('Import handoff lost keyboard focus');
  let proof = await (await page.request.get(base + '/test/proof')).json();
  if (proof.adoptions !== 1 || proof.imports !== 1 || proof.drafts !== 0) throw new Error('Adoption bypassed separate draft-import confirmation');
  await page.getByLabel('Reason for import decision', { exact: true }).fill('Confirmed the source review and destination bank before creating drafts.');
  await page.getByRole('checkbox', { name: 'I reviewed the file, destination bank and warnings.', exact: false }).check();
  await page.getByRole('button', { name: 'Confirm reviewed import', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved import request', exact: true }).waitFor();
  await page.reload(); await imports();
  await page.getByRole('button', { name: 'Retry saved import request', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved import request', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Create next 50 question drafts', exact: true }).click();
  await page.getByText('completed · 1 of 1 drafts created', { exact: true }).waitFor();
  proof = await (await page.request.get(base + '/test/proof')).json();
  if (proof.drafts !== 1 || proof.approved !== 0 || proof.commands['source.begin'] !== 1 || proof.commands.adopt !== 1) throw new Error('Receipt recovery duplicated work or approved content');
  await upload('malware', 'malware.zip');
  const rejected = await processRound('malware');
  if (rejected.events.length !== 1 || rejected.events[0].stage !== 'scan') throw new Error('Rejected ZIP reached parser');
  await region().getByText('Package needs attention', { exact: true }).waitFor();
  await region().getByText('Security scanning rejected this package because of malware or a scan-policy limit. It cannot be imported.', { exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).count()) throw new Error('Malware rejection offered adoption');
  await upload('xml', 'malformed.zip'); await processRound('xml');
  await region().getByText('xml_dtd', { exact: true }).waitFor();
  await region().getByText('Security scan passed for these exact package bytes. Content compatibility still requires separate review.', { exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Adopt package for draft import', exact: true }).count()) throw new Error('Malformed XML offered adoption');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Connected QTI overflow at ' + width);
    await region().screenshot({ path: 'output/playwright/qti-connected/review-' + width + '.png' });
  }
  proof = await (await page.request.get(base + '/test/proof')).json();
  const clean = proof.scans.find(row => row.filename === 'placement.zip'), malware = proof.scans.find(row => row.filename === 'malware.zip'), xml = proof.scans.find(row => row.filename === 'malformed.zip');
  if (!clean || clean.verdict !== 'clean' || clean.performed !== true || clean.observed !== info.source_hash || clean.parse_reports !== 1 || clean.state !== 'adopted') throw new Error('Clean package lacks verified provenance');
  if (!malware || malware.verdict !== 'rejected' || malware.performed !== true || malware.parse_reports !== 0 || malware.state !== 'blocked') throw new Error('Malware lacked real scan-only rejection');
  if (!xml || xml.verdict !== 'clean' || xml.parse_reports !== 1 || xml.state !== 'blocked') throw new Error('Malformed source did not retain a clean AV and blocked semantic report separately');
  if (proof.scans.some(row => !row.engine || row.engine.includes('fixture') || row.observed !== row.source_hash)) throw new Error('Scan evidence was not actual exact-byte AV');
  await page.request.post(base + '/test/revoke');
  await page.getByRole('button', { name: 'Refresh package status', exact: true }).click();
  await page.getByRole('heading', { name: 'QTI access changed', exact: true }).waitFor();
  if (await page.getByRole('heading', { name: 'Review QTI package', exact: true }).count()) throw new Error('Revoked QTI proposal remained visible');
  if (errors.length) throw new Error(errors.join('\n'));
  return { ...proof, connected_qti: true, actual_byte_scanning: true, explicit_review_to_draft: true, uncertain_begin_part_adoption_confirmation_recovered: true, malware_and_semantic_rejections: true, widths: 5, permission_teardown: true, identity_and_postgrest_are_fixtures: true };
}
