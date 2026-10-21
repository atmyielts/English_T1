// Closed inventory of existing legacy actions; current private commands keep their own authority.
export const legacyBoundaryPolicy = {
  "readActions": {
    "teacher_day": [
      "manageSchedule"
    ],
    "summary": [
      "viewContacts"
    ],
    "conversations": [
      "manageMessages"
    ],
    "conversation-messages": [
      "manageMessages"
    ],
    "announcements": [
      "manageAnnouncements"
    ],
    "alerts": [
      "manageAlerts"
    ],
    "offers": [
      "manageOffers"
    ],
    "offer-grants": [
      "manageOffers"
    ],
    "payments": [
      "manageFinance"
    ],
    "curriculum": [
      "manageAssignments"
    ],
    "quizzes": [
      "manageAssignments"
    ],
    "grade_categories": [
      "gradeSubmissions"
    ],
    "rubrics": [
      "gradeSubmissions"
    ],
    "quiz_attempts": [
      "gradeSubmissions"
    ],
    "assignments": [
      "manageAssignments"
    ],
    "submissions": [
      "gradeSubmissions"
    ],
    "student_progress": [
      "viewContacts"
    ],
    "attendance": [
      "markAttendance"
    ],
    "bulk_invites": [
      "manageRoster"
    ],
    "referral_leaderboard": [
      "viewReferrals"
    ],
    "owner_dashboard": [
      "viewAcademy"
    ],
    "education_os": [
      "viewEducationOS"
    ],
    "business_foundation": [
      "viewAdmissions"
    ],
    "guardian_relationships": [
      "manageGuardians"
    ],
    "academic_operations": [
      "manageAcademicOperations"
    ],
    "business_intelligence": [
      "viewBusinessIntelligence"
    ],
    "global_search": [
      "viewBusinessIntelligence"
    ],
    "automation_rules": [
      "manageAutomation"
    ],
    "branding": [
      "manageBranding"
    ],
    "notifications": [
      "viewNotifications"
    ],
    "audit_events": [
      "viewAudit"
    ],
    "classroom_billing": [
      "manageFinance"
    ],
    "schedule": [
      "manageSchedule"
    ],
    "timetable_planning": [
      "manageAcademicOperations"
    ],
    "service_requests": [
      "manageRetention",
      "manageAcademicOperations",
      "refundFinance"
    ],
    "communication_journeys": [
      "viewAutomation",
      "manageAutomation"
    ],
    "collection_cases": [
      "viewFinance",
      "collectFinance"
    ],
    "workforce_requests": [
      "manageStaff",
      "manageAcademicOperations",
      "viewPayroll",
      "viewClassrooms"
    ],
    "sensitive_cases": [
      "manageRetention"
    ],
    "competency_plans": [
      "manageAssignments",
      "viewAcademicReports"
    ],
    "integration_endpoints": [
      "manageAcademy",
      "manageAutomation"
    ],
    "entitlements": [
      "manageFinance",
      "manageOffers"
    ]
  },
  "writeActions": {
    "resolve_action_item": [
      "resolveActionItems"
    ],
    "set_lifecycle_stage": [
      "manageContacts"
    ],
    "upsert_automation_rule": [
      "manageAutomation"
    ],
    "run_automation_rules": [
      "manageAutomation"
    ],
    "create_automation_version": [
      "manageAutomation"
    ],
    "execute_automation_event": [
      "manageAutomation"
    ],
    "review_automation_execution": [
      "manageAutomation"
    ],
    "request_ai_assistance": [
      "useAcademyAI"
    ],
    "review_ai_assistance": [
      "useAcademyAI"
    ],
    "upsert_localization": [
      "manageLocalization"
    ],
    "upsert_campaign": [
      "exportAdmissions"
    ],
    "upsert_staff_branch_assignment": [
      "manageStaff"
    ],
    "upsert_branch": [
      "manageBranches"
    ],
    "upsert_room": [
      "manageBranches"
    ],
    "create_lead": [
      "manageAdmissions"
    ],
    "transition_lead": [
      "manageAdmissions"
    ],
    "record_lead_activity": [
      "manageAdmissions"
    ],
    "schedule_trial": [
      "manageAdmissions"
    ],
    "set_trial_status": [
      "manageTrialFeedback"
    ],
    "convert_lead": [
      "manageAdmissions"
    ],
    "convert_lead_full": [
      "manageAdmissions"
    ],
    "create_pricing_plan": [
      "manageFinance"
    ],
    "create_subscription": [
      "manageFinance"
    ],
    "manage_subscription": [
      "manageFinance"
    ],
    "create_charge": [
      "manageFinance"
    ],
    "allocate_payment": [
      "collectFinance"
    ],
    "post_account_adjustment": [
      "adjustFinance"
    ],
    "record_payment_reconciliation": [
      "reconcileFinance"
    ],
    "record_payment_promise": [
      "collectFinance"
    ],
    "create_cashbox": [
      "manageCashier"
    ],
    "open_cashier_shift": [
      "manageCashier"
    ],
    "record_cash_movement": [
      "manageCashier"
    ],
    "close_cashier_shift": [
      "manageCashier"
    ],
    "upsert_expense_category": [
      "manageFinance"
    ],
    "record_expense": [
      "manageFinance"
    ],
    "upsert_budget": [
      "manageFinance"
    ],
    "upsert_compensation_rule": [
      "calculatePayroll"
    ],
    "record_lesson_delivery": [
      "calculatePayroll"
    ],
    "create_payroll_period": [
      "calculatePayroll"
    ],
    "calculate_payroll": [
      "calculatePayroll"
    ],
    "post_payroll_adjustment": [
      "calculatePayroll"
    ],
    "transition_payroll": [
      "viewPayroll"
    ],
    "upsert_academic_calendar": [
      "manageAcademicOperations"
    ],
    "upsert_calendar_event": [
      "manageAcademicOperations"
    ],
    "upsert_staff_availability": [
      "manageAcademicOperations"
    ],
    "upsert_room_availability": [
      "manageAcademicOperations"
    ],
    "create_lesson_session": [
      "manageAcademicOperations"
    ],
    "upsert_session_delivery": [
      "manageAcademicOperations"
    ],
    "transition_lesson_session": [
      "manageAcademicOperations"
    ],
    "assign_session_substitute": [
      "manageAcademicOperations"
    ],
    "record_session_attendance": [
      "markAttendance"
    ],
    "record_attendance_exception": [
      "manageAcademicOperations"
    ],
    "upsert_make_up_lesson": [
      "manageAcademicOperations"
    ],
    "record_session_quality_review": [
      "manageAcademicOperations"
    ],
    "create_guardian_relationship": [
      "manageGuardians"
    ],
    "issue_guardian_link": [
      "manageGuardians"
    ],
    "revoke_guardian_relationship": [
      "manageGuardians"
    ],
    "upsert_guardian_preferences": [
      "manageGuardians"
    ],
    "queue_guardian_notification": [
      "communicateGuardians"
    ],
    "send_guardian_message": [
      "communicateGuardians"
    ],
    "upsert_risk_definition": [
      "manageRetention"
    ],
    "evaluate_retention_risk": [
      "manageRetention"
    ],
    "create_intervention": [
      "manageRetention"
    ],
    "update_intervention": [
      "manageRetention"
    ],
    "record_intervention_activity": [
      "manageRetention"
    ],
    "upsert_renewal_opportunity": [
      "manageRetention"
    ],
    "record_renewal_activity": [
      "manageRetention"
    ],
    "update_operational_action": [
      "resolveActionItems"
    ],
    "create_import_job": [
      "manageImports"
    ],
    "add_import_row": [
      "manageImports"
    ],
    "commit_import_job": [
      "manageImports"
    ],
    "rollback_import_job": [
      "manageImports"
    ],
    "update_academy_landing": [
      "manageAcademy"
    ],
    "update_classroom_landing": [
      "manageClassrooms"
    ],
    "upsert_contact": [
      "manageContacts"
    ],
    "create_classroom": [
      "manageClassrooms"
    ],
    "upsert_classroom_membership": [
      "manageRoster"
    ],
    "remove_classroom_membership": [
      "manageRoster"
    ],
    "send_message": [
      "manageMessages"
    ],
    "send_announcement": [
      "manageAnnouncements"
    ],
    "create_alert": [
      "manageAlerts"
    ],
    "resolve_alert": [
      "resolveAlerts"
    ],
    "create_offer": [
      "manageOffers"
    ],
    "upsert_offer_grant": [
      "manageOffers"
    ],
    "create_payment": [
      "collectFinance"
    ],
    "mark_payment_paid": [
      "collectFinance"
    ],
    "grant_contact": [
      "manageOffers"
    ],
    "create_assignment": [
      "manageAssignments"
    ],
    "update_assignment": [
      "manageAssignments"
    ],
    "upsert_course": [
      "manageAssignments"
    ],
    "publish_course": [
      "manageAssignments"
    ],
    "assign_course": [
      "manageAssignments"
    ],
    "upsert_module": [
      "manageAssignments"
    ],
    "upsert_lesson": [
      "manageAssignments"
    ],
    "upsert_quiz": [
      "manageAssignments"
    ],
    "upsert_quiz_question": [
      "manageAssignments"
    ],
    "upsert_grade_category": [
      "gradeSubmissions"
    ],
    "upsert_rubric": [
      "gradeSubmissions"
    ],
    "grade_quiz_attempt": [
      "gradeSubmissions"
    ],
    "set_enrollment_status": [
      "manageRoster"
    ],
    "grade_submission": [
      "gradeSubmissions"
    ],
    "mark_attendance": [
      "markAttendance"
    ],
    "bulk_invite": [
      "manageRoster"
    ],
    "update_classroom_settings": [
      "manageClassrooms"
    ],
    "export_gradebook": [
      "gradeSubmissions"
    ],
    "upsert_schedule": [
      "manageSchedule"
    ],
    "delete_schedule": [
      "manageSchedule"
    ],
    "record_placement": [
      "manageContacts"
    ],
    "upsert_staff": [
      "manageStaff"
    ],
    "remove_staff": [
      "manageStaff"
    ],
    "issue_academy_certificate": [
      "issueCertificates"
    ],
    "compute_at_risk": [
      "viewEducationOS"
    ],
    "generate_classroom_lesson_plan": [
      "viewEducationOS"
    ],
    "dispatch_notifications": [
      "dispatchNotifications"
    ],
    "generate_morning_brief": [
      "dispatchNotifications"
    ],
    "generate_parent_report": [
      "viewReports"
    ],
    "upsert_branding": [
      "manageBranding"
    ],
    "upsert_timetable_term": [
      "manageAcademicOperations"
    ],
    "upsert_timetable_series": [
      "manageAcademicOperations"
    ],
    "generate_timetable": [
      "manageAcademicOperations"
    ],
    "upsert_communication_journey": [
      "manageAutomation"
    ],
    "enroll_communication_journey": [
      "manageAutomation"
    ],
    "advance_communication_journeys": [
      "dispatchNotifications"
    ],
    "upsert_collection_case": [
      "collectFinance"
    ],
    "record_collection_attempt": [
      "collectFinance"
    ],
    "create_sensitive_case": [
      "manageRetention"
    ],
    "update_sensitive_case": [
      "manageRetention"
    ],
    "upsert_competency_framework": [
      "manageAssignments"
    ],
    "upsert_competency": [
      "manageAssignments"
    ],
    "upsert_learning_plan": [
      "manageAssignments"
    ],
    "record_competency_evidence": [
      "gradeSubmissions"
    ],
    "upsert_integration_endpoint": [
      "manageAutomation"
    ],
    "queue_integration_event": [
      "manageAutomation"
    ],
    "dispatch_integration_events": [
      "manageAutomation"
    ],
    "classroom-chat": [
      "viewClassrooms"
    ],
    "classroom-chat-send": [
      "manageMessages"
    ],
    "classroom-resource-upsert": [
      "manageResources"
    ],
    "classroom-resource-delete": [
      "manageResources"
    ]
  },
  "relations": [
    "academy_academic_calendars",
    "academy_access_audit_logs",
    "academy_access_invitations",
    "academy_account_balances",
    "academy_account_ledger_entries",
    "academy_action_items",
    "academy_ai_assistance_requests",
    "academy_ai_assistance_reviews",
    "academy_alerts",
    "academy_announcements",
    "academy_assignments",
    "academy_attendance",
    "academy_attendance_exceptions",
    "academy_audit_events",
    "academy_automation_effects",
    "academy_automation_executions",
    "academy_automation_rule_versions",
    "academy_automation_rules",
    "academy_branch_comparison_v2",
    "academy_branch_contribution",
    "academy_branches",
    "academy_branding",
    "academy_budgets",
    "academy_bulk_invites",
    "academy_business_dashboard_v2",
    "academy_calendar_events",
    "academy_cash_movements",
    "academy_cash_reconciliations",
    "academy_cashboxes",
    "academy_cashier_shifts",
    "academy_charge_balances",
    "academy_classroom_capacity_summary",
    "academy_classroom_contribution",
    "academy_classroom_courses",
    "academy_classroom_memberships",
    "academy_classroom_resource_progress",
    "academy_classroom_resources",
    "academy_classroom_schedules",
    "academy_classrooms",
    "academy_collection_attempts",
    "academy_collection_cases",
    "academy_collection_events",
    "academy_communication_enrollments",
    "academy_communication_journey_steps",
    "academy_communication_journeys",
    "academy_compensation_rules",
    "academy_competencies",
    "academy_competency_evidence",
    "academy_competency_frameworks",
    "academy_contacts",
    "academy_conversations",
    "academy_course_modules",
    "academy_courses",
    "academy_debt_cases",
    "academy_entitlements",
    "academy_expense_categories",
    "academy_expenses",
    "academy_export_jobs",
    "academy_grade_categories",
    "academy_guardian_consents",
    "academy_guardian_link_tokens",
    "academy_guardian_messages",
    "academy_guardian_notification_preferences",
    "academy_guardians",
    "academy_import_effects",
    "academy_import_jobs",
    "academy_import_rows",
    "academy_integration_deliveries",
    "academy_integration_endpoints",
    "academy_intervention_activities",
    "academy_intervention_cases",
    "academy_lead_activities",
    "academy_lead_conversions",
    "academy_lead_sources",
    "academy_leads",
    "academy_learning_plan_items",
    "academy_learning_plans",
    "academy_lesson_deliveries",
    "academy_lesson_media",
    "academy_lesson_progress",
    "academy_lesson_sessions",
    "academy_lessons",
    "academy_localization_settings",
    "academy_make_up_lessons",
    "academy_marketing_attribution_metrics",
    "academy_marketing_campaigns",
    "academy_messages",
    "academy_metric_definitions",
    "academy_notification_delivery_attempts",
    "academy_notifications",
    "academy_offer_grants",
    "academy_offers",
    "academy_owner_intelligence",
    "academy_payment_allocations",
    "academy_payment_promises",
    "academy_payment_reconciliations",
    "academy_payments",
    "academy_payroll_adjustments",
    "academy_payroll_payouts",
    "academy_payroll_periods",
    "academy_payroll_row_totals",
    "academy_pipeline_stages",
    "academy_pipeline_transitions",
    "academy_pricing_adjustments",
    "academy_pricing_plans",
    "academy_quiz_attempts",
    "academy_quiz_questions",
    "academy_quizzes",
    "academy_referrals",
    "academy_renewal_activities",
    "academy_renewal_opportunities",
    "academy_risk_definitions",
    "academy_risk_evaluations",
    "academy_risk_signals",
    "academy_role_grants",
    "academy_room_availability",
    "academy_room_capacity_summary",
    "academy_room_peak_periods",
    "academy_rooms",
    "academy_rubrics",
    "academy_sensitive_case_events",
    "academy_sensitive_cases",
    "academy_service_request_events",
    "academy_service_requests",
    "academy_session_delivery",
    "academy_session_quality_reviews",
    "academy_session_staff_assignments",
    "academy_staff",
    "academy_staff_availability",
    "academy_staff_branch_assignments",
    "academy_staff_performance_metrics",
    "academy_staff_requests",
    "academy_student_guardian_relationships",
    "academy_student_lifecycle_events",
    "academy_submissions",
    "academy_subscription_freezes",
    "academy_subscriptions",
    "academy_teacher_lesson_runs",
    "academy_teacher_performance_metrics",
    "academy_telegram_chats",
    "academy_timetable_generation_runs",
    "academy_timetable_series",
    "academy_timetable_terms",
    "academy_translation_overrides",
    "academy_trial_lessons",
    "academy_unified_student_intelligence",
    "academy_unit_economics_metrics",
    "academy_video_assets",
    "academy_wallet_policy_status",
    "domain_event_outbox",
    "evaluations",
    "exam_registrations",
    "issued_certificates",
    "parent_report_tokens",
    "partner_center_profiles",
    "partner_vouchers",
    "sales_leads",
    "tenant_memberships",
    "tenants",
    "users"
  ],
  "sharedReadRelations": [
    "academy_lead_sources",
    "academy_pipeline_stages",
    "academy_pipeline_transitions",
    "academy_risk_definitions",
    "academy_metric_definitions",
    "academy_localization_settings",
    "academy_translation_overrides",
    "academy_competency_frameworks",
    "academy_competencies",
    "academy_grade_categories",
    "academy_rubrics",
    "academy_expense_categories",
    "academy_automation_rules"
  ]
} as const;
