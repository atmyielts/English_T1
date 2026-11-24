type PracticeAssignment = {
  id: string;
  level: 'A2' | 'B1' | 'B2' | 'C1';
  assignment_type: 'reading' | 'writing' | 'test';
  title: string;
  description: string;
};

export const practiceAssignments: readonly PracticeAssignment[] = [
  {
    id: 'a2-find-a-time', level: 'A2', assignment_type: 'reading', title: 'Homework · Find a time that works',
    description: `Allow 10 minutes. Read the notice and reply to your friend in 40–60 words.

SWIMMING POOL NOTICE
Beginner practice on Tuesday starts at 16:30. On Thursday it starts at 18:00. New swimmers must check in 15 minutes before practice. Bring a swimming cap. The front desk is closed after 17:50 each day.

Your friend is a new swimmer and finishes class at 17:20 on both days. Which session should you suggest? Give the latest check-in time and say what to bring. Explain why the other session cannot work.

Before submitting, check that your suggested arrival time follows both the check-in rule and the desk hours.`,
  },
  {
    id: 'a2-find-a-time-check', level: 'A2', assignment_type: 'test', title: 'Follow-up quiz · Plan a visit',
    description: `Allow 8 minutes. Read the museum message and answer the three questions in full sentences.

MUSEUM GROUP VISITS
Free tours are at 11:00 and 13:30 on Sunday. Meet the guide 10 minutes before the tour at the side entrance. The side entrance closes to visitors at 13:25. A student card is needed for the free entry ticket. Your bus gets to the museum at 12:50.

1. Which tour can you join, and why?
2. What is the latest time you should be at the side entrance?
3. What should you show for the free ticket?`,
  },
  {
    id: 'b1-request-a-change', level: 'B1', assignment_type: 'writing', title: 'Homework · Ask to change a booking',
    description: `Allow 15 minutes. Write an email of 80–110 words to the manager of a community centre.

Your group booked Room 2 for a Tuesday 19:00 rehearsal. A bus timetable change means two members cannot arrive before 19:30. The centre closes at 20:30 on Tuesdays. You need one full hour. The centre has also offered Room 1 at 18:30 on Wednesday, when all members can come.

Identify the original booking, briefly explain the problem, request one workable option, and ask the manager to confirm availability. Use a polite subject line and a closing.`,
  },
  {
    id: 'b1-request-a-change-check', level: 'B1', assignment_type: 'test', title: 'Follow-up quiz · Change a delivery',
    description: `Allow 12 minutes. Write a 70–100 word message to a stationery supplier about order 1086.

The order is due Monday between 9:00 and 11:00. The office will be empty until noon. The supplier can try again any morning, or deliver on Wednesday between 13:00 and 15:00 at no extra cost. Your team needs the supplies by Thursday morning and nobody can receive them before 12:00 any day this week.

Identify the order, explain the conflict, select a workable window, and ask for written confirmation.`,
  },
  {
    id: 'b2-compare-change', level: 'B2', assignment_type: 'writing', title: 'Homework · Compare change in a table',
    description: `Allow 20 minutes. Write a 130–160 word summary of the data below. Give a clear overview and support it with comparisons. Use percentage points when comparing percentages.

Share of lessons attended online
North Campus: 2023 18%, 2025 33%
West Campus: 2023 41%, 2025 38%
South Campus: 2023 27%, 2025 46%

Report how the ranking changed, which campus had the largest rise, and which moved in the opposite direction. Support the comparison with figures. The table gives no reasons for the changes.`,
  },
  {
    id: 'b2-compare-change-check', level: 'B2', assignment_type: 'test', title: 'Follow-up quiz · Describe survey figures',
    description: `Allow 12 minutes. Write a two-sentence overview, then one supporting comparison using exact values.

Share of households that used a repair service during the year
East district: 2022 12%, 2024 25%
River district: 2022 30%, 2024 24%
Hill district: 2022 18%, 2024 41%

Identify the overall pattern and the exception. State which district changed the most in percentage points, and report the starting and ending percentages.`,
  },
  {
    id: 'c1-test-a-claim', level: 'C1', assignment_type: 'writing', title: 'Homework · Test an evidence claim',
    description: `Allow 18 minutes. Write a 120–150 word note to the college reading committee.

Claim: keeping the library open until 22:00 will improve first-year grades. In a one-week pilot, 38 students entered after 20:00 on three evenings. In an opt-in survey, 21 of 26 respondents said they found the extra hours helpful. Staff did not measure grades or know how many eligible students saw the survey.

Separate the evidence about use and perceived value from the claim about grades. Identify one limitation and recommend a realistic next measurement. Cite two details from the brief.`,
  },
  {
    id: 'c1-test-a-claim-check', level: 'C1', assignment_type: 'test', title: 'Follow-up quiz · Qualify a recommendation',
    description: `Allow 12 minutes. Write a 90–120 word recommendation for a student support team.

A pilot offered free evening writing clinics for two weeks. Thirty students booked a session and eighteen attended. All fourteen students who answered the feedback form said they felt more confident about their next assignment. No writing samples were collected and non-attendees did not receive the survey.

State what the pilot shows, qualify one tempting claim about skill improvement, and name one feasible comparison or measurement for a future pilot. Use the figures accurately.`,
  },
];
