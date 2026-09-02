import {
  type AssessmentItem,
  validateAssessmentItems,
} from "./academy-assessment-core.ts";

// Original Schood pilot material. No CEFR cut score, IELTS conversion or validation claim.
const choices: Array<[AssessmentItem["skill"], string, string[], number]> = [
  ["grammar", "My brother ___ at a language center.", [
    "work",
    "works",
    "working",
    "are working",
  ], 1],
  ["grammar", "There ___ any milk left, so we need to buy some.", [
    "is not",
    "are not",
    "does not",
    "have not",
  ], 0],
  ["grammar", "Yesterday we ___ the new students around the building.", [
    "show",
    "have shown",
    "showed",
    "showing",
  ], 2],
  ["grammar", "I have studied here ___ January.", [
    "for",
    "during",
    "from",
    "since",
  ], 3],
  ["grammar", "If the bus is late, I ___ you a message.", [
    "sent",
    "would send",
    "will send",
    "had sent",
  ], 2],
  ["grammar", "This exercise is ___ than the last one.", [
    "more easy",
    "easier",
    "easiest",
    "the easy",
  ], 1],
  ["grammar", "When I arrived, the lesson ___ already started.", [
    "has",
    "was",
    "had",
    "is",
  ], 2],
  ["grammar", "The reports ___ by a second teacher before publication.", [
    "check",
    "are checked",
    "have checking",
    "checking",
  ], 1],
  ["grammar", "If I had more free time, I ___ another language.", [
    "learned",
    "will learn",
    "am learning",
    "would learn",
  ], 3],
  ["grammar", "The teacher asked me where I ___.", [
    "live",
    "did live",
    "lived",
    "am living",
  ], 2],
  ["grammar", "Despite ___ tired, she finished the assignment.", [
    "be",
    "being",
    "was",
    "to be",
  ], 1],
  ["grammar", "Had they checked the timetable, they ___ the earlier train.", [
    "would have caught",
    "will catch",
    "would catch",
    "had caught",
  ], 0],
  [
    "vocabulary",
    "Choose the best word: Please ___ your name at the top of the form.",
    ["write", "say", "speak", "tell"],
    0,
  ],
  ["vocabulary", "A student who arrives on time is ___.", [
    "narrow",
    "punctual",
    "distant",
    "temporary",
  ], 1],
  [
    "vocabulary",
    "Choose the best word: We need to ___ a decision before Friday.",
    ["do", "take up", "make", "give up"],
    2,
  ],
  [
    "vocabulary",
    "The course fee includes materials. This means materials ___.",
    ["cost extra", "are optional", "are unavailable", "are part of the price"],
    3,
  ],
  ["vocabulary", "The evidence was insufficient. There was ___ evidence.", [
    "not enough",
    "too much",
    "unrelated",
    "convincing",
  ], 0],
  [
    "vocabulary",
    "Choose the closest meaning of revise in: The team revised its plan after receiving feedback.",
    [
      "cancelled forever",
      "changed and improved",
      "kept secret",
      "copied exactly",
    ],
    1,
  ],
  [
    "vocabulary",
    "Choose the best word: The two accounts of the event ___ each other; they cannot both be correct.",
    ["support", "resemble", "contradict", "repeat"],
    2,
  ],
  ["vocabulary", "A tentative conclusion should be treated as ___.", [
    "final and certain",
    "irrelevant",
    "deliberately false",
    "provisional",
  ], 3],
];
const passage =
  "The Riverside Learning Center used to open its library only until five in the afternoon. In a survey, many students said they could not visit because their classes ended later. The center therefore tried evening opening for six weeks. Visits increased, but borrowing rose only slightly. Staff noticed that most evening visitors used the quiet desks rather than the books. The director decided to keep the library open later on three weekdays instead of every day. She explained that the trial showed a need for study space, but the center could not yet afford a full evening service. A second survey will ask whether the selected weekdays suit students who also work.";
const reading: Array<[string, string[], number]> = [
  ["Why did students request later opening?", [
    "Books were cheaper in the evening.",
    "Their classes ended after the library closed.",
    "They wanted longer classes.",
    "The building was too busy in the morning.",
  ], 1],
  ["How long did the trial last?", [
    "Three days",
    "Five weeks",
    "Six weeks",
    "One year",
  ], 2],
  ["What did most evening visitors use?", [
    "Quiet study desks",
    "Borrowing machines",
    "Meeting rooms",
    "The book delivery service",
  ], 0],
  ["Which statement is supported by the passage?", [
    "Borrowing doubled.",
    "All students work.",
    "Visits and borrowing increased equally.",
    "More visits did not produce a similar increase in borrowing.",
  ], 3],
  ["Why did the director choose three evenings?", [
    "No one visited on other days.",
    "The center needed to balance student demand and cost.",
    "Teachers opposed the trial.",
    "The survey required three evenings.",
  ], 1],
  ["What remains uncertain?", [
    "Whether the center has a library",
    "Whether students can borrow books",
    "Whether the chosen weekdays suit working students",
    "Whether the trial has ended",
  ], 2],
];
const script =
  "Read twice at a natural, clear pace, with a short pause between readings. Do not show this text to candidates. “Here is the update for Saturday’s study visit. We will meet outside the center at quarter past eight, not half past eight as originally planned. The coach will leave at eight thirty. Bring a notebook and a bottle of water. Lunch is included, but you may want money for a snack. We were going to visit the science museum first; however, that building is closed for repairs. Instead, we will start at the university library. If you have not returned your permission form, give it to Ms Karim by Thursday afternoon. We expect to be back at the center by five, although heavy traffic could make us a little late.”";
const listening: Array<[string, string[], number]> = [
  ["Listen to the teacher. What time should students meet?", [
    "8:15",
    "8:30",
    "8:45",
    "9:00",
  ], 0],
  ["What should students bring?", [
    "A packed lunch",
    "A library card",
    "A notebook and water",
    "Sports equipment",
  ], 2],
  [
    "Which cost is included?",
    ["Snacks", "Lunch", "New notebooks", "Shopping"],
    1,
  ],
  ["Where will the group go first?", [
    "The science museum",
    "The train station",
    "The sports center",
    "The university library",
  ], 3],
  ["When must permission forms be returned?", [
    "Saturday morning",
    "Friday evening",
    "Thursday afternoon",
    "After the visit",
  ], 2],
  ["Why might the return be delayed?", [
    "Traffic",
    "An extra class",
    "Missing permission forms",
    "A longer lunch",
  ], 0],
];
export function diagnosticStarter() {
  const items: unknown[] = choices.map((
    [skill, prompt, options, correct],
    i,
  ) => ({
    id: `starter-${i + 1}`,
    skill,
    kind: "choice",
    prompt,
    options,
    correct,
    points: 1,
  }));
  reading.forEach(([prompt, options, correct], i) =>
    items.push({
      id: `reading-${i + 1}`,
      skill: "reading",
      kind: "choice",
      prompt,
      passage,
      options,
      correct,
      points: 1,
    })
  );
  listening.forEach(([prompt, options, correct], i) =>
    items.push({
      id: `listening-${i + 1}`,
      skill: "listening",
      kind: "choice",
      prompt,
      listening_script: script,
      options,
      correct,
      points: 1,
    })
  );
  items.push({
    id: "writing",
    skill: "writing",
    kind: "written",
    points: 12,
    prompt:
      "Your learning center is deciding between a quiet study room and a conversation club. Write a message to the director explaining which would help students more and why. Include one possible disadvantage of your choice and suggest how to address it. Aim for 120–180 words; communicate as much as you can even if you cannot reach that length.",
    rubric:
      "Award 0–3 in each of four areas, then add the marks (maximum 12): task fulfilment; organization and linking; vocabulary range and appropriacy; grammatical control. 0 = no usable evidence, 1 = limited communication with frequent difficulty, 2 = mostly clear communication with some limitations, 3 = clear developed communication appropriate to the task. Cite specific examples for each area in review notes. Do not turn these points into an IELTS band or CEFR level.",
  }, {
    id: "speaking",
    skill: "speaking",
    kind: "interview",
    points: 12,
    prompt:
      "Speak with your teacher after the written tasks. You will talk about your learning routine, describe a useful learning experience, and discuss a choice for your center. Your teacher will record observations; you do not need to type an answer here.",
    rubric:
      "Conduct a 6–8 minute interview: 1) Ask about the learner’s routine and reasons for studying. 2) Give one minute to prepare a description of a time they learned something difficult, then let them speak for up to two minutes. 3) Ask whether a center should prioritize quiet study space or conversation activities, and follow up on their reasons. Award 0–3 for each: fluency/coherence, vocabulary, grammatical control, intelligibility (maximum 12). 0 = no usable evidence; 1 = frequent communication difficulty; 2 = generally understandable with limitations; 3 = clear sustained communication. Note actual examples. This is not an IELTS or CEFR scoring scale.",
  });
  return {
    title: "Schood English intake — pilot paper 1",
    duration_minutes: 75,
    items: validateAssessmentItems(items),
  };
}
