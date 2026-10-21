# Separate services, one Schood design language

Assessment Cloud and Proctor are distinct Schood products, not pages or modules embedded into the mother platform. The user explicitly requires both clean service separation and reuse of the mother's design elements. Sharing a repository, identity or infrastructure does not merge the products.

## Product ownership

| Surface | Application | API | Responsibility |
| --- | --- | --- | --- |
| Mother platform | `apps/platform` | Existing Platform services | Schood discovery, account and existing platform workflows; no new assessment/proctor feature pages |
| Assessment Cloud | `apps/assessment-cloud` | `supabase/functions/assessment-cloud` | Institution-owned question banks, tests, publications, sittings, registrations, grading and results |
| Candidate delivery | `apps/exam` | Assessment API; explicit Proctor integration when required | Candidate examination runtime, answers, timing, recovery and exam-specific preparation |
| Proctor | `apps/proctor` | `supabase/functions/proctor` | Institution-operated policies, identity checks, session monitoring and integrity review |
| Academy | `apps/academy` | Existing Academy API | Its independently maintained LMS workflows; integrations must use explicit contracts |

Each new application has its own entry point, package, configuration, navigation, build output and local server. Assessment Cloud uses port 5179, Exam 5180 and Proctor 5181. Each builds into its own `dist` directory. Production domains, deployment jobs and environments remain to be provisioned; local app separation is not proof of independent live deployments.

## Shared foundations, not shared application internals

`packages/service-design` contains the Schood visual adapter: header, typography, colors, outlines, pills, panels and responsive behavior. It has no API calls, authentication, tenant state, assessment rules, integrity rules or application-router dependency. Its visual references are Platform's `SiteHeader`, `TeacherOfficePage` and typography, but it does not import or modify those files. The selected Schood fonts/mark and their supplied OFL licenses are copied into its owned assets directory; all three app builds emit the licenses. The Vite build helper packages assets only and is not imported into UI bundles.

`packages/assessment-core` contains pure assessment/proctor contracts and validations. `packages/assessment-web` contains shared authentication transport and candidate answer-spool utilities. These domain foundations are not imported into the mother platform. New apps must not import another app's source; Exam imports the shared design directly, not Assessment Cloud's stylesheet.

Assessment and Proctor own separate authenticated API handlers and persistence interfaces. Neither API imports the other handler implementation. Communication uses explicit service calls and durable identifiers, not shared page state or access to another service's private keys. Proctor cannot expose answer keys or mutate academic grades.

The previously selected shared Supabase identity/Postgres and Cloudflare infrastructure remain intact. Database tables, commands and audit streams are namespaced. This is logical ownership on shared infrastructure, not a claim of separate physical databases or failure-isolated deployments. Replacing those infrastructure decisions requires a separate explicit decision.

## Integration rules

- Do not add test authoring, exam delivery, live monitor or reviewer screens to the mother platform's router.
- Do not add assessment/proctor feature imports or dependencies to Platform or Academy.
- The mother platform may link to independently hosted service entry points through its existing discovery/navigation contract; a link is not an embedded application. No new discovery links have been added in this task.
- Shared sign-in does not grant product entitlement, institution membership, capability or session assignment. Those gates remain server-side.
- Shared visual identity does not mean a combined dashboard or combined operational workflow.
- Assessment Cloud owns academic scoring and result release. Proctor supplies integrity findings through an explicit contract; it does not directly rewrite grades.
- Service-specific CI, telemetry, quotas, migrations and release/rollback ownership must be implemented before deployment acceptance. Do not attach all services to the mother platform's existing deploy job.

## Verification

Run `node scripts/verify-assessment-boundaries.mjs` from the repository root. It parses static imports, re-exports, literal dynamic imports, type imports and CSS imports. It checks new apps against foreign application imports, protects Platform and Academy from new feature imports, keeps the design package independent of service logic, and prevents cross-service API implementation imports.

The current check covers 154 source files, including grading API modules, both separate Workers and generic Worker transport. Workers cannot import one another's implementation or any application/Edge implementation; shared transport cannot import service implementations. This is a source-boundary safeguard, not a runtime security test or complete dependency/load proof. Non-literal dynamic loading and future bundler aliases must be considered when extending the build system. Tenant RLS, service permissions and deployment isolation have separate acceptance tests.

The candidate uses the independent `packages/proctor-web` SDK only when Assessment-owned `required_services` explicitly includes Proctor. Unmonitored exams make no Proctor API calls. Monitored state and notices pass through explicit Proctor contracts; no candidate code imports the Proctor application or handler implementation.

The real-time coordinator is a separate Worker and private `assessment-runtime` bridge. It owns timed command routing, not product navigation. Candidate wiring to its mandatory lease contract now exists with a separate shared browser protocol; full real-stack and hosted acceptance remain release gates, not reasons to add exam features to the mother platform.

Grading is an Assessment-owned API namespace (`assessment-cloud/grading`) and its own `workers/assessment-grading` execution unit. Its queue has no browser HTTP workflow, answer keys or score payloads; it invokes a private Edge scorer. Human marking/moderation/release use independent capabilities and canonical commands. Proctor permissions do not grant grading rights, and Proctor cannot rewrite academic scores. `packages/assessment-worker` shares bounded HTTP transport/errors only, not either Worker's implementation.

## Accepted trade-off

A monorepo and shared foundations reduce duplication and keep Schood recognizable while allowing independent product applications and release units. Shared infrastructure still creates some operational coupling. Revisit provider isolation and shared-library versioning as load, institutional contracts and release cadence require it; do not solve that by moving service features into Platform.
