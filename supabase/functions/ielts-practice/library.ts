type JsonObject = Record<string, unknown>;

export function checkLibraryReading(questions: unknown, answers: unknown) {
  if (!Array.isArray(questions) || !Array.isArray(answers) || answers.length !== questions.length) return null;
  if (answers.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 3)) return null;
  const items = questions.map((question: JsonObject, index) => ({
    correct: answers[index] === question.key,
    key: question.key,
    explanation: question.explanation,
    evidence: question.evidence,
  }));
  return { score: items.filter(item => item.correct).length, total: items.length, items };
}

const inventory = 'slug,skill,track,title,minutes';

export async function practiceLibraryRequest(db: any, method: string, route: string, body?: JsonObject) {
  const resource = () => db.from('ielts_practice_library_sets').select(inventory).eq('is_published', true);
  if (method === 'GET' && route === '/library') {
    const { data, error } = await resource().order('display_order').order('slug').limit(200);
    if (error) throw new Error('Failed to load the IELTS practice library');
    return { status: 200, body: { sets: data ?? [] } };
  }
  const match = /^\/library\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/review)?$/.exec(route);
  if (!match || match[1].length > 100 || (match[2] ? method !== 'POST' : method !== 'GET')) {
    return { status: 404, body: { error: 'Practice set not found' } };
  }
  const { data, error } = await db.from('ielts_practice_library_sets')
    .select(`${inventory},${match[2] ? 'review_content' : 'learner_content'}`)
    .eq('is_published', true).eq('slug', match[1]).maybeSingle();
  if (error) throw new Error('Failed to load the IELTS practice set');
  if (!data) return { status: 404, body: { error: 'Practice set not found' } };
  if (!match[2]) return { status: 200, body: { set: data } };
  if (data.skill === 'reading') {
    const review = checkLibraryReading(data.review_content.questions, body?.answers);
    if (!review) return { status: 422, body: { error: 'Answer each question before checking the set.' } };
    return { status: 200, body: { review } };
  }
  return { status: 200, body: { review: data.review_content } };
}
