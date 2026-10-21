# Teacher retention acceptance

The selected period compares each teacher's students at its beginning with their state at its end. Students who join later do not inflate the starting cohort. A student appears once per teacher even when enrolled in several of that teacher's groups. Current `viewStaffPerformance` permissions restrict the contributing classrooms before the report is calculated.

Teacher transfers and academy departures are separate. A transfer requires continuing academy enrollment with another assigned teacher. An academy departure requires no remaining active, trial or paused academy enrollment and an explicitly recorded withdrawal during the period. An unassigned or ambiguous change is unresolved, rather than an invented departure. Paused students remain retained. Completed courses are a separate positive outcome and are removed from the rate denominator. Corrected import relationships are excluded without removing another legitimate starting enrollment.

Teacher retention is retained students divided by the starting cohort minus completed students. Academy retention also includes teacher transfers. Both rates are unavailable when the denominator is empty or a cohort outcome is unresolved. These figures describe cohorts, not teacher rankings.

The migration starts immutable private observations from the current roster. It does not reconstruct earlier teacher assignments from today's staff profile. A period before the recorded coverage boundary returns incomplete history with no rates. Roster, teacher-assignment and branch changes subsequently append observations. Initial capture refuses busy source tables; it does not change learner statuses or assignments.

Local qualification is separate from production acceptance. The captured-schema proof covers populated and empty cohorts, pauses, transfers, departures, completions, corrections, current class/branch permissions, revocation and expiry during a blocked report. Deployment still requires installed readback and owned production API/browser acceptance.
