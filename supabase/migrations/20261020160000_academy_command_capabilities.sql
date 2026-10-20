-- Capability roles mirror the reviewed Edge matrix. Scope stays attached to
-- each current authority entry and is never inherited from presentation rank.
begin;
create or replace function public.academy_command_role_has(p_role text,p_capability text)
returns boolean language sql immutable set search_path=public as $$
 select coalesce(($roles${
 "viewAcademy": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "manageAcademy": [
  "owner",
  "admin",
  "center_admin"
 ],
 "manageStaff": [
  "owner",
  "admin",
  "center_admin"
 ],
 "manageFinance": [
  "owner",
  "admin",
  "center_admin"
 ],
 "viewFinance": [
  "owner",
  "admin",
  "center_admin",
  "branch_manager",
  "cashier",
  "accountant"
 ],
 "collectFinance": [
  "owner",
  "admin",
  "center_admin",
  "branch_manager",
  "cashier",
  "accountant"
 ],
 "adjustFinance": [
  "owner",
  "admin",
  "center_admin",
  "accountant"
 ],
 "refundFinance": [
  "owner",
  "admin",
  "accountant"
 ],
 "discountFinance": [
  "owner",
  "admin",
  "center_admin"
 ],
 "reconcileFinance": [
  "owner",
  "admin",
  "center_admin",
  "accountant"
 ],
 "manageCashier": [
  "owner",
  "admin",
  "center_admin",
  "branch_manager",
  "cashier"
 ],
 "viewEconomics": [
  "owner",
  "admin",
  "center_admin",
  "accountant"
 ],
 "viewPayroll": [
  "owner",
  "admin",
  "center_admin",
  "payroll_officer"
 ],
 "calculatePayroll": [
  "owner",
  "admin",
  "center_admin",
  "payroll_officer"
 ],
 "approvePayroll": [
  "owner",
  "admin"
 ],
 "payPayroll": [
  "owner",
  "admin"
 ],
 "manageOffers": [
  "owner",
  "admin",
  "center_admin"
 ],
 "manageBranding": [
  "owner",
  "admin",
  "center_admin"
 ],
 "manageAutomation": [
  "owner",
  "admin",
  "center_admin"
 ],
 "viewAutomation": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "viewBranches": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageBranches": [
  "owner",
  "admin",
  "center_admin"
 ],
 "viewAdmissions": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson"
 ],
 "manageAdmissions": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson"
 ],
 "assignAdmissions": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "exportAdmissions": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor"
 ],
 "manageTrialFeedback": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "viewContacts": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageContacts": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "parent_liaison"
 ],
 "viewClassrooms": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageClassrooms": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "manageRoster": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "manageMessages": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageAnnouncements": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "sendGlobalAnnouncements": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "manageAlerts": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "resolveAlerts": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "viewEducationOS": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "resolveActionItems": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageAssignments": [
  "owner",
  "admin",
  "teacher",
  "assistant"
 ],
 "gradeSubmissions": [
  "owner",
  "admin",
  "teacher",
  "assistant"
 ],
 "markAttendance": [
  "owner",
  "admin",
  "receptionist",
  "teacher",
  "assistant"
 ],
 "manageSchedule": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "teacher",
  "assistant"
 ],
 "manageAcademicOperations": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "viewRoomTimetable": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist"
 ],
 "manageGuardians": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "parent_liaison"
 ],
 "communicateGuardians": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "parent_liaison",
  "teacher",
  "assistant"
 ],
 "manageRetention": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "viewBusinessIntelligence": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "accountant"
 ],
 "viewAcademicReports": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "accountant",
  "teacher",
  "assistant"
 ],
 "viewOperationalReports": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "accountant"
 ],
 "viewFinancialReports": [
  "owner",
  "admin",
  "center_admin",
  "accountant"
 ],
 "viewStaffPerformance": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "viewRisk": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "parent_liaison"
 ],
 "manageImports": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor"
 ],
 "importStudents": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist"
 ],
 "manageLocalization": [
  "owner",
  "admin",
  "center_admin"
 ],
 "useAcademyAI": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager"
 ],
 "manageResources": [
  "owner",
  "admin",
  "teacher",
  "assistant"
 ],
 "viewReports": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "accountant"
 ],
 "issueCertificates": [
  "owner",
  "admin"
 ],
 "dispatchNotifications": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "parent_liaison"
 ],
 "viewNotifications": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "receptionist",
  "parent_liaison"
 ],
 "viewReferrals": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "branch_manager",
  "salesperson"
 ],
 "viewAudit": [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "accountant"
 ]
}$roles$::jsonb->p_capability)?p_role,false);
$$;
revoke all on function public.academy_command_role_has(text,text) from public,anon,authenticated,service_role;
commit;
