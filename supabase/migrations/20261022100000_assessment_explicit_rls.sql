-- Assessment Cloud / Proctor: explicit row-level security statements.
--
-- Every table below already enables RLS inside the migration that created it,
-- through `foreach ... execute format('alter table public.%I enable row level
-- security')` loops. Those loops are invisible to the repository's static
-- production-readiness check, which recognises only literal statements. This
-- migration restates them literally. It is idempotent: enabling RLS on a table
-- that already has it is a no-op, and no policy, grant or data changes here.
-- Access remains service_role-only through the Edge functions.
begin;
alter table public.assessment_analytics_commands enable row level security;
alter table public.assessment_analytics_items enable row level security;
alter table public.assessment_analytics_rows enable row level security;
alter table public.assessment_analytics_snapshots enable row level security;
alter table public.assessment_artifact_commands enable row level security;
alter table public.assessment_artifact_parts enable row level security;
alter table public.assessment_artifact_scan_jobs enable row level security;
alter table public.assessment_artifact_scan_reports enable row level security;
alter table public.assessment_artifacts enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_audit_events enable row level security;
alter table public.assessment_capability_grants enable row level security;
alter table public.assessment_certificate_commands enable row level security;
alter table public.assessment_certificate_programs enable row level security;
alter table public.assessment_certificates enable row level security;
alter table public.assessment_cohort_commands enable row level security;
alter table public.assessment_cohort_members enable row level security;
alter table public.assessment_cohorts enable row level security;
alter table public.assessment_commands enable row level security;
alter table public.assessment_definitions enable row level security;
alter table public.assessment_exam_windows enable row level security;
alter table public.assessment_feedback_approvals enable row level security;
alter table public.assessment_feedback_commands enable row level security;
alter table public.assessment_feedback_holds enable row level security;
alter table public.assessment_feedback_settings enable row level security;
alter table public.assessment_feedback_versions enable row level security;
alter table public.assessment_forms enable row level security;
alter table public.assessment_grading_adjudications enable row level security;
alter table public.assessment_grading_assignments enable row level security;
alter table public.assessment_grading_commands enable row level security;
alter table public.assessment_grading_jobs enable row level security;
alter table public.assessment_grading_marks enable row level security;
alter table public.assessment_grading_policies enable row level security;
alter table public.assessment_grading_releases enable row level security;
alter table public.assessment_grading_runs enable row level security;
alter table public.assessment_grading_tasks enable row level security;
alter table public.assessment_item_banks enable row level security;
alter table public.assessment_item_keys enable row level security;
alter table public.assessment_item_versions enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_qti_adoptions enable row level security;
alter table public.assessment_qti_commands enable row level security;
alter table public.assessment_qti_jobs enable row level security;
alter table public.assessment_qti_parts enable row level security;
alter table public.assessment_qti_reports enable row level security;
alter table public.assessment_registrations enable row level security;
alter table public.assessment_response_journal enable row level security;
alter table public.assessment_roster_jobs enable row level security;
alter table public.assessment_roster_targets enable row level security;
alter table public.assessment_rubrics enable row level security;
alter table public.assessment_runtime_items enable row level security;
alter table public.assessment_score_revisions enable row level security;
alter table public.assessment_staff_commands enable row level security;
alter table public.assessment_staff_role_assignments enable row level security;
alter table public.assessment_staff_role_versions enable row level security;
alter table public.assessment_staff_roles enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.proctor_assignments enable row level security;
alter table public.proctor_case_findings enable row level security;
alter table public.proctor_commands enable row level security;
alter table public.proctor_event_receipts enable row level security;
alter table public.proctor_event_streams enable row level security;
alter table public.proctor_identity_checks enable row level security;
alter table public.proctor_integrity_events enable row level security;
alter table public.proctor_integrity_events_default enable row level security;
alter table public.proctor_policies enable row level security;
alter table public.proctor_preparations enable row level security;
alter table public.proctor_recording_commands enable row level security;
alter table public.proctor_recording_parts enable row level security;
alter table public.proctor_recording_segments enable row level security;
alter table public.proctor_recordings enable row level security;
alter table public.proctor_review_cases enable row level security;
alter table public.proctor_sessions enable row level security;
alter table public.proctor_window_policies enable row level security;
commit;
