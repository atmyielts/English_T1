/**
 * Highlights the learner's saved words in tap-to-translate text (reading
 * texts, the daily story): one CSS rule on the words' data attribute, so the
 * text itself is not re-rendered. Only plain word forms are used.
 */
export const savedWordsStyle = (forms: Iterable<string>, scope = '.rd-passage'): string => {
  const safe = [...forms].filter((form) => /^[a-z]+(?:['-][a-z]+)*$/.test(form)).slice(0, 300);
  if (!safe.length) return '';
  return `${safe.map((form) => `${scope} .tt-w[data-tt="${form}"]`).join(',')}{background:#ecfccb;box-shadow:inset 0 -2px 0 #84cc16;border-radius:3px}`;
};
