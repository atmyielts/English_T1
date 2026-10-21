import { appealBrowserStack } from "./assessment-appeal-stack.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url)),
  session = `assessment-appeals-${randomUUID().slice(0, 8)}`;
const npx = [
  process.env.npm_execpath
    ? path.join(path.dirname(process.env.npm_execpath), "npx-cli.js")
    : "",
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"),
  path.resolve(
    path.dirname(process.execPath),
    "../lib/node_modules/npm/bin/npx-cli.js",
  ),
].find((file) => file && existsSync(file));
assert.ok(npx);
function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      npx,
      "--yes",
      "--package",
      "@playwright/cli",
      "playwright-cli",
      `-s=${session}`,
      ...args,
    ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (c) => output += c);
    child.stderr.on("data", (c) => error += c);
    child.on("error", reject);
    child.on(
      "close",
      (code) =>
        code === 0 ? resolve(output) : reject(new Error(error || output)),
    );
  });
}
let fixture;
const lifecycleMode=process.argv.includes('--certificate-lifecycle');
const blueprintMode=process.argv.includes('--blueprints');
const accommodationMode=process.argv.includes('--accommodations');
const documentMode=process.argv.includes('--certificate-documents')||lifecycleMode;
const certificateMode = process.argv.includes("--certificates")||documentMode;
const cohortMode=process.argv.includes('--cohorts');
const importMode=process.argv.includes('--imports');
const analyticsMode=process.argv.includes('--analytics');
const feedbackMode=process.argv.includes('--feedback');
const captureMode=process.argv.includes('--capture');
const liveMode=process.argv.includes('--live');
const workloadMode=process.argv.includes('--workload');
const staffMode=process.argv.includes('--staff');
const invitationMode=process.argv.includes('--invitations');
const mailMode=process.argv.includes('--invitation-mail');
try {
  await mkdir(path.join(root, "output/playwright/appeals"), {
    recursive: true,
  });
  await mkdir(path.join(root, "output/playwright/certificates"), {
    recursive: true,
  });
  await mkdir(path.join(root,"output/playwright/certificate-lifecycle"),{recursive:true});
  await mkdir(path.join(root,"output/playwright/blueprints"),{recursive:true});
  await mkdir(path.join(root,"output/playwright/accommodations"),{recursive:true});
  await mkdir(path.join(root,'output/playwright/cohorts'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/imports'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/analytics'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/feedback'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/capture'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/staff'),{recursive:true});
  await mkdir(path.join(root,'output/playwright/invitations'),{recursive:true});
  fixture = await appealBrowserStack({ certificates: certificateMode,documents:documentMode,lifecycle:lifecycleMode,blueprints:blueprintMode,accommodations:accommodationMode,cohorts:cohortMode,imports:importMode,analytics:analyticsMode,feedback:feedbackMode,capture:captureMode,live:liveMode,workload:workloadMode,staff:staffMode,invitations:invitationMode,mail:mailMode });
  await cli(["open", fixture.base + "/exam/", "--browser", "chrome"]);
  await cli(["snapshot"]);
  const result = await cli([
      "run-code",
      "--filename",
      accommodationMode?'scripts/connected-accommodations-browser.js':blueprintMode?'scripts/connected-blueprints-browser.js':lifecycleMode?'scripts/connected-certificate-lifecycle-browser.js':workloadMode?'scripts/connected-workload-browser.js':liveMode?'scripts/connected-live-launch-browser.js':mailMode?'scripts/connected-invitation-mail-browser.js':invitationMode?'scripts/connected-invitations-browser.js':staffMode?'scripts/connected-staff-browser.js':captureMode?'scripts/connected-capture-browser.js':feedbackMode?'scripts/connected-feedback-browser.js':analyticsMode?'scripts/connected-analytics-browser.js':importMode?'scripts/connected-imports-browser.js':cohortMode?'scripts/connected-cohorts-browser.js':certificateMode
        ? "scripts/connected-certificates-browser.js"
        : "scripts/connected-appeals-browser.js",
    ]),
    raw = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
  assert.ok(raw, result);
  const proof = JSON.parse(raw);
  if(accommodationMode){for(const key of ['connected_accommodations','approval_receipt_recovered','stale_revision_refused','reason_private','questions_hidden_on_break','break_receipt_recovered','break_survived_reload','early_return_restored_questions','pause_closed_break','scores_unchanged'])assert.equal(proof[key],true,key);for(const[key,value]of Object.entries({approval_audits:2,registration_revision:2,attempts:1,pinned_revision:2,pinned_extra_seconds:300,breaks:2,break_commands:3,reason_in_candidate_rows:0,attempt_state:'submitted'}))assert.deepEqual(proof[key],value,key);assert.deepEqual(proof.break_reasons,['candidate','proctor_pause']);assert.ok(proof.responses>=1);console.log(JSON.stringify({event:'assessment.connected.accommodations.acceptance',...proof}));}else
  if(blueprintMode){for(const key of ['connected_blueprints','center_classification_reviewed','impossible_preview_blocked','create_publish_recovered','start_recovered','canonical_manifest_verified','reload_preserved_form','unmonitored_no_devices','foreign_preview_denied','scores_unchanged'])assert.equal(proof[key],true,key);for(const[key,value]of Object.entries({definitions:1,versions:1,forms:1,attempts:1,classified_questions:5,classification_leaks:0}))assert.equal(proof[key],value,key);console.log(JSON.stringify({event:'assessment.connected.blueprints.acceptance',...proof}));}else
  if(lifecycleMode){for(const key of ['connected_lifecycle','replacement_prepare_recovered','replacement_seal_recovered_with_retired_key','retirement_receipt_recovered','original_signature_unchanged','replacement_signature_verified','original_not_revived','retired_program_hidden','foreign_history_denied','scores_unchanged'])assert.equal(proof[key],true,key);for(const[key,value]of Object.entries({certificates:2,retirements:1,replacement_intents:1,replaced_audits:1,replaced_events:1,issued_audits:2,retired_audits:1,revoked:1,documents:2,document_audits:2}))assert.equal(proof[key],value,key);console.log(JSON.stringify({event:'assessment.connected.certificate.lifecycle.acceptance',...proof}));}else
  if(workloadMode){for(const key of ['connected_workload','complete_paging','bounded_live_board','lost_assignment_receipt_recovered','stale_batch_atomic','removed_observer_denied','supervisor_withdrawal_hides_controls','scores_unchanged','academic_state_unchanged'])assert.equal(proof[key],true,key);assert.equal(proof.sessions,57);assert.equal(proof.commands,2);assert.equal(proof.audits,2);assert.equal(proof.active_observer_assignments,0);console.log(JSON.stringify({event:'proctor.connected.workload.acceptance',...proof}));}else
  if(liveMode){for(const key of ['connected_live_launch','canonical_preclock_ready','assigned_observer_native_video','unassigned_observer_denied','live_only_loss_preserved_recording','canonical_live_pause','explicit_human_resume','no_permission_reacquisition','scores_unchanged'])assert.equal(proof[key],true,key);assert.equal(proof.attempts,1);assert.equal(proof.attempt_state,'submitted');assert.equal(proof.live_open,0);assert.ok(proof.live_pauses>=1);assert.ok(proof.publish>=4);assert.ok(proof.subscribe>=2);assert.equal(proof.relayRevoke,proof.relayIssue);assert.ok(proof.recordings.every(row=>row.state==='sealed'));console.log(JSON.stringify({event:'assessment.connected.live.launch.acceptance',...proof}));}else
  if(mailMode){for(const key of ['connected_invitation_mail','organization_unchanged','scores_unchanged','can_write','actual_smtp_mime','lost_queue_receipt_recovered','lost_smtp_report_recovered','unknown_handoff_not_resent','accepted_reminder_cancelled'])assert.equal(proof[key],true,key);for(const[key,value]of Object.entries({invitations:2,accepted:1,revoked:1,assignments:1,service_memberships:1,organization_memberships:0,banks:1,can_manage:false,can_proctor:false,mail_jobs:4,mail_accepted:1,mail_uncertain:1,mail_cancelled:2,mail_acceptance_audits:1,mail_replacements:1,smtp_messages:2,external_email_sent:false}))assert.equal(proof[key],value,key);console.log(JSON.stringify({event:'assessment.connected.invitation.mail.acceptance',...proof}));}else
  if(invitationMode){for(const key of ['connected_invitations','organization_unchanged','scores_unchanged','can_write','lost_creation_recovered_after_key_rotation','lost_acceptance_recovered','verified_recipient_checks','revocation_denied'])assert.equal(proof[key],true,key);for(const [key,value] of Object.entries({invitations:2,accepted:1,revoked:1,acceptance_audits:1,creation_audits:2,assignments:1,service_memberships:1,organization_memberships:0,banks:1,can_manage:false,can_proctor:false,email_sent:false}))assert.equal(proof[key],value,key);console.log(JSON.stringify({event:'assessment.connected.invitations.acceptance',...proof}));}else
  if(staffMode){assert.equal(proof.connected_staff,true);assert.equal(proof.organization_unchanged,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.local_organization_memberships,0);assert.equal(proof.local_banks,1);assert.equal(proof.local_can_write,true);assert.equal(proof.local_proctor,false);assert.equal(proof.legacy_assessment,false);assert.equal(proof.legacy_proctor,true);assert.equal(proof.suspensions,2);assert.equal(proof.resumptions,1);console.log(JSON.stringify({event:'assessment.connected.staff.acceptance',...proof}));}
  else if(captureMode){assert.equal(proof.connected_capture,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.attempts,1);assert.equal(proof.monitoring_sessions,1);assert.equal(proof.attempt_state,'submitted');assert.equal(proof.opens,1);assert.equal(proof.activations,1);assert.ok(proof.responses>=1);assert.ok(proof.parts>=3);assert.ok(proof.segments>=3);assert.ok(proof.recordings.length>=4);assert.ok(proof.recordings.every(row=>row.state==='sealed'&&row.days===7));assert.equal(proof.continuous_loss_pause,true);assert.equal(proof.all_physical_tracks_stopped,true);console.log(JSON.stringify({event:'assessment.connected.capture.acceptance',...proof}));}
  else if(feedbackMode){assert.equal(proof.connected_feedback,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.versions,2);assert.equal(proof.approvals,2);assert.equal(proof.holds,2);assert.equal(proof.audits,6);assert.deepEqual(proof.policies.map(row=>[row.generation,row.level,row.future]),[[1,'totals',null],[2,'totals',null],[3,'questions',true],[4,'questions',false]]);console.log(JSON.stringify({event:'assessment.connected.feedback.acceptance',...proof}));}
  else if(analyticsMode){assert.equal(proof.connected_analytics,true);assert.equal(proof.candidate_breakdown,true);assert.equal(proof.known_statistics,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.snapshots,2);assert.equal(proof.rows,9);assert.equal(proof.audits,2);console.log(JSON.stringify({event:'assessment.connected.analytics.acceptance',...proof}));}
  else if(importMode){assert.equal(proof.connected_imports,true);assert.equal(proof.export_roundtrip,true);assert.equal(proof.refresh_recovery,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.imports,1);assert.equal(proof.rows,60);assert.equal(proof.created,60);assert.equal(proof.drafts,59);assert.equal(proof.approved,1);assert.equal(proof.steps,2);console.log(JSON.stringify({event:'assessment.connected.imports.acceptance',...proof}));}
  else if(cohortMode){assert.equal(proof.connected_roster,true);assert.equal(proof.worker_recovery,true);assert.equal(proof.explicit_adoption,true);assert.equal(proof.candidate_assignments,true);assert.equal(proof.scores_unchanged,true);assert.equal(proof.jobs,2);assert.equal(proof.targets,124);assert.equal(proof.registered,122);assert.equal(proof.finished_audits,2);assert.equal(proof.blocked_audits,1);console.log(JSON.stringify({event:'assessment.connected.cohorts.acceptance',...proof}));}
  else if (certificateMode) {
    if(documentMode){for(const key of ['connected_documents','pdf_document_receipt_recovery','qr_and_pdf_match','qr_revocation','foreign_pdf_denied'])assert.equal(proof[key],true,key);assert.equal(proof.documents,3);assert.equal(proof.document_audits,3);assert.deepEqual(proof.document_locales,['en','ru','uz']);}
    assert.equal(proof.connected_certificates, true);
    assert.equal(proof.rotated_retry, true);
    assert.equal(proof.offline_signature, true);
    assert.equal(proof.online_revocation, true);
    assert.equal(proof.foreign_candidate_denied, true);
    assert.equal(proof.scores_unchanged, true);
    assert.equal(proof.certificates, 1);
    assert.equal(proof.revoked, 1);
    assert.equal(proof.programs, 1);
    assert.equal(proof.issuance_audits, 1);
    assert.equal(proof.revocation_audits, 1);
    assert.equal(proof.issued_events, 1);
    console.log(
      JSON.stringify({
        event: "assessment.connected.certificates.acceptance",
        ...proof,
      }),
    );
  } else {
    assert.equal(proof.connected_appeals, true);
    assert.equal(proof.lost_receipts, true);
    assert.equal(proof.independent_review, true);
    assert.equal(proof.revocation_denied, true);
    assert.equal(proof.scores_unchanged, true);
    assert.equal(proof.regrade_jobs, 1);
    assert.equal(proof.appeals, 1);
    assert.equal(proof.events, 2);
    assert.equal(proof.audit, 2);
    assert.equal(proof.commands, 2);
    console.log(
      JSON.stringify({
        event: "assessment.connected.appeals.acceptance",
        ...proof,
      }),
    );
  }
} catch (cause) {
  try {
    console.error(await cli(["snapshot"]));
  } catch {}
  throw cause;
} finally {
  try {
    await cli(["close"]);
  } catch {}
  await fixture?.dispose();
}
