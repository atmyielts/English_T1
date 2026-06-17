# Academy LMS Role/Access Matrix

This matrix is the Academy LMS contract. It keeps `/academy/admin`, `/academy/center`,
`/academy/office`, `/academy/teacher`, and `/academy/student` as role lanes instead
of alternate dashboard skins.

Legend:
- `A` = academy-wide access.
- `S` = scoped to assigned classrooms/students.
- `-` = no staff API/workspace access.

| Area | owner/admin | center_admin | manager/counselor | teacher/assistant | student |
|---|---:|---:|---:|---:|---:|
| Contacts | A manage | A manage | A manage | S view | student self only |
| Classrooms | A manage | A manage | A manage | S view | enrolled only |
| Roster | A manage | A manage | A manage | S view via classroom room | enrolled only |
| Assignments | A create/edit | - | - | S create/edit | S submit |
| Gradebook | A grade/export | - | - | S grade/export | own grades |
| Attendance | A mark | - | - | S mark | own attendance |
| Schedule | A manage | A manage | A manage | S manage | own class schedule |
| Staff/admin | A manage | A manage delegated staff | - | - | - |
| Finance/payments | A manage Click tuition | A manage Click tuition | - | - | own billing |
| Offers/entitlements | A manage | A manage | - | - | own access |
| Alerts/messages/announcements | A global/scoped | A global/scoped | A global/scoped | S scoped | own feed/chat |
| Education OS actions | A all | A delegated, no grading/attendance/certificates | A operations, no finance/staff/grading | S learning/attendance | - |

Payment provider note: Academy tuition is Click only. TSPay must not appear in the
Academy payment UI, API actions, or role workflows.

Route lanes:
- `/academy/admin`: owner/admin control, finance, staff, LMS, and Education OS.
- `/academy/center`: delegated center control, finance/offers/staff/roster/schedule,
  and Education OS without direct teacher grading or attendance marking.
- `/academy/office`: manager/counselor operations, contacts, roster, schedule,
  messages, announcements, alerts, reporting, and Education OS.
- `/academy/teacher`: assigned-classroom LMS: assignments, gradebook, attendance,
  schedule, resources, classroom chat, announcements, alerts, and scoped contacts.
- `/academy/student`: enrolled student classroom experience, assignment submission,
  progress, attendance, messages, alerts, and billing.
