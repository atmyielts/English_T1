-- Schema-only fixture for fast CI privacy checks. Relevant table columns,
-- checks, keys and read views are captured definitions, not a second portal
-- implementation. Unrelated foreign-key targets and business/Auth triggers
-- are exercised by qualify-academy-guardian-schema.mjs against all 413 tables.
-- Capture SHA256 after LF normalization: b342e377ac5ab838416cfeea0fd87f22b34c00963d70a9db19eb98700b267e58
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;
create table public.users(id uuid primary key,is_active boolean not null default true);
create table auth.users(id uuid primary key,email text,aud text,role text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
create function public.fixture_parent_user() returns trigger language plpgsql as $$begin insert into public.users(id) values(new.id);return new;end;$$;
create trigger fixture_parent_user after insert on auth.users for each row execute function public.fixture_parent_user();
create or replace function public.academy_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_digits = '' then return null; end if;
  if length(v_digits) = 9 then return '+998' || v_digits; end if;
  if length(v_digits) = 12 and left(v_digits, 3) = '998' then return '+' || v_digits; end if;
  if length(v_digits) = 13 and left(v_digits, 4) = '0998' then return '+' || right(v_digits, 12); end if;
  if left(v_digits, 2) = '00' then return '+' || substr(v_digits, 3); end if;
  return '+' || v_digits;
end;
$$;

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "type" "text" DEFAULT 'personal'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "tenants_type_check" CHECK (("type" = ANY (ARRAY['personal'::"text", 'team'::"text", 'org'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "branch_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "timezone" "text" DEFAULT 'Asia/Tashkent'::"text" NOT NULL,
    "currency" "text" DEFAULT 'UZS'::"text" NOT NULL,
    "capacity" integer,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academy_branches_capacity_check" CHECK ((("capacity" IS NULL) OR ("capacity" >= 0)))
);

CREATE TABLE IF NOT EXISTS "public"."academy_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text",
    "phone" "text",
    "telegram_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_activity_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notify_enabled" boolean DEFAULT true NOT NULL,
    "placement_level" "text",
    "placement_score" numeric,
    "lifecycle_stage" "text",
    "phone_normalized" "text" GENERATED ALWAYS AS ("public"."academy_normalize_phone"("phone")) STORED,
    "primary_branch_id" "uuid" NOT NULL,
    CONSTRAINT "academy_contacts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'trial'::"text", 'paused'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_classrooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "score_weights" "jsonb",
    "student_capacity" integer,
    "branch_id" "uuid" NOT NULL,
    CONSTRAINT "academy_classrooms_student_capacity_check" CHECK ((("student_capacity" IS NULL) OR ("student_capacity" >= 0)))
);

CREATE TABLE IF NOT EXISTS "public"."academy_classroom_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "paused_at" timestamp with time zone,
    "withdrawn_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "transferred_from_membership_id" "uuid",
    CONSTRAINT "academy_classroom_memberships_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'assistant'::"text", 'teacher'::"text", 'observer'::"text"]))),
    CONSTRAINT "academy_classroom_memberships_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'withdrawn'::"text", 'expired'::"text", 'transferred'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_guardians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "telegram_user_id" "text",
    "telegram_chat_id" "text",
    "telegram_username" "text",
    "telegram_verified_at" timestamp with time zone,
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "locale" "text" DEFAULT 'uz'::"text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone_normalized" "text" GENERATED ALWAYS AS ("public"."academy_normalize_phone"("phone")) STORED,
    CONSTRAINT "academy_guardians_check" CHECK ((("phone" IS NOT NULL) OR ("email" IS NOT NULL) OR ("telegram_user_id" IS NOT NULL))),
    CONSTRAINT "academy_guardians_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'verified'::"text", 'suspended'::"text", 'revoked'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_student_guardian_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_primary_contact" boolean DEFAULT false NOT NULL,
    "is_financially_responsible" boolean DEFAULT false NOT NULL,
    "is_emergency_contact" boolean DEFAULT false NOT NULL,
    "can_view_status" boolean DEFAULT true NOT NULL,
    "can_view_attendance" boolean DEFAULT true NOT NULL,
    "can_view_grades" boolean DEFAULT true NOT NULL,
    "can_view_homework" boolean DEFAULT true NOT NULL,
    "can_view_schedule" boolean DEFAULT true NOT NULL,
    "can_view_payments" boolean DEFAULT false NOT NULL,
    "can_view_debt" boolean DEFAULT false NOT NULL,
    "can_view_messages" boolean DEFAULT true NOT NULL,
    "can_view_progress_reports" boolean DEFAULT true NOT NULL,
    "can_view_resources" boolean DEFAULT true NOT NULL,
    "can_view_announcements" boolean DEFAULT true NOT NULL,
    "can_message_academy" boolean DEFAULT true NOT NULL,
    "consent_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "consented_at" timestamp with time zone,
    "consent_expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revocation_reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_student_guardian_relationships_check" CHECK (((NOT "is_financially_responsible") OR "can_view_payments")),
    CONSTRAINT "academy_student_guardian_relationships_check1" CHECK (((NOT "can_view_debt") OR "can_view_payments")),
    CONSTRAINT "academy_student_guardian_relationships_consent_status_check" CHECK (("consent_status" = ANY (ARRAY['pending'::"text", 'granted'::"text", 'declined'::"text", 'revoked'::"text", 'expired'::"text"]))),
    CONSTRAINT "academy_student_guardian_relationships_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['mother'::"text", 'father'::"text", 'guardian'::"text", 'sponsor'::"text", 'emergency_contact'::"text", 'other'::"text"]))),
    CONSTRAINT "academy_student_guardian_relationships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'revoked'::"text", 'expired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_guardian_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "relationship_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "policy_version" "text" NOT NULL,
    "status" "text" NOT NULL,
    "granted_by_user_id" "uuid",
    "recorded_by_user_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "reason" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_guardian_consents_consent_type_check" CHECK (("consent_type" = ANY (ARRAY['guardian_access'::"text", 'academic_visibility'::"text", 'financial_visibility'::"text", 'messaging'::"text", 'telegram_link'::"text", 'data_processing'::"text"]))),
    CONSTRAINT "academy_guardian_consents_status_check" CHECK (("status" = ANY (ARRAY['granted'::"text", 'declined'::"text", 'revoked'::"text", 'expired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_guardian_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "relationship_id" "uuid" NOT NULL,
    "token_hash" "bytea" NOT NULL,
    "purpose" "text" DEFAULT 'telegram_guardian_link'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "max_uses" integer DEFAULT 1 NOT NULL,
    "use_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "issued_by" "uuid",
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academy_guardian_link_tokens_max_uses_check" CHECK ((("max_uses" >= 1) AND ("max_uses" <= 5))),
    CONSTRAINT "academy_guardian_link_tokens_purpose_check" CHECK (("purpose" = ANY (ARRAY['telegram_guardian_link'::"text", 'web_guardian_link'::"text"]))),
    CONSTRAINT "academy_guardian_link_tokens_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'used'::"text", 'revoked'::"text", 'expired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_guardian_notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "inapp_enabled" boolean DEFAULT true NOT NULL,
    "telegram_enabled" boolean DEFAULT true NOT NULL,
    "email_enabled" boolean DEFAULT false NOT NULL,
    "sms_enabled" boolean DEFAULT false NOT NULL,
    "locale" "text" DEFAULT 'uz'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Tashkent'::"text" NOT NULL,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "allow_critical_override" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academy_guardian_notification_preferences_check" CHECK ((("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL)))
);

CREATE TABLE IF NOT EXISTS "public"."academy_guardian_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "relationship_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "sender_user_id" "uuid",
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "channel" "text" DEFAULT 'inapp'::"text" NOT NULL,
    "reply_to_message_id" "uuid",
    "provider_message_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    CONSTRAINT "academy_guardian_messages_channel_check" CHECK (("channel" = ANY (ARRAY['inapp'::"text", 'telegram'::"text", 'email'::"text", 'sms'::"text"]))),
    CONSTRAINT "academy_guardian_messages_direction_check" CHECK (("direction" = ANY (ARRAY['guardian_to_academy'::"text", 'academy_to_guardian'::"text"]))),
    CONSTRAINT "academy_guardian_messages_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'read'::"text", 'archived'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "channel" "text" DEFAULT 'telegram'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "body" "text" NOT NULL,
    "target" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guardian_id" "uuid",
    "relationship_id" "uuid",
    "event_key" "text",
    "dedupe_key" "text",
    "critical_override" boolean DEFAULT false NOT NULL,
    "user_id" "uuid",
    "category" "text" DEFAULT 'academic_required'::"text" NOT NULL,
    "suppression_reason" "text",
    "policy_decision" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cta_url" "text",
    "bot_kind" "text" DEFAULT 'student'::"text" NOT NULL,
    "audience_kind" "text" DEFAULT 'student_private'::"text" NOT NULL,
    "chat_binding_id" "uuid",
    "actor_user_id" "uuid",
    "telegram_message_id" bigint,
    "claimed_at" timestamp with time zone,
    "claim_token" "uuid",
    "last_attempt_at" timestamp with time zone,
    CONSTRAINT "academy_notifications_category_check" CHECK (("category" = ANY (ARRAY['transactional'::"text", 'academic_required'::"text", 'study_habit'::"text", 'commercial'::"text", 'system'::"text"]))),
    CONSTRAINT "academy_notifications_channel_check" CHECK (("channel" = ANY (ARRAY['telegram'::"text", 'email'::"text", 'inapp'::"text", 'sms'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_notification_delivery_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "attempt_number" integer NOT NULL,
    "channel" "text" NOT NULL,
    "provider" "text",
    "status" "text" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "provider_message_id" "text",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_notification_delivery_attempts_attempt_number_check" CHECK (("attempt_number" > 0)),
    CONSTRAINT "academy_notification_delivery_attempts_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "branch_id" "uuid",
    "classroom_id" "uuid",
    "charge_number" "text" NOT NULL,
    "cycle_key" "text",
    "charge_type" "text" DEFAULT 'tuition'::"text" NOT NULL,
    "service_period_start" "date",
    "service_period_end" "date",
    "issued_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_on" "date" NOT NULL,
    "original_amount" bigint NOT NULL,
    "discount_amount" bigint DEFAULT 0 NOT NULL,
    "net_amount" bigint NOT NULL,
    "currency" "text" DEFAULT 'UZS'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "description" "text",
    "idempotency_key" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academy_charges_charge_type_check" CHECK (("charge_type" = ANY (ARRAY['tuition'::"text", 'registration'::"text", 'materials'::"text", 'exam'::"text", 'lesson'::"text", 'package'::"text", 'installment'::"text", 'adjustment'::"text", 'other'::"text"]))),
    CONSTRAINT "academy_charges_check" CHECK (("discount_amount" <= "original_amount")),
    CONSTRAINT "academy_charges_check1" CHECK (("net_amount" = ("original_amount" - "discount_amount"))),
    CONSTRAINT "academy_charges_check2" CHECK ((("service_period_end" IS NULL) OR ("service_period_start" IS NULL) OR ("service_period_end" >= "service_period_start"))),
    CONSTRAINT "academy_charges_discount_amount_check" CHECK (("discount_amount" >= 0)),
    CONSTRAINT "academy_charges_net_amount_check" CHECK (("net_amount" >= 0)),
    CONSTRAINT "academy_charges_original_amount_check" CHECK (("original_amount" >= 0)),
    CONSTRAINT "academy_charges_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'partially_paid'::"text", 'paid'::"text", 'void'::"text", 'written_off'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "charge_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "allocation_kind" "text" DEFAULT 'application'::"text" NOT NULL,
    "reverses_allocation_id" "uuid",
    "idempotency_key" "text" NOT NULL,
    "allocated_by" "uuid" NOT NULL,
    "allocated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_payment_allocations_allocation_kind_check" CHECK (("allocation_kind" = ANY (ARRAY['application'::"text", 'reversal'::"text"]))),
    CONSTRAINT "academy_payment_allocations_amount_check" CHECK (("amount" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."academy_account_ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "charge_id" "uuid",
    "payment_id" "uuid",
    "entry_type" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason" "text",
    "idempotency_key" "text" NOT NULL,
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academy_account_ledger_entries_amount_check" CHECK (("amount" <> 0)),
    CONSTRAINT "academy_account_ledger_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['charge'::"text", 'payment_received'::"text", 'refund'::"text", 'account_credit'::"text", 'discount'::"text", 'write_off'::"text", 'debit_adjustment'::"text", 'credit_adjustment'::"text", 'transferred_credit'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."parent_report_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT "replace"((("gen_random_uuid"())::"text" || ("gen_random_uuid"())::"text"), '-'::"text", ''::"text") NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone,
    "last_viewed_at" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."academy_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "session_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'present'::"text" NOT NULL,
    "notes" "text",
    "marked_by" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "session_id" "uuid",
    CONSTRAINT "academy_attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text", 'excused'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "session_id" "uuid",
    "score" numeric,
    "max_score" numeric,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "graded_at" timestamp with time zone,
    "graded_by" "uuid",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submission_content" "text",
    "submission_url" "text",
    "attempt_number" integer DEFAULT 1 NOT NULL,
    "feedback" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_submissions_status_check" CHECK (("status" = ANY (ARRAY['missing'::"text", 'submitted'::"text", 'graded'::"text", 'late'::"text", 'returned'::"text", 'resubmitted'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assignment_type" "text" DEFAULT 'task'::"text" NOT NULL,
    "experience_id" "uuid",
    "due_at" timestamp with time zone,
    "released_at" timestamp with time zone DEFAULT "now"(),
    "prerequisite_id" "uuid",
    "position" integer DEFAULT 0 NOT NULL,
    "max_score" numeric,
    "score_weight" numeric DEFAULT 1.0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "experience_url" "text",
    "course_id" "uuid",
    "module_id" "uuid",
    "lesson_id" "uuid",
    "grade_category_id" "uuid",
    "rubric_id" "uuid",
    "attempts_allowed" integer DEFAULT 1 NOT NULL,
    "allow_late_submission" boolean DEFAULT true NOT NULL,
    CONSTRAINT "academy_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['task'::"text", 'test'::"text", 'lab'::"text", 'reading'::"text", 'writing'::"text", 'listening'::"text", 'speaking'::"text", 'custom'::"text"]))),
    CONSTRAINT "academy_assignments_attempts_allowed_check" CHECK ((("attempts_allowed" >= 1) AND ("attempts_allowed" <= 100))),
    CONSTRAINT "academy_assignments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_lesson_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "room_id" "uuid",
    "primary_staff_id" "uuid" NOT NULL,
    "calendar_id" "uuid",
    "title" "text" NOT NULL,
    "session_type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "delivery_mode" "text" DEFAULT 'physical'::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Tashkent'::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "source_schedule_id" "uuid",
    "source_session_id" "uuid",
    "cancellation_reason" "text",
    "rescheduled_to_session_id" "uuid",
    "idempotency_key" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slot" "tstzrange" GENERATED ALWAYS AS ("tstzrange"("starts_at", "ends_at", '[)'::"text")) STORED,
    "timetable_term_id" "uuid",
    "timetable_series_id" "uuid",
    "timetable_occurrence_date" "date",
    "timetable_generation_run_id" "uuid",
    CONSTRAINT "academy_lesson_sessions_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "academy_lesson_sessions_check1" CHECK ((("delivery_mode" <> 'physical'::"text") OR ("room_id" IS NOT NULL))),
    CONSTRAINT "academy_lesson_sessions_delivery_mode_check" CHECK (("delivery_mode" = ANY (ARRAY['physical'::"text", 'online'::"text", 'hybrid'::"text"]))),
    CONSTRAINT "academy_lesson_sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['regular'::"text", 'trial'::"text", 'make_up'::"text", 'exam'::"text", 'workshop'::"text", 'individual'::"text", 'other'::"text"]))),
    CONSTRAINT "academy_lesson_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'rescheduled'::"text", 'missed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "classroom_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."academy_classroom_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "url" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legacy_video_read_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "academy_classroom_resources_kind_check" CHECK (("kind" = ANY (ARRAY['video'::"text", 'book'::"text", 'asset'::"text", 'link'::"text", 'assignment'::"text", 'mock'::"text", 'practice'::"text", 'playbook'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "requester_kind" "text" NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "guardian_id" "uuid",
    "staff_id" "uuid",
    "classroom_id" "uuid",
    "charge_id" "uuid",
    "request_type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "details" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "desired_date" "date",
    "assigned_to" "uuid",
    "resolution" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "sla_due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_service_requests_check" CHECK (((("requester_kind" = 'student'::"text") AND ("contact_id" IS NOT NULL)) OR (("requester_kind" = 'guardian'::"text") AND ("guardian_id" IS NOT NULL) AND ("contact_id" IS NOT NULL)) OR (("requester_kind" = 'staff'::"text") AND ("staff_id" IS NOT NULL)))),
    CONSTRAINT "academy_service_requests_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "academy_service_requests_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "academy_service_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['make_up'::"text", 'freeze'::"text", 'transfer'::"text", 'refund'::"text", 'schedule_change'::"text", 'document'::"text", 'support'::"text", 'other'::"text"]))),
    CONSTRAINT "academy_service_requests_requester_kind_check" CHECK (("requester_kind" = ANY (ARRAY['student'::"text", 'guardian'::"text", 'staff'::"text"]))),
    CONSTRAINT "academy_service_requests_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'triaged'::"text", 'in_review'::"text", 'waiting_for_requester'::"text", 'approved'::"text", 'rejected'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."academy_service_request_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "note" "text",
    "actor_user_id" "uuid",
    "visible_to_requester" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_service_request_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['submitted'::"text", 'note'::"text", 'assigned'::"text", 'status_changed'::"text", 'requester_reply'::"text", 'resolved'::"text"]))),
    CONSTRAINT "academy_service_request_events_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text"))
);

CREATE TABLE IF NOT EXISTS "public"."academy_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academy_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "contact_id" "uuid",
    "classroom_id" "uuid",
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "branch_id" "uuid",
    "request_id" "text",
    "idempotency_key" "text",
    "before_snapshot" "jsonb",
    "after_snapshot" "jsonb",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "academy_audit_events_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'warning'::"text", 'error'::"text"])))
);

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_academy_id_idempotency_key_key" UNIQUE ("academy_id", "idempotency_key");

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_announcements"
    ADD CONSTRAINT "academy_announcements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_branches"
    ADD CONSTRAINT "academy_branches_academy_id_branch_key_key" UNIQUE ("academy_id", "branch_key");

ALTER TABLE ONLY "public"."academy_branches"
    ADD CONSTRAINT "academy_branches_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_branches"
    ADD CONSTRAINT "academy_branches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_charge_number_key" UNIQUE ("academy_id", "charge_number");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_contact_id_id_key" UNIQUE ("academy_id", "contact_id", "id");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_idempotency_key_key" UNIQUE ("academy_id", "idempotency_key");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_subscription_id_cycle_key_key" UNIQUE ("academy_id", "subscription_id", "cycle_key");

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_classroom_id_contact_id_key" UNIQUE ("classroom_id", "contact_id");

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_classroom_resources"
    ADD CONSTRAINT "academy_classroom_resources_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_classrooms"
    ADD CONSTRAINT "academy_classrooms_academy_id_name_key" UNIQUE ("academy_id", "name");

ALTER TABLE ONLY "public"."academy_classrooms"
    ADD CONSTRAINT "academy_classrooms_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_contacts"
    ADD CONSTRAINT "academy_contacts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_token_hash_key" UNIQUE ("token_hash");

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_guardian_notification_preferences"
    ADD CONSTRAINT "academy_guardian_notification_academy_id_guardian_id_event__key" UNIQUE ("academy_id", "guardian_id", "event_type");

ALTER TABLE ONLY "public"."academy_guardian_notification_preferences"
    ADD CONSTRAINT "academy_guardian_notification_preferences_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_guardian_notification_preferences"
    ADD CONSTRAINT "academy_guardian_notification_preferences_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_guardians"
    ADD CONSTRAINT "academy_guardians_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_guardians"
    ADD CONSTRAINT "academy_guardians_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_idempotency_key_key" UNIQUE ("academy_id", "idempotency_key");

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_notification_delivery_attempts"
    ADD CONSTRAINT "academy_notification_delivery_academy_id_notification_id_at_key" UNIQUE ("academy_id", "notification_id", "attempt_number");

ALTER TABLE ONLY "public"."academy_notification_delivery_attempts"
    ADD CONSTRAINT "academy_notification_delivery_attempts_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_notification_delivery_attempts"
    ADD CONSTRAINT "academy_notification_delivery_attempts_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_academy_id_idempotency_key_key" UNIQUE ("academy_id", "idempotency_key");

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_service_request_events"
    ADD CONSTRAINT "academy_service_request_events_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_service_request_events"
    ADD CONSTRAINT "academy_service_request_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_sessions_classroom_no_overlap" EXCLUDE USING "gist" ("academy_id" WITH =, "classroom_id" WITH =, "slot" WITH &&) WHERE (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'in_progress'::"text"])));

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_sessions_room_no_overlap" EXCLUDE USING "gist" ("academy_id" WITH =, "room_id" WITH =, "slot" WITH &&) WHERE ((("room_id" IS NOT NULL) AND ("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'in_progress'::"text"]))));

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_sessions_teacher_no_overlap" EXCLUDE USING "gist" ("academy_id" WITH =, "primary_staff_id" WITH =, "slot" WITH &&) WHERE (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'in_progress'::"text"])));

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationships_academy_id_id_key" UNIQUE ("academy_id", "id");

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationships_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_assignment_id_contact_id_key" UNIQUE ("assignment_id", "contact_id");

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parent_report_tokens"
    ADD CONSTRAINT "parent_report_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parent_report_tokens"
    ADD CONSTRAINT "parent_report_tokens_token_key" UNIQUE ("token");

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");

CREATE UNIQUE INDEX "academy_assignments_academy_id_id_uidx" ON "public"."academy_assignments" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_assignments_teacher_lesson_run_uidx" ON "public"."academy_assignments" USING "btree" ("academy_id", (("metadata" ->> 'teacher_lesson_run_id'::"text"))) WHERE ((("metadata" ->> 'source'::"text") = 'teacher_lesson_flow'::"text") AND (NULLIF(("metadata" ->> 'teacher_lesson_run_id'::"text"), ''::"text") IS NOT NULL));

CREATE UNIQUE INDEX "academy_assignments_telegram_idempotency_uidx" ON "public"."academy_assignments" USING "btree" ("academy_id", (("metadata" ->> 'telegram_idempotency_key'::"text"))) WHERE ((("metadata" ->> 'source'::"text") = 'academy_telegram'::"text") AND (NULLIF(("metadata" ->> 'telegram_idempotency_key'::"text"), ''::"text") IS NOT NULL));

CREATE UNIQUE INDEX "academy_attendance_academy_id_id_uidx" ON "public"."academy_attendance" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_attendance_legacy_unique_idx" ON "public"."academy_attendance" USING "btree" ("classroom_id", "contact_id", "session_date") WHERE ("session_id" IS NULL);

CREATE UNIQUE INDEX "academy_attendance_session_unique_idx" ON "public"."academy_attendance" USING "btree" ("academy_id", "session_id", "contact_id") WHERE ("session_id" IS NOT NULL);

CREATE UNIQUE INDEX "academy_audit_events_idempotency_uidx" ON "public"."academy_audit_events" USING "btree" ("academy_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);

CREATE UNIQUE INDEX "academy_branches_one_default_idx" ON "public"."academy_branches" USING "btree" ("academy_id") WHERE "is_default";

CREATE UNIQUE INDEX "academy_classroom_memberships_academy_id_id_uidx" ON "public"."academy_classroom_memberships" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_classroom_resources_academy_id_id_uidx" ON "public"."academy_classroom_resources" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_classrooms_academy_id_id_uidx" ON "public"."academy_classrooms" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_classrooms_id_academy_unique" ON "public"."academy_classrooms" USING "btree" ("id", "academy_id");

CREATE UNIQUE INDEX "academy_contacts_academy_email_unique" ON "public"."academy_contacts" USING "btree" ("academy_id", "lower"("email")) WHERE ("email" IS NOT NULL);

CREATE UNIQUE INDEX "academy_contacts_academy_id_id_uidx" ON "public"."academy_contacts" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_contacts_academy_phone_unique" ON "public"."academy_contacts" USING "btree" ("academy_id", "phone") WHERE ("phone" IS NOT NULL);

CREATE UNIQUE INDEX "academy_contacts_id_academy_unique" ON "public"."academy_contacts" USING "btree" ("id", "academy_id");

CREATE UNIQUE INDEX "academy_guardian_messages_academy_id_id_uidx" ON "public"."academy_guardian_messages" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_guardian_primary_contact_uidx" ON "public"."academy_student_guardian_relationships" USING "btree" ("academy_id", "contact_id") WHERE ("is_primary_contact" AND ("status" = 'active'::"text"));

CREATE UNIQUE INDEX "academy_guardian_relationship_active_uidx" ON "public"."academy_student_guardian_relationships" USING "btree" ("academy_id", "contact_id", "guardian_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text"]));

CREATE UNIQUE INDEX "academy_guardians_telegram_uidx" ON "public"."academy_guardians" USING "btree" ("academy_id", "telegram_user_id") WHERE (("telegram_user_id" IS NOT NULL) AND ("status" <> 'revoked'::"text"));

CREATE UNIQUE INDEX "academy_guardians_user_uidx" ON "public"."academy_guardians" USING "btree" ("academy_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'revoked'::"text"));

CREATE UNIQUE INDEX "academy_lesson_sessions_series_occurrence_uidx" ON "public"."academy_lesson_sessions" USING "btree" ("academy_id", "timetable_series_id", "timetable_occurrence_date") WHERE (("timetable_series_id" IS NOT NULL) AND ("timetable_occurrence_date" IS NOT NULL));

CREATE UNIQUE INDEX "academy_notifications_academy_id_id_uidx" ON "public"."academy_notifications" USING "btree" ("academy_id", "id");

CREATE UNIQUE INDEX "academy_notifications_dedupe_idx" ON "public"."academy_notifications" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);

CREATE UNIQUE INDEX "academy_notifications_dedupe_uidx" ON "public"."academy_notifications" USING "btree" ("academy_id", "dedupe_key") WHERE ("dedupe_key" IS NOT NULL);

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entrie_academy_id_contact_id_charge_fkey" FOREIGN KEY ("academy_id", "contact_id", "charge_id") REFERENCES "public"."academy_charges"("academy_id", "contact_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_academy_id_contact_id_fkey" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_account_ledger_entries"
    ADD CONSTRAINT "academy_account_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_announcements"
    ADD CONSTRAINT "academy_announcements_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_announcements"
    ADD CONSTRAINT "academy_announcements_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_announcements"
    ADD CONSTRAINT "academy_announcements_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE SET NULL ("classroom_id");

ALTER TABLE ONLY "public"."academy_announcements"
    ADD CONSTRAINT "academy_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "public"."academy_assignments"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_assignments"
    ADD CONSTRAINT "academy_assignments_prerequisite_tenant_fk" FOREIGN KEY ("academy_id", "prerequisite_id") REFERENCES "public"."academy_assignments"("academy_id", "id") ON DELETE SET NULL ("prerequisite_id");

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_contact_tenant_fk" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_session_fk" FOREIGN KEY ("academy_id", "session_id") REFERENCES "public"."academy_lesson_sessions"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_attendance"
    ADD CONSTRAINT "academy_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_branch_fk" FOREIGN KEY ("academy_id", "branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE SET NULL ("classroom_id");

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_audit_events"
    ADD CONSTRAINT "academy_audit_events_contact_tenant_fk" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE SET NULL ("contact_id");

ALTER TABLE ONLY "public"."academy_branches"
    ADD CONSTRAINT "academy_branches_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_branches"
    ADD CONSTRAINT "academy_branches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_branch_id_fkey" FOREIGN KEY ("academy_id", "branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_classroom_id_fkey" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_contact_id_fkey" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_charges"
    ADD CONSTRAINT "academy_charges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_classroom_memberships_transferred_from_membership__fkey" FOREIGN KEY ("transferred_from_membership_id") REFERENCES "public"."academy_classroom_memberships"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_classroom_resources"
    ADD CONSTRAINT "academy_classroom_resources_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_resources"
    ADD CONSTRAINT "academy_classroom_resources_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."academy_classrooms"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_resources"
    ADD CONSTRAINT "academy_classroom_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_classrooms"
    ADD CONSTRAINT "academy_classrooms_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classrooms"
    ADD CONSTRAINT "academy_classrooms_branch_fk" FOREIGN KEY ("academy_id", "branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_classrooms"
    ADD CONSTRAINT "academy_classrooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_contacts"
    ADD CONSTRAINT "academy_contacts_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_contacts"
    ADD CONSTRAINT "academy_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_contacts"
    ADD CONSTRAINT "academy_contacts_primary_branch_fk" FOREIGN KEY ("academy_id", "primary_branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_contacts"
    ADD CONSTRAINT "academy_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_academy_id_relationship_id_fkey" FOREIGN KEY ("academy_id", "relationship_id") REFERENCES "public"."academy_student_guardian_relationships"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_consents"
    ADD CONSTRAINT "academy_guardian_consents_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_academy_id_relationship_id_fkey" FOREIGN KEY ("academy_id", "relationship_id") REFERENCES "public"."academy_student_guardian_relationships"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_link_tokens"
    ADD CONSTRAINT "academy_guardian_link_tokens_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_academy_id_relationship_id_fkey" FOREIGN KEY ("academy_id", "relationship_id") REFERENCES "public"."academy_student_guardian_relationships"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_reply_tenant_fk" FOREIGN KEY ("academy_id", "reply_to_message_id") REFERENCES "public"."academy_guardian_messages"("academy_id", "id") ON DELETE SET NULL ("reply_to_message_id");

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."academy_guardian_messages"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_messages"
    ADD CONSTRAINT "academy_guardian_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardian_notification_preferences"
    ADD CONSTRAINT "academy_guardian_notification_prefe_academy_id_guardian_id_fkey" FOREIGN KEY ("academy_id", "guardian_id") REFERENCES "public"."academy_guardians"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardian_notification_preferences"
    ADD CONSTRAINT "academy_guardian_notification_preferences_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardians"
    ADD CONSTRAINT "academy_guardians_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_guardians"
    ADD CONSTRAINT "academy_guardians_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_guardians"
    ADD CONSTRAINT "academy_guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_branch_id_fkey" FOREIGN KEY ("academy_id", "branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_classroom_id_fkey" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_rescheduled_to_session__fkey" FOREIGN KEY ("academy_id", "rescheduled_to_session_id") REFERENCES "public"."academy_lesson_sessions"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_academy_id_source_session_id_fkey" FOREIGN KEY ("academy_id", "source_session_id") REFERENCES "public"."academy_lesson_sessions"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_lesson_sessions"
    ADD CONSTRAINT "academy_lesson_sessions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_memberships_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_memberships_contact_tenant_fk" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_classroom_memberships"
    ADD CONSTRAINT "academy_memberships_transfer_tenant_fk" FOREIGN KEY ("academy_id", "transferred_from_membership_id") REFERENCES "public"."academy_classroom_memberships"("academy_id", "id") ON DELETE SET NULL ("transferred_from_membership_id");

ALTER TABLE ONLY "public"."academy_notification_delivery_attempts"
    ADD CONSTRAINT "academy_notification_delivery_a_academy_id_notification_id_fkey" FOREIGN KEY ("academy_id", "notification_id") REFERENCES "public"."academy_notifications"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_notification_delivery_attempts"
    ADD CONSTRAINT "academy_notification_delivery_attempts_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_contact_tenant_fk" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_guardian_fk" FOREIGN KEY ("academy_id", "guardian_id") REFERENCES "public"."academy_guardians"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_relationship_fk" FOREIGN KEY ("academy_id", "relationship_id") REFERENCES "public"."academy_student_guardian_relationships"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_notifications"
    ADD CONSTRAINT "academy_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_academy_id_charge_id_fkey" FOREIGN KEY ("academy_id", "charge_id") REFERENCES "public"."academy_charges"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_academy_id_reverses_allocation_fkey" FOREIGN KEY ("academy_id", "reverses_allocation_id") REFERENCES "public"."academy_payment_allocations"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_payment_allocations"
    ADD CONSTRAINT "academy_payment_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_classroom_resources"
    ADD CONSTRAINT "academy_resources_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_service_request_events"
    ADD CONSTRAINT "academy_service_request_events_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_service_request_events"
    ADD CONSTRAINT "academy_service_request_events_academy_id_request_id_fkey" FOREIGN KEY ("academy_id", "request_id") REFERENCES "public"."academy_service_requests"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_service_request_events"
    ADD CONSTRAINT "academy_service_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_branch_id_fkey" FOREIGN KEY ("academy_id", "branch_id") REFERENCES "public"."academy_branches"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_charge_id_fkey" FOREIGN KEY ("academy_id", "charge_id") REFERENCES "public"."academy_charges"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_classroom_id_fkey" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_contact_id_fkey" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_academy_id_guardian_id_fkey" FOREIGN KEY ("academy_id", "guardian_id") REFERENCES "public"."academy_guardians"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_service_requests"
    ADD CONSTRAINT "academy_service_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationsh_academy_id_guardian_id_fkey" FOREIGN KEY ("academy_id", "guardian_id") REFERENCES "public"."academy_guardians"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationshi_academy_id_contact_id_fkey" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationships_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationships_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_student_guardian_relationships"
    ADD CONSTRAINT "academy_student_guardian_relationships_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."academy_assignments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_assignment_tenant_fk" FOREIGN KEY ("academy_id", "assignment_id") REFERENCES "public"."academy_assignments"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_classroom_tenant_fk" FOREIGN KEY ("academy_id", "classroom_id") REFERENCES "public"."academy_classrooms"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_contact_tenant_fk" FOREIGN KEY ("academy_id", "contact_id") REFERENCES "public"."academy_contacts"("academy_id", "id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."academy_submissions"
    ADD CONSTRAINT "academy_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parent_report_tokens"
    ADD CONSTRAINT "parent_report_tokens_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parent_report_tokens"
    ADD CONSTRAINT "parent_report_tokens_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."academy_contacts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parent_report_tokens"
    ADD CONSTRAINT "parent_report_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

CREATE OR REPLACE VIEW "public"."academy_charge_balances" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."academy_id",
    "c"."contact_id",
    "c"."subscription_id",
    "c"."branch_id",
    "c"."classroom_id",
    "c"."charge_number",
    "c"."cycle_key",
    "c"."charge_type",
    "c"."service_period_start",
    "c"."service_period_end",
    "c"."issued_on",
    "c"."due_on",
    "c"."original_amount",
    "c"."discount_amount",
    "c"."net_amount",
    "c"."currency",
    "c"."status",
    "c"."description",
    "c"."idempotency_key",
    "c"."metadata",
    "c"."created_by",
    "c"."created_at",
    "c"."updated_at",
    COALESCE("a"."allocated_amount", (0)::bigint) AS "allocated_amount",
    COALESCE("j"."adjustment_amount", (0)::bigint) AS "adjustment_amount",
    GREATEST(("c"."net_amount" + COALESCE("j"."adjustment_amount", (0)::bigint)), (0)::bigint) AS "effective_amount",
    GREATEST((("c"."net_amount" + COALESCE("j"."adjustment_amount", (0)::bigint)) - COALESCE("a"."allocated_amount", (0)::bigint)), (0)::bigint) AS "outstanding_amount",
        CASE
            WHEN ("c"."status" = 'void'::"text") THEN "c"."status"
            WHEN ((GREATEST((("c"."net_amount" + COALESCE("j"."adjustment_amount", (0)::bigint)) - COALESCE("a"."allocated_amount", (0)::bigint)), (0)::bigint) = 0) AND COALESCE("j"."has_write_off", false)) THEN 'written_off'::"text"
            WHEN (GREATEST((("c"."net_amount" + COALESCE("j"."adjustment_amount", (0)::bigint)) - COALESCE("a"."allocated_amount", (0)::bigint)), (0)::bigint) = 0) THEN 'paid'::"text"
            WHEN (COALESCE("a"."allocated_amount", (0)::bigint) > 0) THEN 'partially_paid'::"text"
            ELSE 'open'::"text"
        END AS "calculated_status",
    GREATEST((CURRENT_DATE - "c"."due_on"), 0) AS "days_overdue",
        CASE
            WHEN (CURRENT_DATE <= "c"."due_on") THEN 'current'::"text"
            WHEN ((CURRENT_DATE - "c"."due_on") <= 7) THEN '1-7'::"text"
            WHEN ((CURRENT_DATE - "c"."due_on") <= 14) THEN '8-14'::"text"
            WHEN ((CURRENT_DATE - "c"."due_on") <= 30) THEN '15-30'::"text"
            WHEN ((CURRENT_DATE - "c"."due_on") <= 60) THEN '31-60'::"text"
            ELSE '60+'::"text"
        END AS "aging_bucket"
   FROM (("public"."academy_charges" "c"
     LEFT JOIN ( SELECT "academy_payment_allocations"."academy_id",
            "academy_payment_allocations"."charge_id",
            ("sum"(
                CASE
                    WHEN ("academy_payment_allocations"."allocation_kind" = 'application'::"text") THEN "academy_payment_allocations"."amount"
                    ELSE (- "academy_payment_allocations"."amount")
                END))::bigint AS "allocated_amount"
           FROM "public"."academy_payment_allocations"
          GROUP BY "academy_payment_allocations"."academy_id", "academy_payment_allocations"."charge_id") "a" ON ((("a"."academy_id" = "c"."academy_id") AND ("a"."charge_id" = "c"."id"))))
     LEFT JOIN ( SELECT "academy_account_ledger_entries"."academy_id",
            "academy_account_ledger_entries"."charge_id",
            ("sum"("academy_account_ledger_entries"."amount"))::bigint AS "adjustment_amount",
            "bool_or"(("academy_account_ledger_entries"."entry_type" = 'write_off'::"text")) AS "has_write_off"
           FROM "public"."academy_account_ledger_entries"
          WHERE (("academy_account_ledger_entries"."charge_id" IS NOT NULL) AND ("academy_account_ledger_entries"."entry_type" <> 'charge'::"text"))
          GROUP BY "academy_account_ledger_entries"."academy_id", "academy_account_ledger_entries"."charge_id") "j" ON ((("j"."academy_id" = "c"."academy_id") AND ("j"."charge_id" = "c"."id"))));

CREATE OR REPLACE VIEW "public"."academy_account_balances" WITH ("security_invoker"='true') AS
 SELECT "academy_id",
    "contact_id",
    "currency",
    ("sum"("amount"))::bigint AS "balance",
    ("sum"(
        CASE
            WHEN ("amount" > 0) THEN "amount"
            ELSE (0)::bigint
        END))::bigint AS "debits",
    (- ("sum"(
        CASE
            WHEN ("amount" < 0) THEN "amount"
            ELSE (0)::bigint
        END))::bigint) AS "credits",
    "max"("effective_at") AS "last_entry_at"
   FROM "public"."academy_account_ledger_entries" "l"
  GROUP BY "academy_id", "contact_id", "currency";
