import type { IntensiveLevel, IntensiveSkill } from './english-intensive.ts';

export type CurriculumMode = 'reception' | 'production' | 'interaction' | 'mediation';
export type CurriculumOutcome = { mode: CurriculumMode; skill: IntensiveSkill; unit: string; goal: string };

export const curriculumOutcomes: Record<IntensiveLevel, readonly CurriculumOutcome[]> = {
  A1: [
    { mode: 'reception', skill: 'reading', unit: 'the-quiet-corner-sign', goal: 'Find simple directions and rules in two short notices.' },
    { mode: 'production', skill: 'writing', unit: 'aprons-for-the-cooking-room', goal: 'Write a short sign that tells people where to find what they need.' },
    { mode: 'interaction', skill: 'speaking', unit: 'returning-a-sweater', goal: 'Ask to exchange one item and say which item you want to keep.' },
    { mode: 'mediation', skill: 'immersion', unit: 'checking-the-shared-fridge', goal: 'Leave a shelf plan and labels another volunteer can follow.' },
  ],
  A2: [
    { mode: 'reception', skill: 'reading', unit: 'a-windproof-field-class', goal: 'Combine information from a meeting note and an equipment notice.' },
    { mode: 'production', skill: 'writing', unit: 'making-copies-for-the-study-circle', goal: 'Write a short plan that explains what to print after a request changes.' },
    { mode: 'interaction', skill: 'speaking', unit: 'choosing-seats-for-the-screen', goal: 'Discuss two people’s seat preferences and propose a workable choice.' },
    { mode: 'mediation', skill: 'immersion', unit: 'cushions-for-the-story-room', goal: 'Turn a calendar and collection list into an updated plan another person can use.' },
  ],
  B1: [
    { mode: 'reception', skill: 'reading', unit: 'b1-when-the-ice-shapes-changed', goal: 'Rebuild a sequence of events from logs and recognise where evidence is missing.' },
    { mode: 'production', skill: 'writing', unit: 'b1-the-library-trolley-at-three-stops', goal: 'Write a clear procedure from several pieces of route and reservation information.' },
    { mode: 'interaction', skill: 'speaking', unit: 'b1-chess-with-a-thinking-break', goal: 'Explain how to start an activity and adapt your explanations to a newcomer’s questions.' },
    { mode: 'mediation', skill: 'immersion', unit: 'b1-before-the-walkway-opens-litter-survey', goal: 'Turn incomplete observations into a plan another volunteer can carry out.' },
  ],
  B2: [
    { mode: 'reception', skill: 'reading', unit: 'b2-the-two-versions-of-a-meal-voucher', goal: 'Read competing accounts of a process and identify the observations each one leaves out.' },
    { mode: 'production', skill: 'writing', unit: 'b2-write-a-fair-volunteer-reference', goal: 'Write a balanced reference that distinguishes firsthand evidence from unfamiliar work.' },
    { mode: 'interaction', skill: 'speaking', unit: 'b2-before-the-festival-panel-votes', goal: 'Chair a short decision discussion and explain how to handle a conflict of interest.' },
    { mode: 'mediation', skill: 'immersion', unit: 'b2-keep-the-storytellers-own-words', goal: 'Adapt a story for a new audience while protecting its speaker’s intended meaning.' },
  ],
  C1: [
    { mode: 'reception', skill: 'reading', unit: 'c1-one-flight-two-good-landings', goal: 'Identify how two documents use different success criteria and explain their implications.' },
    { mode: 'production', skill: 'writing', unit: 'c1-what-the-correction-has-to-reach', goal: 'Draft a correction that preserves the facts when forwarded through different channels.' },
    { mode: 'interaction', skill: 'speaking', unit: 'c1-who-gets-to-replay-the-point', goal: 'Explain and test an evidence policy against several realistic objections.' },
    { mode: 'mediation', skill: 'immersion', unit: 'c1-the-wall-for-people-passing', goal: 'Use two perspectives to brief a design team and identify a practical way to test its decisions.' },
  ],
  C2: [
    { mode: 'reception', skill: 'reading', unit: 'c2-the-study-that-didnt-repeat', goal: 'Synthesize competing interpretations while preserving uncertainty and attribution.' },
    { mode: 'production', skill: 'writing', unit: 'c2-a-refund-in-two-currencies', goal: 'Write a decision paper that distinguishes nominal value, practical access and future cost.' },
    { mode: 'interaction', skill: 'speaking', unit: 'c2-what-the-smoke-is-allowed-to-mean', goal: 'Negotiate a temporary label and test whether others understand the scope of its claims.' },
    { mode: 'mediation', skill: 'immersion', unit: 'c2-listed-twice', goal: 'Reconcile different ways to find an author without compromising that person’s choice of name.' },
  ],
};
