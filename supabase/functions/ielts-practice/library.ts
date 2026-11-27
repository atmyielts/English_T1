type JsonObject = Record<string, unknown>;

const normaliseAnswer = (value: string) => value.normalize('NFC').trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase();

export function checkLibraryReading(questions: unknown, answers: unknown, learnerQuestions: unknown) {
  if (!Array.isArray(questions) || !questions.length || !Array.isArray(answers) || answers.length !== questions.length
    || !Array.isArray(learnerQuestions) || learnerQuestions.length !== questions.length) return null;
  const valid = answers.every((answer: unknown, index) => {
    const options = learnerQuestions[index]?.options;
    if (Array.isArray(options)) {
      return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < options.length;
    }
    return typeof answer === 'string' && answer.length <= 80 && normaliseAnswer(answer) !== '';
  });
  if (!valid) return null;
  const items = questions.map((question: JsonObject, index) => ({
    correct: typeof answers[index] === 'string' && Array.isArray(question.key)
      ? question.key.some(key => typeof key === 'string' && normaliseAnswer(answers[index]) === normaliseAnswer(key))
      : answers[index] === question.key,
    key: question.key,
    explanation: question.explanation,
    evidence: question.evidence,
  }));
  return { score: items.filter(item => item.correct).length, total: items.length, items };
}

const inventory = 'slug,skill,track,title,minutes';

async function listAll<T>(fetchPage: (first: number, last: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const pageSize = 200;
  const rows: T[] = [];
  for (let first = 0; ; first += pageSize) {
    const { data, error } = await fetchPage(first, first + pageSize - 1);
    if (error || !data) throw new Error('Failed to load the IELTS practice library');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function practiceLibraryRequest(db: any, userId: string, method: string, route: string, body?: JsonObject, responseFormatVersion = 1) {
  const published = (fields: string) => db.from('ielts_practice_library_sets').select(fields)
    .eq('is_published', true).lte('response_format_version', responseFormatVersion);
  if (method === 'GET' && route === '/library') {
    const [sets, progress] = await Promise.all([
      listAll<{ slug: string }>((first, last) =>
        published(inventory).order('display_order').order('slug').range(first, last)),
      listAll<{ set_slug: string }>((first, last) =>
        db.from('ielts_practice_library_progress').select('set_slug,reviewed_at,best_correct,question_total')
          .eq('user_id', userId).order('set_slug').range(first, last)),
    ]);
    const bySlug = new Map(progress.map(({ set_slug, ...rest }) => [set_slug, rest]));
    return { status: 200, body: { sets: sets.map(set => ({ ...set, progress: bySlug.get(set.slug) ?? null })) } };
  }
  const match = /^\/library\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/review)?$/.exec(route);
  if (!match || match[1].length > 100 || (match[2] ? method !== 'POST' : method !== 'GET')) {
    return { status: 404, body: { error: 'Practice set not found' } };
  }
  const { data, error } = await published(`${inventory},learner_content${match[2] ? ',review_content' : ''}`)
    .eq('slug', match[1]).maybeSingle();
  if (error) throw new Error('Failed to load the IELTS practice set');
  if (!data) return { status: 404, body: { error: 'Practice set not found' } };
  if (!match[2]) return { status: 200, body: { set: data } };
  const graded = data.skill === 'reading'
    ? checkLibraryReading(data.review_content.questions, body?.answers, data.learner_content.questions)
    : null;
  if (data.skill === 'reading' && !graded) return { status: 422, body: { error: 'Answer each question before checking the set.' } };
  const { error: writeError } = await db.rpc('record_ielts_practice_library_review', {
    p_user_id: userId, p_set_slug: match[1], p_correct: graded?.score ?? null, p_total: graded?.total ?? null,
  });
  if (writeError) throw new Error('Failed to record IELTS practice progress');
  return { status: 200, body: { review: graded ?? data.review_content } };
}
