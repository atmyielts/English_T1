/** English strings for the goal date plan (Today card, Progress panel, Settings,
 * onboarding date step). Russian and Uzbek files use the same keys. */
export const goalEn: Record<string, string> = {
  // Status
  'goalPlan.status.no_level': 'No level yet',
  'goalPlan.status.reached': 'Reached',
  'goalPlan.status.no_date': 'No date set',
  'goalPlan.status.date_passed': 'Date passed',
  'goalPlan.status.not_enough_data': 'Not enough data yet',
  'goalPlan.status.on_track': 'On track',
  'goalPlan.status.slightly_behind': 'A little behind',
  'goalPlan.status.behind': 'Behind',

  // Goal line
  'goalPlan.targetBy': '{level} by {date}',
  'goalPlan.targetNoDate': '{level} · no date yet',
  'goalPlan.noTarget': 'No target level yet',

  // One-line advice
  'goalPlan.advice.no_level': 'Take the level test so we can plan your goal.',
  'goalPlan.advice.noTarget': 'Choose a target level and a date to see your plan.',
  'goalPlan.advice.no_date': 'Set a date for {level} to see how much to practise each week.',
  'goalPlan.advice.reached': 'You have reached {level} in the skills we measured. Time for a new target.',
  'goalPlan.advice.date_passed': 'Your goal date has passed. Pick a new date to keep a plan.',
  'goalPlan.advice.not_enough_data': 'Practise for a week and we will show your pace. Aim for about {minutes} min a week.',
  'goalPlan.advice.not_enough_data_noDate': 'Practise for a week and we will show your pace.',
  'goalPlan.advice.on_track': 'Keep it up: at this pace you reach {level} around {date}.',
  'goalPlan.advice.on_track_soon': 'Keep it up: you are on pace for {level} before your date.',
  'goalPlan.advice.slightly_behind': 'Aim for {minutes} min a week to reach {level} by {date}.',
  'goalPlan.advice.behind': 'You need about {minutes} min a week. Try {daily} min a day.',
  'goalPlan.advice.behind_noDaily': 'You need about {minutes} min a week to reach {level} by {date}.',
  'goalPlan.advice.check': 'You have practised about the hours we estimated. Take a level check to see if you have moved up.',

  // Actions
  'goalPlan.cta.setDate': 'Set a date',
  'goalPlan.cta.newDate': 'Pick a new date',
  'goalPlan.cta.newTarget': 'Choose a new target',
  'goalPlan.cta.raiseDaily': 'Raise daily time',
  'goalPlan.cta.change': 'Change goal',
  'goalPlan.cta.check': 'Take the level check',
  'goalPlan.cta.plan': 'See your plan',

  // Today card
  'goalPlan.card.title': 'Your goal',
  'goalPlan.card.week': 'This week: {minutes} of {target} min',
  'goalPlan.card.weekLabel': 'Practice time this week',

  // Progress panel
  'goalPlan.panel.title': 'Goal plan',
  'goalPlan.panel.target': 'Target',
  'goalPlan.panel.hours': 'Study time needed',
  'goalPlan.panel.hoursValue': '{low}–{high} h',
  'goalPlan.panel.hoursHint': 'about {hours} h left',
  'goalPlan.panel.pace': 'Your pace',
  'goalPlan.panel.paceValue': '{minutes} min/week',
  'goalPlan.panel.paceHint': 'average, last 4 weeks',
  'goalPlan.panel.paceNew': 'from your first week',
  'goalPlan.panel.projected': 'You reach it around',
  'goalPlan.panel.projectedNone': 'not yet known',
  'goalPlan.panel.needed': 'To reach {level} by {date}: about {minutes} min a week ({daily} min a day).',
  'goalPlan.panel.doneSince': 'You have practised {hours} h since your last level check.',
  'goalPlan.panel.weeksTitle': 'Minutes per week',
  'goalPlan.panel.weeksLabel': 'Practice minutes in each of the last 8 weeks',
  'goalPlan.panel.weekBar': 'Week of {date}: {minutes} min',
  'goalPlan.panel.targetLine': 'Weekly target: {minutes} min',
  'goalPlan.panel.noPractice': 'No practice in the last 8 weeks yet.',
  'goalPlan.estimateNote': 'Study hours are an estimate based on Cambridge English guided learning hours for each CEFR level, averaged over your skills. Everyone learns at their own speed; your monthly level check keeps the plan honest.',

  // Settings
  'goalPlan.settings.title': 'Goal date',
  'goalPlan.settings.lead': 'Pick the level you want and when you want to reach it. We will turn it into weekly practice time.',
  'goalPlan.settings.level': 'Target level',
  'goalPlan.settings.date': 'Reach it by',
  'goalPlan.settings.clear': 'No date',
  'goalPlan.settings.in3': 'In 3 months',
  'goalPlan.settings.in6': 'In 6 months',
  'goalPlan.settings.in12': 'In 1 year',
  'goalPlan.settings.daily': 'Daily practice time',
  'goalPlan.settings.suggest': 'Your plan needs about {minutes} min a day.',
  'goalPlan.settings.useSuggest': 'Use {minutes} min a day',
  'goalPlan.settings.save': 'Save goal',
  'goalPlan.settings.saved': 'Goal saved.',
  'goalPlan.settings.error': 'We could not save your goal. Please try again.',
  'goalPlan.settings.badDate': 'Choose a date after today and within five years.',

  // Onboarding step
  'goalPlan.onboarding.title': 'When do you want to reach {level}?',
  'goalPlan.onboarding.body': 'Optional. With a date, we show how much to practise each week and whether you are on track.',
  'goalPlan.onboarding.save': 'Start learning',
  'goalPlan.onboarding.skip': 'Skip for now',
};
