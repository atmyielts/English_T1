import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { smtpFixture, smtpFixtureText } from "./assessment-smtp-fixture.mjs";
export async function assessmentMailFixture(
  { root, directory, auth, database, base, sql },
) {
  const outfile = path.join(directory, "invitation-mail-edge.mjs");
  await build({
    stdin: {
      contents:
        "export {createInvitationMailHandler} from './supabase/functions/assessment-cloud/invitation-mail-handler.ts';export {createInvitationMailRepository} from './supabase/functions/assessment-cloud/invitation-mail-repository.ts';export {createInvitationRepository} from './supabase/functions/assessment-cloud/invitation-repository.ts';export {InvitationSigner} from './supabase/functions/assessment-cloud/invitation-signer.ts';",
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
  });
  const edge = await import(pathToFileURL(outfile).href),
    { smtpSender } = await import("../services/assessment-mailer/src/smtp.mjs"),
    { mailClient } = await import(
      "../services/assessment-mailer/src/client.mjs"
    ),
    { runMailer } = await import("../services/assessment-mailer/worker.mjs"),
    sink = await smtpFixture(),
    workerSecret = "synthetic-local-assessment-mail-control-key",
    keys = {
      one: Buffer.alloc(32, 1).toString("base64url"),
      two: Buffer.alloc(32, 2).toString("base64url"),
    };
  const handler = edge.createInvitationMailHandler(
      edge.createInvitationMailRepository(
        edge.createInvitationRepository(auth, database),
        database,
      ),
      [base],
      {
        enabled: true,
        signer: await edge.InvitationSigner.create("two", keys),
        appUrl: base + "/assessment/",
        allowLocalhost: true,
        workerSecret,
      },
    ),
    ports = mailClient({
      apiURL: base + "/functions/v1/assessment-cloud/invitations/mail/internal",
      anonKey: "synthetic-anon",
      workerSecret,
      allowLocalhost: true,
    }),
    send = smtpSender({
      host: "127.0.0.1",
      port: sink.port,
      from: "assessment@example.test",
    }, { testLoopback: true });
  return {
    handler,
    async run(mode = "accept") {
      sink.setMode(mode);
      await runMailer({
        ports,
        send,
        once: true,
        signal: new AbortController().signal,
        publish: () => {},
      });
      return { messages: sink.messages.length };
    },
    mailbox() {
      return sink.messages.map((message) => ({
        text: smtpFixtureText(message.raw),
        recipient: message.to,
      }));
    },
    advanceReminders() {
      sql(
        "begin;alter table assessment_invitation_mail disable trigger assessment_invitation_mail_guard;update assessment_invitation_mail set next_attempt_at=clock_timestamp()-interval '1 second' where kind='reminder' and state='queued';alter table assessment_invitation_mail enable trigger assessment_invitation_mail_guard;commit;",
      );
    },
    proof() {
      return {
        ...JSON.parse(
          sql(
            "select jsonb_build_object('mail_jobs',(select count(*) from assessment_invitation_mail),'mail_accepted',(select count(*) from assessment_invitation_mail where state='accepted'),'mail_uncertain',(select count(*) from assessment_invitation_mail where state='uncertain'),'mail_cancelled',(select count(*) from assessment_invitation_mail where state='cancelled'),'mail_acceptance_audits',(select count(*) from assessment_audit_events where action='staff.mail.handoff.accepted'),'mail_replacements',(select count(*) from assessment_invitation_mail where retry_of is not null));",
          ),
        ),
        smtp_messages: sink.messages.length,
      };
    },
    dispose: () => sink.close(),
  };
}
